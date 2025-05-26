#!/bin/bash

# Claude Desktop MCP Status Checker
# Run this periodically to check if Claude Desktop can access MCP servers

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🖥️  Claude Desktop MCP Status Check${NC}"
echo "===================================="

# Check if Claude Desktop is running
if ! pgrep -f "Claude" > /dev/null; then
    echo -e "${YELLOW}⚠️  Claude Desktop is not currently running${NC}"
    echo -e "${BLUE}ℹ️  Start Claude Desktop and try an MCP command like:${NC}"
    echo "   'Can you use mcp__memory-simple__health_check to test connectivity?'"
    exit 1
fi

echo -e "${GREEN}✅ Claude Desktop is running${NC}"

# Check MCP server processes
echo -e "\n${BLUE}🔍 Checking MCP Server Processes...${NC}"

MCP_SERVERS=(
    "simple-server.js:memory-simple"
    "sequential-thinking:sequential-thinking" 
    "data-pipeline.ts:data-pipeline"
    "realtime-analytics.ts:realtime-analytics"
    "data-warehouse.ts:data-warehouse"
    "ml-deployment.ts:ml-deployment"
    "data-governance.ts:data-governance"
    "security-vulnerability.ts:security-vulnerability"
    "ui-design.ts:ui-design"
    "optimization.ts:optimization"
)

RUNNING_COUNT=0
TOTAL_COUNT=${#MCP_SERVERS[@]}

for server_info in "${MCP_SERVERS[@]}"; do
    IFS=':' read -r process_name server_name <<< "$server_info"
    
    if pgrep -f "$process_name" > /dev/null; then
        echo -e "${GREEN}✅ $server_name${NC}"
        ((RUNNING_COUNT++))
    else
        echo -e "${RED}❌ $server_name - Process not found${NC}"
    fi
done

echo -e "\n${BLUE}📊 Summary${NC}"
echo "==========="
echo -e "Running: ${GREEN}$RUNNING_COUNT${NC}/$TOTAL_COUNT"
echo -e "Stopped: ${RED}$((TOTAL_COUNT - RUNNING_COUNT))${NC}/$TOTAL_COUNT"

if [[ $RUNNING_COUNT -lt $TOTAL_COUNT ]]; then
    echo -e "\n${RED}⚠️  Some MCP servers are not running!${NC}"
    echo -e "${YELLOW}💡 To start all servers:${NC}"
    echo "   ./scripts/start-mcp-ecosystem.sh"
    
    echo -e "\n${YELLOW}🧪 To test Claude Desktop MCP access:${NC}"
    echo "   1. Open Claude Desktop"
    echo "   2. Try: 'Use mcp__memory-simple__health_check to test'"
    echo "   3. If it fails, restart Claude Desktop after starting servers"
    
    exit 2
fi

echo -e "\n${GREEN}✅ All MCP servers appear to be running${NC}"
echo -e "\n${YELLOW}🧪 To verify Claude Desktop can access MCP tools:${NC}"
echo "   Ask Claude Desktop: 'Can you use mcp__memory-simple__health_check?'"

# Create a notification if needed
if [[ $RUNNING_COUNT -lt $TOTAL_COUNT ]]; then
    echo "$(date): Claude Desktop MCP Check - $((TOTAL_COUNT - RUNNING_COUNT)) servers down" >> ~/.claude_mcp_alerts.log
fi