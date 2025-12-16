#!/bin/bash
# Start the backend server accessible from local network
cd "$(dirname "$0")"
echo "Starting backend on 0.0.0.0:8000 (accessible from local network)..."
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
