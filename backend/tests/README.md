# Backend Testing Suite

This directory contains comprehensive tests for the Prompting Realities backend API, including unit tests, integration tests, and load/performance tests.

## Test Structure

```
tests/
├── __init__.py                    # Package initialization
├── pytest.ini                     # Pytest configuration
├── test_api_endpoints.py          # Unit and integration tests for API endpoints
├── test_load_performance.py       # Load and performance tests
└── README.md                      # This file
```

## Prerequisites

Install the testing dependencies:

```bash
cd backend
pip install -r requirements.txt
```

This will install:
- `pytest` - Testing framework
- `pytest-asyncio` - Async test support
- `pytest-cov` - Code coverage reporting
- `httpx` - HTTP client for FastAPI TestClient

## Running Tests

### Run All Tests

```bash
# From the backend directory
cd backend
pytest tests/

# Or from the tests directory
cd backend/tests
pytest
```

### Run Specific Test Files

```bash
# Run only unit/integration tests
pytest tests/test_api_endpoints.py

# Run only load/performance tests
pytest tests/test_load_performance.py
```

### Run Specific Test Classes or Functions

```bash
# Run a specific test class
pytest tests/test_api_endpoints.py::TestHealthEndpoint

# Run a specific test function
pytest tests/test_api_endpoints.py::TestHealthEndpoint::test_health_check
```

### Run Tests by Marker

```bash
# Run only load tests
pytest -m load_test

# Run all tests except load tests
pytest -m "not load_test"
```

### Run with Verbose Output

```bash
# Show detailed output
pytest -v

# Show print statements
pytest -s

# Both verbose and print statements
pytest -v -s
```

### Run with Code Coverage

```bash
# Generate coverage report
pytest --cov=app --cov-report=html

# View the report
# Open htmlcov/index.html in your browser
```

## Test Categories

### Unit Tests (`test_api_endpoints.py`)

Tests individual API endpoints with mocked dependencies:

- **Health Endpoint**: Basic health check functionality
- **MQTT Endpoints**: Connection testing and publishing (with mocked MQTT)
- **Chat Endpoint**: OpenAI chat integration (with mocked auth and database)
- **Assistant Endpoints**: API key management
- **Request Validation**: Input validation and error handling

### Load/Performance Tests (`test_load_performance.py`)

Tests API performance under load:

- **Response Time Tests**: Verify endpoints respond quickly
- **Concurrent Request Tests**: Test handling of simultaneous requests
- **Mixed Load Tests**: Simulate realistic traffic patterns
- **Stress Tests**: Push the API to its limits

## Test Configuration

The `pytest.ini` file contains test configuration:

- Test discovery patterns
- Test markers for categorization
- Output formatting options
- Minimum Python version requirements

## Mocking Strategy

Tests use mocking to avoid external dependencies:

- **MQTT Connections**: Mocked to avoid actual broker connections
- **Supabase Database**: Mocked to avoid database calls
- **OpenAI API**: Mocked to avoid API calls and costs
- **Authentication**: Mocked JWT validation

## Continuous Integration

These tests are designed to run in CI/CD pipelines:

```bash
# Example CI command
pytest tests/ --cov=app --cov-report=xml --junitxml=test-results.xml
```

## Writing New Tests

### Example Unit Test

```python
def test_my_endpoint(client):
    """Test description."""
    response = client.get("/my-endpoint")
    assert response.status_code == 200
    assert response.json() == {"expected": "data"}
```

### Example Load Test

```python
@pytest.mark.load_test
def test_my_endpoint_load(client):
    """Test endpoint under load."""
    num_requests = 50
    
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(lambda: client.get("/my-endpoint")) 
                   for _ in range(num_requests)]
        results = [f.result() for f in as_completed(futures)]
    
    assert all(r.status_code == 200 for r in results)
```

## Troubleshooting

### Tests Fail Due to Missing Dependencies

```bash
pip install -r requirements.txt
```

### Tests Fail Due to Import Errors

Make sure you're running tests from the correct directory:

```bash
cd backend
pytest tests/
```

### Load Tests Are Too Slow

Reduce the number of requests or concurrent workers in the test configuration.

### MQTT Tests Fail

Ensure MQTT mocking is properly configured in the test fixtures.

## Best Practices

1. **Keep tests isolated**: Each test should be independent
2. **Use fixtures**: Share common setup code via pytest fixtures
3. **Mock external services**: Avoid real API calls, database queries, etc.
4. **Test edge cases**: Include tests for error conditions
5. **Keep tests fast**: Unit tests should run in milliseconds
6. **Use descriptive names**: Test names should clearly describe what they test
7. **Add docstrings**: Explain what each test verifies

## Performance Benchmarks

Expected performance metrics (on typical hardware):

- Health endpoint: < 100ms response time
- Concurrent requests: > 50 req/s
- Sustained load: > 50 req/s for 5+ seconds

## Support

For issues or questions about the testing suite, please refer to the main project documentation or open an issue on GitHub.
