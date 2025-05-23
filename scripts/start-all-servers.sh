#!/bin/bash

# Start All MCP Servers
# Usage: ./scripts/start-all-servers.sh

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# PID file to track running servers
PID_FILE="$PROJECT_ROOT/.mcp-servers.pid"

echo -e "${BLUE}🚀 Starting Claude MCP Server Ecosystem${NC}"
echo "========================================"

# Function to start a server in the background
start_server() {
    local name="$1"
    local command="$2"
    local port="$3"
    local env_vars="$4"
    
    echo -e "${YELLOW}Starting $name on port $port...${NC}"
    
    # Start server in background with environment variables
    if [ -n "$env_vars" ]; then
        eval "$env_vars nohup $command > logs/${name,,}.log 2>&1 &"
    else
        nohup $command > "logs/${name,,}.log" 2>&1 &
    fi
    
    local pid=$!
    echo "$name:$pid:$port" >> "$PID_FILE"
    
    # Wait a moment for server to start
    sleep 2
    
    # Check if server is running
    if kill -0 $pid 2>/dev/null; then
        echo -e "${GREEN}✅ $name started successfully (PID: $pid)${NC}"
        echo -e "   Log: logs/${name,,}.log"
        echo -e "   URL: http://localhost:$port"
    else
        echo -e "${RED}❌ Failed to start $name${NC}"
        # Remove failed entry from PID file
        grep -v "$name:" "$PID_FILE" > "$PID_FILE.tmp" && mv "$PID_FILE.tmp" "$PID_FILE"
    fi
    echo
}

# Create logs directory
mkdir -p logs

# Clear previous PID file
> "$PID_FILE"

# Start all MCP servers
echo -e "${BLUE}📋 Starting Core MCP Servers...${NC}"
echo

# 1. Memory MCP Server
start_server "Memory-MCP" "node mcp/memory/server.js" "3201" "PORT=3201"

# 2. Code Quality Server (if it exists)
if [ -f "servers/code-quality/src/server.ts" ]; then
    start_server "Code-Quality" "npx tsx servers/code-quality/src/server.ts" "3202" "PORT=3202"
fi

# 3. Documentation Server (if it exists)
if [ -f "servers/documentation/src/server.ts" ]; then
    start_server "Documentation" "npx tsx servers/documentation/src/server.ts" "3203" "PORT=3203"
fi

# 4. Web Access Server (if it exists)
if [ -f "servers/web-access/src/server.ts" ]; then
    start_server "Web-Access" "npx tsx servers/web-access/src/server.ts" "3204" "PORT=3204"
fi

# 5. Data Analytics Server (if it exists)
if [ -f "servers/data-analytics/src/server.ts" ]; then
    start_server "Data-Analytics" "npx tsx servers/data-analytics/src/server.ts" "3205" "PORT=3205"
fi

# Summary
echo -e "${BLUE}📊 Server Status Summary${NC}"
echo "========================"

if [ -s "$PID_FILE" ]; then
    echo -e "${GREEN}✅ Running Servers:${NC}"
    while IFS=':' read -r name pid port; do
        if kill -0 "$pid" 2>/dev/null; then
            echo "   • $name (PID: $pid) - http://localhost:$port"
        fi
    done < "$PID_FILE"
    
    echo
    echo -e "${YELLOW}📝 Commands:${NC}"
    echo "   • View logs: tail -f logs/<server>.log"
    echo "   • Stop all:  ./scripts/stop-all-servers.sh"
    echo "   • Status:    ./scripts/server-status.sh"
    echo
    echo -e "${GREEN}🎉 All servers started successfully!${NC}"
else
    echo -e "${RED}❌ No servers started successfully${NC}"
    exit 1
fi