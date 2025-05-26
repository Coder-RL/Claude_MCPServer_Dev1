#!/bin/bash

# Final MCP Server Ecosystem Validation Script
# Confirms all systems ready for Claude Code integration

echo "🎯 FINAL MCP SERVER ECOSYSTEM VALIDATION"
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0

check_item() {
    local description="$1"
    local command="$2"
    local expected="$3"
    
    echo -n "🔍 $description... "
    
    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ PASS${NC}"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo -e "${RED}❌ FAIL${NC}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
}

# Infrastructure validation
echo -e "${BLUE}📦 INFRASTRUCTURE VALIDATION${NC}"
check_item "PostgreSQL container running" "docker ps | grep claude-mcp-postgres"
check_item "Redis container running" "docker ps | grep claude-mcp-redis"
check_item "Qdrant container running" "docker ps | grep claude-mcp-qdrant"
echo ""

# MCP Server validation
echo -e "${BLUE}🤖 MCP SERVER VALIDATION${NC}"
check_item "Memory-simple server responds" "echo '{\"jsonrpc\": \"2.0\", \"id\": 1, \"method\": \"tools/list\"}' | timeout 2 node mcp/memory/simple-server.js | grep -q tools"
check_item "Enhanced-memory server responds" "echo '{\"jsonrpc\": \"2.0\", \"id\": 1, \"method\": \"tools/list\"}' | timeout 2 npx tsx servers/memory/src/enhanced-memory-final.ts | grep -q tools"
check_item "Data-pipeline server responds" "echo '{\"jsonrpc\": \"2.0\", \"id\": 1, \"method\": \"tools/list\"}' | timeout 2 npx tsx servers/data-analytics/src/data-pipeline.ts | grep -q tools"
check_item "Security-vulnerability server responds" "echo '{\"jsonrpc\": \"2.0\", \"id\": 1, \"method\": \"tools/list\"}' | timeout 2 npx tsx servers/security-vulnerability/src/security-vulnerability.ts | grep -q tools"
check_item "UI-design server responds" "echo '{\"jsonrpc\": \"2.0\", \"id\": 1, \"method\": \"tools/list\"}' | timeout 2 npx tsx servers/ui-design/src/ui-design.ts | grep -q tools"
check_item "Sequential-thinking server responds" "echo '{\"jsonrpc\": \"2.0\", \"id\": 1, \"method\": \"tools/list\"}' | timeout 2 npx -y @modelcontextprotocol/server-sequential-thinking | grep -q tools"
echo ""

# Configuration validation
echo -e "${BLUE}⚙️  CONFIGURATION VALIDATION${NC}"
check_item "Claude Code config exists" "test -f ~/.claude/claude_code_config.json"
check_item "Config has 11 MCP servers" "jq '.mcpServers | keys | length' ~/.claude/claude_code_config.json | grep -q 11"
check_item "Enhanced-memory in config" "jq '.mcpServers | has(\"enhanced-memory\")' ~/.claude/claude_code_config.json | grep -q true"
check_item "All file paths are absolute" "test $(jq -r '.mcpServers | to_entries[] | select(.value.args | if length == 1 then .[0] else .[1] end | test(\"\\.(ts|js)$\")) | select(.value.args | if length == 1 then .[0] else .[1] end | test(\"^/\") | not) | .key' ~/.claude/claude_code_config.json | wc -l) -eq 0"
echo ""

# Claude Code readiness
echo -e "${BLUE}🎯 CLAUDE CODE READINESS${NC}"
check_item "Claude Code binary available" "which claude"
check_item "MCP wrapper script executable" "test -x scripts/claude-mcp-wrapper.sh"
check_item "Node.js and npm available" "node --version && npm --version"
check_item "TypeScript compiler available" "npx tsx --version"
echo ""

# Enhanced memory features
echo -e "${BLUE}🧠 ENHANCED MEMORY VALIDATION${NC}"
ENHANCED_MEMORY_TEST=$(echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}' | timeout 3 npx tsx servers/memory/src/enhanced-memory-final.ts 2>/dev/null)
check_item "Enhanced memory has 3 tools" "echo '$ENHANCED_MEMORY_TEST' | jq '.result.tools | length' | grep -q 3"
check_item "Store enhanced memory tool available" "echo '$ENHANCED_MEMORY_TEST' | jq -r '.result.tools[].name' | grep -q store_enhanced_memory"
check_item "Retrieve optimized context tool available" "echo '$ENHANCED_MEMORY_TEST' | jq -r '.result.tools[].name' | grep -q retrieve_optimized_context"
check_item "Optimization stats tool available" "echo '$ENHANCED_MEMORY_TEST' | jq -r '.result.tools[].name' | grep -q get_optimization_stats"
echo ""

# Summary
echo -e "${BLUE}📊 VALIDATION SUMMARY${NC}"
echo "===================="
TOTAL=$((PASS_COUNT + FAIL_COUNT))
SUCCESS_RATE=$(echo "scale=1; $PASS_COUNT * 100 / $TOTAL" | bc)

echo -e "Total checks: $TOTAL"
echo -e "${GREEN}Passed: $PASS_COUNT${NC}"
echo -e "${RED}Failed: $FAIL_COUNT${NC}"
echo -e "Success rate: ${SUCCESS_RATE}%"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL SYSTEMS READY FOR CLAUDE CODE INTEGRATION!${NC}"
    echo ""
    echo -e "${BLUE}🚀 NEXT STEPS:${NC}"
    echo "1. Start Claude Code with MCP support:"
    echo "   ./scripts/claude-mcp-wrapper.sh"
    echo ""
    echo "2. In Claude Code, run:"
    echo "   /mcp"
    echo "   Expected: All 11 servers listed as 'connected'"
    echo ""
    echo "3. Test enhanced memory:"
    echo "   Ask: 'Store this in enhanced memory with high importance: TypeScript preferences'"
    echo ""
    echo "4. Test other servers:"
    echo "   Ask: 'List all available MCP tools'"
    echo "   Ask: 'Scan this project for security vulnerabilities'"
    echo "   Ask: 'Create a data pipeline for CSV processing'"
    echo ""
    exit 0
else
    echo -e "${RED}⚠️  SOME SYSTEMS NOT READY${NC}"
    echo "Please check the failed items above and retry."
    exit 1
fi