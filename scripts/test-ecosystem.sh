#!/bin/bash

# Test script for Claude MCP Server Ecosystem
# This script tests all services and provides a comprehensive status report

PROJECT_ROOT="/Users/robertlee/GitHubProjects/Claude_MCPServer"
LOG_DIR="$PROJECT_ROOT/logs"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

cd "$PROJECT_ROOT"

echo -e "${BLUE}🧪 Testing Claude MCP Server Ecosystem...${NC}"

# Test infrastructure
echo -e "${BLUE}🔧 Testing Infrastructure:${NC}"

# Test PostgreSQL
if pg_isready -h localhost -U postgres &>/dev/null; then
    echo -e "  ${GREEN}✅ PostgreSQL${NC}"
else
    echo -e "  ${RED}❌ PostgreSQL${NC}"
fi

# Test Redis (via Docker)
if docker exec claude-mcp-redis redis-cli ping &>/dev/null; then
    echo -e "  ${GREEN}✅ Redis${NC}"
else
    echo -e "  ${RED}❌ Redis${NC}"
fi

# Test Qdrant
if curl -s http://localhost:6333/health &>/dev/null || curl -s http://localhost:6333 &>/dev/null; then
    echo -e "  ${GREEN}✅ Qdrant${NC}"
else
    echo -e "  ${RED}❌ Qdrant${NC}"
fi

# Test MCP servers
echo -e "${BLUE}🧠 Testing MCP Servers:${NC}"

# Test Memory Simple MCP
if curl -s http://localhost:3301/health | grep -q "healthy"; then
    echo -e "  ${GREEN}✅ Memory Simple MCP (3301)${NC}"
else
    echo -e "  ${RED}❌ Memory Simple MCP (3301)${NC}"
fi

# Test Sequential Thinking (check port)
if lsof -i :3302 &>/dev/null; then
    echo -e "  ${GREEN}✅ Sequential Thinking MCP (3302)${NC}"
else
    echo -e "  ${RED}❌ Sequential Thinking MCP (3302)${NC}"
fi

# Test Week 11 Data Analytics servers
echo -e "${BLUE}📊 Testing Week 11 Data Analytics:${NC}"

for port in 3011 3012 3013 3014 3015; do
    service_name=""
    health_endpoint=""
    case $port in
        3011) service_name="Data Pipeline"; health_endpoint="/api/health" ;;
        3012) service_name="Realtime Analytics"; health_endpoint="/api/health" ;;
        3013) service_name="Data Warehouse"; health_endpoint="/health" ;;
        3014) service_name="ML Deployment"; health_endpoint="/health" ;;
        3015) service_name="Data Governance"; health_endpoint="/health" ;;
    esac
    
    if curl -s http://localhost:$port$health_endpoint &>/dev/null; then
        echo -e "  ${GREEN}✅ $service_name ($port)${NC}"
    else
        echo -e "  ${RED}❌ $service_name ($port)${NC}"
    fi
done

# Test Claude Desktop config
echo -e "${BLUE}🖥️  Testing Claude Desktop Config:${NC}"
if [ -f "$HOME/Library/Application Support/Claude/claude_desktop_config.json" ]; then
    echo -e "  ${GREEN}✅ Config file exists${NC}"
else
    echo -e "  ${RED}❌ Config file missing${NC}"
fi

# Test Claude Code config
echo -e "${BLUE}💻 Testing Claude Code Config:${NC}"
if [ -f "$HOME/.config/claude-code/config.json" ]; then
    echo -e "  ${GREEN}✅ Config file exists${NC}"
else
    echo -e "  ${RED}❌ Config file missing${NC}"
fi

# Summary
echo -e "${BLUE}📝 Log files in: $LOG_DIR${NC}"
echo -e "${BLUE}🧪 Test complete!${NC}"