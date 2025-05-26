#!/bin/bash

# Simplified Comprehensive End-to-End MCP Test
set -e

echo "🧪 COMPREHENSIVE MCP END-TO-END TEST"
echo "===================================="
echo "Testing: Cold start → Server launch → Claude Code connection → Functional interaction"
echo ""

PROJECT_DIR="/Users/robertlee/GitHubProjects/Claude_MCPServer"
RESULTS_DIR="$PROJECT_DIR/e2e_test_results"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
TEST_LOG="$RESULTS_DIR/e2e_test_$TIMESTAMP.log"

mkdir -p "$RESULTS_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$TEST_LOG"
}

log "🚀 Starting comprehensive MCP end-to-end test"

# STEP 1: Cold start
log "📋 STEP 1: Cold start - killing all existing MCP processes"
pkill -f "mcp" || true
pkill -f "claude" || true
sleep 2

if pgrep -f "mcp" > /dev/null; then
    log "❌ ERROR: MCP processes still running after kill attempt"
    exit 1
fi
log "✅ All MCP processes terminated"

# STEP 2: Start MCP servers
log "📋 STEP 2: Starting all MCP servers from scratch"

# Start filesystem server
log "🔧 Starting filesystem-standard..."
npx @modelcontextprotocol/server-filesystem /Users/robertlee > /dev/null 2>&1 &
FILESYSTEM_PID=$!
sleep 1

# Start memory server
log "🔧 Starting memory-simple-user..."
node "$PROJECT_DIR/mcp/memory-simple-user/index.js" > /dev/null 2>&1 &
MEMORY_PID=$!
sleep 1

# Start sequential thinking server
log "🔧 Starting sequential-thinking..."
npx @modelcontextprotocol/server-sequential-thinking > /dev/null 2>&1 &
SEQUENTIAL_PID=$!
sleep 1

# Start custom servers
for server in data-pipeline data-governance realtime-analytics data-warehouse ml-deployment security-vulnerability optimization ui-design; do
    log "🔧 Starting $server..."
    if [ -f "$PROJECT_DIR/mcp/$server/index.js" ]; then
        node "$PROJECT_DIR/mcp/$server/index.js" > /dev/null 2>&1 &
        sleep 1
    else
        log "⚠️  $server not found, skipping"
    fi
done

# Wait for initialization
log "⏳ Waiting 5 seconds for servers to fully initialize..."
sleep 5

# STEP 3: Verify servers are running
log "📋 STEP 3: Verifying MCP servers are running"
mcp_processes=$(pgrep -f "mcp" | wc -l)
log "📊 Found $mcp_processes MCP-related processes running"

if [ "$mcp_processes" -lt 3 ]; then
    log "❌ ERROR: Not enough MCP processes running (expected at least 3, found $mcp_processes)"
    exit 1
fi

log "✅ MCP servers verification complete"

# STEP 4: Generate Claude Code test configuration
log "📋 STEP 4: Generating Claude Code MCP configuration"

cat > "$RESULTS_DIR/claude_code_config.json" << EOF
{
  "mcpServers": {
    "filesystem-standard": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem", "/Users/robertlee"],
      "env": {}
    },
    "memory-simple-user": {
      "command": "node",
      "args": ["$PROJECT_DIR/mcp/memory-simple-user/index.js"],
      "env": {}
    },
    "sequential-thinking": {
      "command": "npx", 
      "args": ["@modelcontextprotocol/server-sequential-thinking"],
      "env": {}
    },
    "data-pipeline": {
      "command": "node",
      "args": ["$PROJECT_DIR/mcp/data-pipeline/index.js"],
      "env": {}
    },
    "data-governance": {
      "command": "node",
      "args": ["$PROJECT_DIR/mcp/data-governance/index.js"],
      "env": {}
    },
    "realtime-analytics": {
      "command": "node",
      "args": ["$PROJECT_DIR/mcp/realtime-analytics/index.js"],
      "env": {}
    },
    "data-warehouse": {
      "command": "node", 
      "args": ["$PROJECT_DIR/mcp/data-warehouse/index.js"],
      "env": {}
    },
    "ml-deployment": {
      "command": "node",
      "args": ["$PROJECT_DIR/mcp/ml-deployment/index.js"],
      "env": {}
    },
    "security-vulnerability": {
      "command": "node",
      "args": ["$PROJECT_DIR/mcp/security-vulnerability/index.js"],
      "env": {}
    },
    "optimization": {
      "command": "node",
      "args": ["$PROJECT_DIR/mcp/optimization/index.js"],
      "env": {}
    },
    "ui-design": {
      "command": "node",
      "args": ["$PROJECT_DIR/mcp/ui-design/index.js"],
      "env": {}
    }
  }
}
EOF

