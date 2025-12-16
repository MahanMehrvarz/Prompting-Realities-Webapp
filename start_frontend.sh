#!/bin/bash
# Start the frontend accessible from local network
cd "$(dirname "$0")/frontend"
echo "Starting frontend on http://192.168.1.15:3000 (accessible from local network)..."
echo "Backend API: http://192.168.1.15:8000"
npm run dev
