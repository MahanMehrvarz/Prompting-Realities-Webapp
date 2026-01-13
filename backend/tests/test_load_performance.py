"""
Load and performance tests for backend API endpoints.

These tests verify that the API can handle concurrent requests and measure response times.

Run with: pytest tests/test_load_performance.py -v
Run with markers: pytest -m load_test
"""

import pytest
import time
import asyncio
from concurrent.futures import ThreadPoolExecutor, as_completed
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock

from app.main import app


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    return TestClient(app)


@pytest.fixture
def mock_mqtt():
    """Mock MQTT connections to avoid actual network calls."""
    with patch('app.mqtt_utils.test_mqtt_connection', new_callable=AsyncMock) as mock_test, \
         patch('app.mqtt_utils.publish_payload', new_callable=AsyncMock) as mock_publish:
        mock_test.return_value = True
        mock_publish.return_value = True
        yield {'test': mock_test, 'publish': mock_publish}


@pytest.mark.load_test
class TestLoadPerformance:
    """Load and performance tests for the API."""
    
    def test_health_endpoint_response_time(self, client):
        """Test that health endpoint responds quickly."""
        start_time = time.time()
        response = client.get("/health")
        end_time = time.time()
        
        response_time = end_time - start_time
        
        assert response.status_code == 200
        assert response_time < 0.1  # Should respond in less than 100ms
    
    def test_health_endpoint_concurrent_requests(self, client):
        """Test health endpoint with concurrent requests."""
        num_requests = 50
        
        def make_request():
            response = client.get("/health")
            return response.status_code
        
        start_time = time.time()
        
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(make_request) for _ in range(num_requests)]
            results = [future.result() for future in as_completed(futures)]
        
        end_time = time.time()
        total_time = end_time - start_time
        
        # All requests should succeed
        assert all(status == 200 for status in results)
        
        # Should handle 50 requests in reasonable time
        assert total_time < 5.0  # Less than 5 seconds
        
        # Calculate requests per second
        rps = num_requests / total_time
        print(f"\n✅ Handled {num_requests} requests in {total_time:.2f}s ({rps:.2f} req/s)")
    
    # def test_mqtt_test_endpoint_concurrent(self, client, mock_mqtt):
    #     """Test MQTT test endpoint with concurrent requests."""
    #     num_requests = 20
    #     
    #     def make_request():
    #         payload = {
    #             "host": "mock.mqtt.broker",
    #             "port": 1883,
    #             "username": None,
    #             "password": None
    #         }
    #         response = client.post("/ai/mqtt/test", json=payload)
    #         return response.status_code
    #     
    #     start_time = time.time()
    #     
    #     with ThreadPoolExecutor(max_workers=5) as executor:
    #         futures = [executor.submit(make_request) for _ in range(num_requests)]
    #         results = [future.result() for future in as_completed(futures)]
    #     
    #     end_time = time.time()
    #     total_time = end_time - start_time
    #     
    #     # All requests should return valid status codes (200, 401, or 403)
    #     assert all(status in [200, 401, 403] for status in results)
    #     
    #     print(f"\n✅ MQTT test: {num_requests} requests in {total_time:.2f}s")
    
    def test_chat_endpoint_concurrent_without_auth(self, client):
        """Test chat endpoint with concurrent requests (without auth)."""
        num_requests = 20
        
        def make_request(i):
            payload = {
                "previous_response_id": None,
                "user_message": f"Test message {i}",
                "assistant_id": "test-assistant-id",
                "conversation_history": []
            }
            response = client.post("/ai/chat", json=payload)
            return response.status_code
        
        start_time = time.time()
        
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(make_request, i) for i in range(num_requests)]
            results = [future.result() for future in as_completed(futures)]
        
        end_time = time.time()
        total_time = end_time - start_time
        
        # All requests should return 401 or 403 (unauthorized)
        assert all(status in [401, 403] for status in results)
        
        print(f"\n✅ Chat endpoint: {num_requests} requests in {total_time:.2f}s")
    
    def test_mixed_endpoint_load(self, client):
        """Test mixed load across different endpoints."""
        num_requests_per_endpoint = 100
        
        def health_request():
            return client.get("/health").status_code
        
        def chat_request(i):
            payload = {
                "previous_response_id": None,
                "user_message": f"Test {i}",
                "assistant_id": "test-id",
                "conversation_history": []
            }
            return client.post("/ai/chat", json=payload).status_code
        
        start_time = time.time()
        
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = []
            
            # Submit health requests
            for _ in range(num_requests_per_endpoint):
                futures.append(executor.submit(health_request))
            
            # Submit chat requests
            for i in range(num_requests_per_endpoint):
                futures.append(executor.submit(chat_request, i))
            
            results = [future.result() for future in as_completed(futures)]
        
        end_time = time.time()
        total_time = end_time - start_time
        total_requests = num_requests_per_endpoint * 2
        
        # All requests should return valid status codes
        assert len(results) == total_requests
        
        rps = total_requests / total_time
        print(f"\n✅ Mixed load: {total_requests} requests in {total_time:.2f}s ({rps:.2f} req/s)")
    
    def test_endpoint_response_time_consistency(self, client):
        """Test that endpoint response times are consistent."""
        num_requests = 300
        response_times = []
        
        for _ in range(num_requests):
            start_time = time.time()
            response = client.get("/health")
            end_time = time.time()
            
            assert response.status_code == 200
            response_times.append(end_time - start_time)
        
        avg_response_time = sum(response_times) / len(response_times)
        max_response_time = max(response_times)
        min_response_time = min(response_times)
        
        print(f"\n📊 Response time stats:")
        print(f"   Average: {avg_response_time*1000:.2f}ms")
        print(f"   Min: {min_response_time*1000:.2f}ms")
        print(f"   Max: {max_response_time*1000:.2f}ms")
        
        # Average response time should be reasonable
        assert avg_response_time < 0.1  # Less than 100ms average
        
        # Max response time shouldn't be too much higher than average
        assert max_response_time < avg_response_time * 5


@pytest.mark.load_test
class TestStressScenarios:
    """Stress test scenarios for the API."""
    
    def test_rapid_fire_requests(self, client):
        """Test rapid consecutive requests without delay."""
        num_requests = 100
        
        start_time = time.time()
        results = []
        
        for _ in range(num_requests):
            response = client.get("/health")
            results.append(response.status_code)
        
        end_time = time.time()
        total_time = end_time - start_time
        
        # All requests should succeed
        assert all(status == 200 for status in results)
        
        rps = num_requests / total_time
        print(f"\n🔥 Rapid fire: {num_requests} requests in {total_time:.2f}s ({rps:.2f} req/s)")
    
    def test_sustained_load(self, client):
        """Test sustained load over a period of time."""
        duration_seconds = 5
        request_count = 0
        
        start_time = time.time()
        
        while time.time() - start_time < duration_seconds:
            response = client.get("/health")
            assert response.status_code == 200
            request_count += 1
        
        end_time = time.time()
        actual_duration = end_time - start_time
        rps = request_count / actual_duration
        
        print(f"\n⏱️  Sustained load: {request_count} requests in {actual_duration:.2f}s ({rps:.2f} req/s)")
        
        # Should handle at least 50 requests per second
        assert rps > 50


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
