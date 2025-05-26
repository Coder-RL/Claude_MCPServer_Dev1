#!/bin/bash

echo "Starting API with proper Python environment..."

# Kill any existing API processes
pkill -f "uvicorn.*main:app" 2>/dev/null || true
sleep 2

# Use the full python path from the working process
cd /Users/robertlee/GitHubProjects/ClarusRev/api

# Start with uvicorn from Python Library on port 8090 to avoid conflicts
/Users/robertlee/Library/Python/3.9/bin/uvicorn main:app --reload --host 0.0.0.0 --port 8090