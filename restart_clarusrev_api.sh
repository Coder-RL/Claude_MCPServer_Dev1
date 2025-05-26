#!/bin/bash

echo "Restarting ClarusRev API..."

# Kill any existing API processes
pkill -f "uvicorn.*main:app" 2>/dev/null || true

# Wait a moment
sleep 3

# Navigate to API directory and start
cd /Users/robertlee/GitHubProjects/ClarusRev/api

# Start the API server
python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000