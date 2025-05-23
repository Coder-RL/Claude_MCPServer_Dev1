#!/bin/bash

echo "Starting ClarusRev UI from Claude_MCPServer directory..."

# Kill any existing vite processes
pkill -f "vite" 2>/dev/null || true

# Start the UI using absolute paths
echo "Navigating to UI directory and starting vite..."

# Run npm commands from the UI directory
cd /Users/robertlee/GitHubProjects/ClarusRev/ui && npm run dev