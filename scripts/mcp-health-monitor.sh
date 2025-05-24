#!/bin/bash

# MCP Health Monitor - Flags when MCP servers aren't available
# Usage: ./mcp-health-monitor.sh [--verbose]

VERBOSE=false
if [[ "$1" == "--verbose" ]]; then
    VERBOSE=true
fi

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Expected MCP servers
EXPECTED_SERVERS=(
    "memory-simple"
    "sequential-thinking"
    "data-pipeline"
    "realtime-analytics"
    "data-warehouse"
    "ml-deployment"
    "data-governance"
    "security-vulnerability"
    "ui-design"
    "optimization"
)

echo -e "${BLUE}🔍 MCP Server Health Check${NC}"
echo "==============================="

# Check Claude Code MCP configuration
echo -e "\n${BLUE}📋 Checking Claude Code MCP Configuration...${NC}"
CONFIGURED_SERVERS=$(claude mcp list 2>/dev/null | wc -l)

if [[ $CONFIGURED_SERVERS -eq 0 ]]; then
    echo -e "${RED}❌ ERROR: No MCP servers configured in Claude Code!${NC}"
    echo -e "${YELLOW}💡 Run: claude mcp add-from-claude-desktop${NC}"
    exit 1
else
    echo -e "${GREEN}✅ Found $CONFIGURED_SERVERS configured MCP servers${NC}"
fi

# Check individual server availability
echo -e "\n${BLUE}🔌 Testing MCP Server Connections...${NC}"
FAILED_SERVERS=()
AVAILABLE_SERVERS=()

for server in "${EXPECTED_SERVERS[@]}"; do
    if claude mcp get "$server" >/dev/null 2>&1; then
        AVAILABLE_SERVERS+=("$server")
        if [[ "$VERBOSE" == true ]]; then
            echo -e "${GREEN}✅ $server${NC}"
        fi
    else
        FAILED_SERVERS+=("$server")
        echo -e "${RED}❌ $server - NOT CONFIGURED${NC}"
    fi
done

# Summary
echo -e "\n${BLUE}📊 Summary${NC}"
echo "==========="
echo -e "Available: ${GREEN}${#AVAILABLE_SERVERS[@]}${NC}/${#EXPECTED_SERVERS[@]}"
echo -e "Missing: ${RED}${#FAILED_SERVERS[@]}${NC}/${#EXPECTED_SERVERS[@]}"

if [[ ${#FAILED_SERVERS[@]} -gt 0 ]]; then
    echo -e "\n${RED}⚠️  WARNING: Missing MCP servers detected!${NC}"
    echo -e "${YELLOW}Missing servers:${NC}"
    for server in "${FAILED_SERVERS[@]}"; do
        echo -e "  - $server"
    done
    
    echo -e "\n${YELLOW}💡 Recommended actions:${NC}"
    echo "1. Start MCP servers: ./scripts/start-mcp-ecosystem.sh"
    echo "2. Re-add missing servers to Claude Code configuration"
    echo "3. Check server logs for errors"
    
    exit 2
fi

# Test actual MCP tool availability (if Claude Code is running)
echo -e "\n${BLUE}🛠️  Testing MCP Tool Availability...${NC}"
if command -v claude >/dev/null 2>&1; then
    # Create a test script to check if MCP tools are actually available
    cat > /tmp/mcp_test.txt << 'EOF'
Please respond with "MCP_TOOLS_WORKING" if you can access MCP tools like mcp__memory-simple__health_check.
EOF
    
    # This would require Claude Code to be running interactively
    echo -e "${YELLOW}ℹ️  To test live MCP tool access, run Claude Code and try an MCP command${NC}"
else
    echo -e "${YELLOW}⚠️  Claude Code CLI not found in PATH${NC}"
fi

echo -e "\n${GREEN}✅ MCP Health Check Complete${NC}"

# Create notification file if there were issues
if [[ ${#FAILED_SERVERS[@]} -gt 0 ]]; then
    echo "$(date): ${#FAILED_SERVERS[@]} MCP servers unavailable: ${FAILED_SERVERS[*]}" >> ~/.claude_mcp_alerts.log
fi