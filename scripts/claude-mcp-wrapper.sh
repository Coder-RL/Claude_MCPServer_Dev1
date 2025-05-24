#!/bin/bash

# Claude Code MCP Wrapper - Always check MCP health before starting Claude Code
# Usage: ./claude-mcp-wrapper.sh [claude-code-args...]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🤖 Claude Code MCP Wrapper${NC}"
echo "=============================="

# Run MCP health check
echo -e "\n${BLUE}🔍 Checking MCP server health...${NC}"
if ! "$SCRIPT_DIR/mcp-health-monitor.sh"; then
    echo -e "\n${RED}⚠️  MCP Health Check Failed!${NC}"
    echo -e "${YELLOW}Do you want to continue anyway? (y/N):${NC}"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo -e "${RED}Aborting Claude Code startup${NC}"
        exit 1
    fi
fi

# Start Claude Code with MCP debugging enabled
echo -e "\n${GREEN}🚀 Starting Claude Code with MCP support...${NC}"
echo -e "${BLUE}MCP Debug mode: Enabled${NC}"
echo -e "${BLUE}Command: claude --debug $*${NC}"
echo ""

# Pass all arguments to Claude Code with debug mode
exec claude --debug "$@"