log "✅ Claude Code configuration generated at: $RESULTS_DIR/claude_code_config.json"

# STEP 5: Create test files for each MCP server
log "📋 STEP 5: Creating functional test files"
mkdir -p "$RESULTS_DIR/test_files"

# Create test data files
echo "This is a test file for filesystem operations" > "$RESULTS_DIR/test_files/filesystem_test.txt"
echo '{"test": "memory data", "timestamp": "'$(date)'"}' > "$RESULTS_DIR/test_files/memory_test.json"
echo "Complex problem: How to optimize database performance?" > "$RESULTS_DIR/test_files/sequential_test.txt"

log "✅ Test files created"

# STEP 6: Provide testing instructions
log "📋 STEP 6: E2E test setup complete - Ready for Claude Code testing"
log ""
log "🎯 MANUAL TESTING STEPS:"
log "1. Open a NEW terminal window"
log "2. Run: claude --mcp-config $RESULTS_DIR/claude_code_config.json"
log "3. Test each MCP server with these specific commands:"
log ""
log "   📁 FILESYSTEM TEST:"
log "      'Use the filesystem tools to list files in the current directory'"
log "      'Read the contents of e2e_test_results/test_files/filesystem_test.txt'"
log ""
log "   🧠 MEMORY TEST:"
log "      'Use memory tools to store this data: key=test_key, value=test_value_$(date)'"
log "      'Retrieve the memory with key test_key'"
log ""
log "   🤔 SEQUENTIAL THINKING TEST:"
log "      'Use sequential thinking to solve: What are the steps to deploy a web application?'"
log ""
log "   🔄 DATA PIPELINE TEST:"
log "      'Use data pipeline tools to show available pipeline operations'"
log ""
log "   🏛️  DATA GOVERNANCE TEST:"
log "      'Use data governance tools to check compliance features'"
log ""
log "   📊 REALTIME ANALYTICS TEST:"
log "      'Use realtime analytics tools to show monitoring capabilities'"
log ""
log "   🏭 DATA WAREHOUSE TEST:"
log "      'Use data warehouse tools to describe available operations'"
log ""
log "   🤖 ML DEPLOYMENT TEST:"
log "      'Use ML deployment tools to show model deployment features'"
log ""
log "   🔒 SECURITY TEST:"
log "      'Use security tools to run a basic vulnerability check'"
log ""
log "   ⚡ OPTIMIZATION TEST:"
log "      'Use optimization tools to analyze performance opportunities'"
log ""
log "   🎨 UI DESIGN TEST:"
log "      'Use UI design tools to suggest interface improvements'"
log ""
log "🔍 EXPECTED RESULTS:"
log "- Each test should return specific responses from the respective MCP server"
log "- No 'tool not found' or 'server unavailable' errors"
log "- Functional responses demonstrating actual server interaction"
log ""
log "📊 Test monitoring:"
log "   Run in another terminal: watch 'pgrep -f mcp | wc -l'"
log "   Should show consistent number of running processes"
log ""
log "📄 Logs: $TEST_LOG"
log "📁 Config: $RESULTS_DIR/claude_code_config.json"
log ""
log "✅ READY FOR FUNCTIONAL TESTING - All servers running and waiting"

# Keep servers running
log "⏳ Keeping servers running for testing... (Press Ctrl+C to stop all servers)"
trap 'log "🛑 Stopping all MCP servers..."; pkill -f "mcp" || true; exit 0' INT

while true; do
    sleep 30
    active=$(pgrep -f "mcp" | wc -l)
    log "📊 Status: $active MCP processes running"
done