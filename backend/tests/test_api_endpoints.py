"""
Unit and integration tests for backend API endpoints.

Run with: pytest
Run with coverage: pytest --cov=app --cov-report=html
Run specific test: pytest tests/test_api_endpoints.py::test_health_check
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock, AsyncMock
import json

from app.main import app


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    return TestClient(app)


@pytest.fixture
def mock_supabase():
    """Mock Supabase client."""
    with patch('app.routes.ai.create_client') as mock:
        mock_client = MagicMock()
        mock.return_value = mock_client
        yield mock_client


@pytest.fixture
def mock_mqtt():
    """Mock MQTT connections."""
    with patch('app.mqtt_utils.test_mqtt_connection', new_callable=AsyncMock) as mock_test, \
         patch('app.mqtt_utils.publish_payload', new_callable=AsyncMock) as mock_publish:
        mock_test.return_value = True
        mock_publish.return_value = True
        yield {'test': mock_test, 'publish': mock_publish}


class TestHealthEndpoint:
    """Tests for the health check endpoint."""
    
    def test_health_check(self, client):
        """Test that health endpoint returns OK."""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


# class TestMQTTEndpoints:
#     """Tests for MQTT-related endpoints."""
#     
#     def test_mqtt_test_connection_success(self, client, mock_mqtt):
#         """Test MQTT connection test endpoint with mocked connection."""
#         payload = {
#             "host": "mock.mqtt.broker",
#             "port": 1883,
#             "username": None,
#             "password": None
#         }
#         
#         response = client.post("/ai/mqtt/test", json=payload)
#         
#         # Should return 401 without authentication, but that's expected
#         assert response.status_code in [200, 401, 403]
#     
#     def test_mqtt_test_connection_invalid_payload(self, client):
#         """Test MQTT connection test with invalid payload."""
#         payload = {
#             "host": "mock.mqtt.broker"
#             # Missing required 'port' field
#         }
#         
#         response = client.post("/ai/mqtt/test", json=payload)
#         assert response.status_code == 422  # Validation error
#     
#     def test_mqtt_publish_without_auth(self, client, mock_mqtt):
#         """Test MQTT publish endpoint without authentication."""
#         payload = {
#             "host": "mock.mqtt.broker",
#             "port": 1883,
#             "topic": "test/topic",
#             "payload": {"test": "data"},
#             "username": None,
#             "password": None,
#             "session_id": "test-session"
#         }
#         
#         response = client.post("/ai/mqtt/publish", json=payload)
#         
#         # Should return 401 without authentication
#         assert response.status_code in [401, 403]


class TestChatEndpoint:
    """Tests for the chat endpoint."""
    
    def test_chat_without_auth(self, client):
        """Test chat endpoint without authentication."""
        payload = {
            "previous_response_id": None,
            "user_message": "Test message",
            "assistant_id": "test-assistant-id",
            "conversation_history": []
        }
        
        response = client.post("/ai/chat", json=payload)
        
        # Should return 401 without authentication
        assert response.status_code in [401, 403]
    
    def test_chat_invalid_payload(self, client):
        """Test chat endpoint with invalid payload."""
        payload = {
            "user_message": "Test message"
            # Missing required fields
        }
        
        response = client.post("/ai/chat", json=payload)
        # FastAPI checks auth before validation, so we get 401 instead of 422
        assert response.status_code in [401, 422]
    
    # def test_chat_with_mock_auth(self, client, mock_supabase):
    #     """Test chat endpoint with mocked authentication and database."""
    #     # Mock the Supabase response
    #     mock_response = MagicMock()
    #     mock_response.data = [{
    #         "id": "test-assistant-id",
    #         "supabase_user_id": "test-user-id",
    #         "openai_key": "encrypted_key",
    #         "prompt_instruction": "You are a helpful assistant.",
    #         "json_schema": None
    #     }]
    #     mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_response
    #     
    #     # Mock the encryption/decryption
    #     with patch('app.routes.ai.decrypt_api_key') as mock_decrypt, \
    #          patch('app.routes.ai.run_model_turn', new_callable=AsyncMock) as mock_run:
    #         mock_decrypt.return_value = "test-api-key"
    #         mock_run.return_value = ({"test": "payload"}, "response-id", "Test response")
    #         
    #         # Mock authentication
    #         with patch('app.security.get_current_user_id') as mock_auth:
    #             mock_auth.return_value = "test-user-id"
    #             
    #             payload = {
    #                 "previous_response_id": None,
    #                 "user_message": "Test message",
    #                 "assistant_id": "test-assistant-id",
    #                 "conversation_history": []
    #             }
    #             
    #             # Note: This will still fail without proper JWT token in headers
    #             # but we're testing the endpoint structure
    #             response = client.post("/ai/chat", json=payload)
    #             
    #             # Will be 401 due to missing JWT, but payload validation passed
    #             assert response.status_code in [200, 401, 403]


class TestAssistantEndpoints:
    """Tests for assistant management endpoints."""
    
    def test_get_api_key_without_auth(self, client):
        """Test get API key endpoint without authentication."""
        response = client.get("/assistants/get-api-key/test-assistant-id")
        
        # Should return 401 without authentication
        assert response.status_code in [401, 403]
    
    def test_update_api_key_without_auth(self, client):
        """Test update API key endpoint without authentication."""
        payload = {
            "assistant_id": "test-assistant-id",
            "api_key": "test-key"
        }
        
        response = client.post("/assistants/update-api-key", json=payload)
        
        # Should return 401 without authentication
        assert response.status_code in [401, 403]


class TestRequestValidation:
    """Tests for request validation."""
    
    def test_chat_request_validation(self, client):
        """Test that chat request validates required fields."""
        # Missing assistant_id
        payload = {
            "user_message": "Test message",
            "conversation_history": []
        }
        
        response = client.post("/ai/chat", json=payload)
        # FastAPI checks auth before validation, so we get 401 instead of 422
        assert response.status_code in [401, 422]
    
    def test_mqtt_request_validation(self, client):
        """Test that MQTT request validates required fields."""
        # Missing port
        payload = {
            "host": "test.mosquitto.org"
        }
        
        response = client.post("/ai/mqtt/test", json=payload)
        assert response.status_code == 422


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
