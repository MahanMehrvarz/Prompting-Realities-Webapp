"""
Tests for image attachments on POST /ai/chat.

OpenAI, Supabase and key decryption are all mocked, so these run offline.
Run with: pytest tests/test_chat_images.py
"""

import asyncio
import base64
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routes import ai as ai_routes
from app.conversation_service import run_model_turn

# Smallest thing the endpoint accepts: JPEG magic bytes plus padding.
JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 64
JPEG_DATA_URL = "data:image/jpeg;base64," + base64.b64encode(JPEG_BYTES).decode()


@pytest.fixture
def client():
    return TestClient(app)


def _fake_supabase(allow_images: bool) -> MagicMock:
    """A Supabase client whose assistants lookup returns one configured row."""
    supabase = MagicMock()
    assistant = {
        "id": "assistant-1",
        "name": "Lamp",
        "openai_key": "encrypted",
        "prompt_instruction": "You are a lamp.",
        "json_schema": None,
        "allow_images": allow_images,
    }
    supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[assistant]
    )
    return supabase


@pytest.fixture
def chat_env():
    """Patch everything /ai/chat touches outside the process."""

    def _make(allow_images: bool, turn=None):
        supabase = _fake_supabase(allow_images)
        turn_mock = turn or AsyncMock(return_value=({"response": "A red mug."}, "resp_1", "A red mug."))
        patches = [
            patch("app.config.get_supabase_client", return_value=supabase),
            patch("app.encryption.decrypt_api_key", return_value="sk-test"),
            patch.object(ai_routes, "run_assistant_turn", turn_mock),
        ]
        for p in patches:
            p.start()
        return supabase, turn_mock, patches

    started = []

    def factory(allow_images: bool, turn=None):
        supabase, turn_mock, patches = _make(allow_images, turn)
        started.extend(patches)
        return supabase, turn_mock

    yield factory
    for p in started:
        p.stop()


def _body(**overrides):
    body = {
        "previous_response_id": None,
        "user_message": "What colour is the mug?",
        "assistant_id": "assistant-1",
        "session_id": "session-1",
        "thread_id": "thread-1",
        "image_data_url": JPEG_DATA_URL,
    }
    body.update(overrides)
    return body


class TestChatWithImage:
    def test_image_is_forwarded_and_stored(self, client, chat_env):
        supabase, turn_mock = chat_env(allow_images=True)

        response = client.post("/ai/chat", json=_body())

        assert response.status_code == 200
        data = response.json()
        assert data["display_text"] == "A red mug."
        assert data["image_path"].startswith("session-1/thread-1/")
        assert data["image_path"].endswith(".jpg")

        assert turn_mock.await_args.kwargs["image_data_url"] == JPEG_DATA_URL

        supabase.storage.from_.assert_called_with("chat-images")
        path, stored_bytes, options = supabase.storage.from_.return_value.upload.call_args.args
        assert path == data["image_path"]
        assert stored_bytes == JPEG_BYTES
        assert options == {"content-type": "image/jpeg"}

    def test_rejected_when_assistant_does_not_allow_images(self, client, chat_env):
        supabase, turn_mock = chat_env(allow_images=False)

        response = client.post("/ai/chat", json=_body())

        assert response.status_code == 403
        turn_mock.assert_not_awaited()
        supabase.storage.from_.return_value.upload.assert_not_called()

    @pytest.mark.parametrize(
        "image_data_url",
        [
            "data:image/png;base64," + base64.b64encode(b"\x89PNG....").decode(),
            "data:image/jpeg;base64,not base64!!",
            "data:image/jpeg;base64," + base64.b64encode(b"not a jpeg").decode(),
            "https://example.com/cat.jpg",
        ],
    )
    def test_invalid_image_is_rejected(self, client, chat_env, image_data_url):
        _, turn_mock = chat_env(allow_images=True)

        response = client.post("/ai/chat", json=_body(image_data_url=image_data_url))

        assert response.status_code == 400
        turn_mock.assert_not_awaited()

    def test_oversized_image_is_rejected(self, client, chat_env):
        _, turn_mock = chat_env(allow_images=True)
        big = b"\xff\xd8\xff" + b"\x00" * (ai_routes.CHAT_IMAGE_MAX_BYTES + 1)

        response = client.post(
            "/ai/chat",
            json=_body(image_data_url="data:image/jpeg;base64," + base64.b64encode(big).decode()),
        )

        assert response.status_code == 413
        turn_mock.assert_not_awaited()

    def test_model_failure_on_image_turn_is_reported(self, client, chat_env):
        failing_turn = AsyncMock(side_effect=RuntimeError("unsupported image"))
        supabase, _ = chat_env(allow_images=True, turn=failing_turn)

        response = client.post("/ai/chat", json=_body())

        assert response.status_code == 502
        assert "unsupported image" in response.json()["detail"]
        supabase.storage.from_.return_value.upload.assert_not_called()

    def test_storage_failure_does_not_fail_the_turn(self, client, chat_env):
        supabase, _ = chat_env(allow_images=True)
        supabase.storage.from_.return_value.upload.side_effect = RuntimeError("bucket missing")

        response = client.post("/ai/chat", json=_body())

        assert response.status_code == 200
        assert response.json()["image_path"] is None

    def test_text_turn_is_unchanged(self, client, chat_env):
        supabase, turn_mock = chat_env(allow_images=False)

        response = client.post("/ai/chat", json=_body(image_data_url=None))

        assert response.status_code == 200
        assert response.json()["image_path"] is None
        assert turn_mock.await_args.kwargs["image_data_url"] is None
        supabase.storage.from_.return_value.upload.assert_not_called()


class TestRunModelTurnImage:
    def _fake_openai(self, create):
        client = MagicMock()
        client.responses.create = create
        return client

    def test_image_part_is_added_to_the_user_content(self):
        create = MagicMock(return_value=SimpleNamespace(id="resp_1", output=[]))
        with patch("app.conversation_service.OpenAI", return_value=self._fake_openai(create)):
            asyncio.run(run_model_turn(None, "What is this?", "sk-test", image_data_url=JPEG_DATA_URL))

        content = create.call_args.kwargs["input"][0]["content"]
        assert content == [
            {"type": "input_text", "text": "What is this?"},
            {"type": "input_image", "image_url": JPEG_DATA_URL},
        ]

    def test_text_only_input_is_unchanged(self):
        create = MagicMock(return_value=SimpleNamespace(id="resp_1", output=[]))
        with patch("app.conversation_service.OpenAI", return_value=self._fake_openai(create)):
            asyncio.run(run_model_turn(None, "Hello", "sk-test"))

        assert create.call_args.kwargs["input"][0]["content"] == [{"type": "input_text", "text": "Hello"}]

    def test_error_is_swallowed_by_default_and_raised_on_request(self):
        create = MagicMock(side_effect=RuntimeError("boom"))
        with patch("app.conversation_service.OpenAI", return_value=self._fake_openai(create)):
            payload, response_id, _ = asyncio.run(run_model_turn("resp_0", "Hello", "sk-test"))
            assert response_id == "resp_0"
            assert payload == {"response": "An error occurred while processing your request"}

            with pytest.raises(RuntimeError):
                asyncio.run(run_model_turn("resp_0", "Hello", "sk-test", raise_on_error=True))
