#!/bin/bash
# Start both backend and frontend servers
cd "$(dirname "$0")"

echo "Starting both backend and frontend..."
echo "=================================="

# Start backend in background
echo "Starting backend on 0.0.0.0:8000..."
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Give backend a moment to start
sleep 2

# Start frontend in background
echo "Starting frontend on http://192.168.1.15:3000..."
cd frontend && npm run dev &
FRONTEND_PID=$!

cd "$(dirname "$0")"

echo "=================================="
echo "Both servers are running!"
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "Press Ctrl+C to stop both servers"

# Trap Ctrl+C to kill both processes
trap "echo 'Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM

# Wait for both processes
wait
