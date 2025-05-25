#!/bin/bash

# 🔍 SYSTEM STATUS VERIFICATION SCRIPT
# This script provides PROOF of current system state
# Run: bash verify-system-status.sh

echo "🔍 CLAUDE MCP SERVER ECOSYSTEM - STATUS VERIFICATION"
echo "=================================================="
echo "Timestamp: $(date)"
echo ""

# Check if we're in the right directory
if [ ! -f "claude-mcp-setup" ]; then
    echo "❌ ERROR: Run this from /Users/robertlee/GitHubProjects/Claude_MCPServer"
    exit 1
fi

echo "📁 Working Directory: $(pwd)"
echo ""

# 1. Infrastructure Check
echo "1️⃣ INFRASTRUCTURE STATUS:"
echo "-------------------------"
DOCKER_COUNT=$(docker ps --filter "name=claude-mcp" --format "{{.Names}}" 2>/dev/null | wc -l)
if [ "$DOCKER_COUNT" -eq 3 ]; then
    echo "✅ Docker Infrastructure: $DOCKER_COUNT/3 containers running"
    docker ps --filter "name=claude-mcp" --format "   {{.Names}}: {{.Status}}"
else
    echo "❌ Docker Infrastructure: $DOCKER_COUNT/3 containers running"
    echo "   Run: docker-compose up -d"
fi
echo ""

# 2. MCP Setup Script Check
echo "2️⃣ MCP SETUP SCRIPT:"
echo "--------------------"
if [ -x "claude-mcp-setup" ]; then
    echo "✅ claude-mcp-setup: Executable found"
else
    echo "❌ claude-mcp-setup: Not executable"
    echo "   Run: chmod +x claude-mcp-setup"
fi
echo ""

# 3. Wrapper Script Check
echo "3️⃣ WRAPPER SCRIPT CONFIGURATION:"
echo "--------------------------------"
if grep -q "DATA_PIPELINE_ID" scripts/claude-mcp-wrapper.sh; then
    echo "✅ Environment Variables: ID format detected (correct)"
    echo "   Sample: $(grep "DATA_PIPELINE_ID" scripts/claude-mcp-wrapper.sh | head -1 | tr -d ' ')"
else
    echo "❌ Environment Variables: PORT format detected (broken)"
    echo "   This would cause server connection failures"
fi
echo ""

# 4. Configuration File Check
echo "4️⃣ CLAUDE CODE CONFIGURATION:"
echo "-----------------------------"
CONFIG_FILE="/Users/robertlee/.claude/claude_code_config.json"
if [ -f "$CONFIG_FILE" ]; then
    echo "✅ Configuration File: Found at $CONFIG_FILE"
    SERVER_COUNT=$(jq -r '.mcpServers | keys | length' "$CONFIG_FILE" 2>/dev/null || echo "0")
    echo "   Configured Servers: $SERVER_COUNT"
    if [ "$SERVER_COUNT" -eq 10 ]; then
        echo "   ✅ All 10 servers configured"
    else
        echo "   ⚠️  Expected 10 servers, found $SERVER_COUNT"
    fi
else
    echo "❌ Configuration File: Not found at $CONFIG_FILE"
fi
echo ""

# 5. Individual Server Test
echo "5️⃣ INDIVIDUAL SERVER TESTS:"
echo "---------------------------"
echo "Testing data-governance server individually:"
TEST_RESULT=$(echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}' | timeout 10s npx tsx servers/data-analytics/src/data-governance.ts 2>/dev/null)
if echo "$TEST_RESULT" | grep -q "tools"; then
    TOOL_COUNT=$(echo "$TEST_RESULT" | jq -r '.result.tools | length' 2>/dev/null || echo "0")
    echo "✅ data-governance: Responds with $TOOL_COUNT tools"
else
    echo "❌ data-governance: No response or error"
fi
echo ""

# 6. Summary
echo "📊 SUMMARY:"
echo "----------"
echo "Infrastructure: $([ "$DOCKER_COUNT" -eq 3 ] && echo "✅ Ready" || echo "❌ Issues")"
echo "Setup Script: $([ -x "claude-mcp-setup" ] && echo "✅ Ready" || echo "❌ Issues")"
echo "Configuration: $(grep -q "DATA_PIPELINE_ID" scripts/claude-mcp-wrapper.sh && echo "✅ Fixed" || echo "❌ Broken")"
echo ""

if [ "$DOCKER_COUNT" -eq 3 ] && [ -x "claude-mcp-setup" ] && grep -q "DATA_PIPELINE_ID" scripts/claude-mcp-wrapper.sh; then
    echo "🎯 SYSTEM STATUS: ✅ READY FOR CLAUDE CODE INTEGRATION"
    echo ""
    echo "Next steps:"
    echo "1. Run: ./claude-mcp-setup start"
    echo "2. Open Claude Code" 
    echo "3. Run: /mcp"
    echo "4. Expect: 10 connected servers"
else
    echo "🚨 SYSTEM STATUS: ❌ NEEDS ATTENTION"
    echo ""
    echo "Issues found - see details above"
fi

echo ""
echo "Verification completed at: $(date)"