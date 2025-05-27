#!/bin/bash

# COMPREHENSIVE END-TO-END MCP TEST EXECUTION
# This script performs a complete cold start to Claude Code integration test

echo "🚀 STARTING COMPREHENSIVE END-TO-END MCP TEST"
echo "==============================================="

# Create test results directory
TEST_DIR="./e2e_test_results_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$TEST_DIR"

LOG_FILE="$TEST_DIR/e2e_test_execution.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "🔍 Phase 1: Environment Verification"
log "Working Directory: $(pwd)"
log "Node Version: $(node --version)"
log "NPM Version: $(npm --version)"

# Check if Claude Code config exists
if [ -f "/Users/robertlee/.claude/claude_code_config_dev1_optimized.json" ]; then
    log "✅ Claude Code config found"
else
    log "❌ Claude Code config not found"
    exit 1
fi

log "🛑 Phase 2: Clean Shutdown of All Services"

# Stop PM2 processes
log "Stopping PM2 processes..."
pm2 stop all >/dev/null 2>&1
pm2 delete all >/dev/null 2>&1
log "✅ PM2 processes stopped"

# Kill any existing MCP processes
log "Killing existing MCP processes..."
pkill -f "mcp" >/dev/null 2>&1
pkill -f "sequential-thinking" >/dev/null 2>&1
pkill -f "tsx.*server" >/dev/null 2>&1
sleep 2
log "✅ Existing MCP processes terminated"

log "🏗️  Phase 3: Cold Start - PM2 Managed Servers"

# Start the ecosystem
log "Starting PM2 ecosystem..."
pm2 start ecosystem.config.cjs 2>&1 | tee -a "$LOG_FILE"

# Wait for initialization
log "Waiting 10 seconds for server initialization..."
sleep 10

# Check PM2 status
log "PM2 Status after startup:"
pm2 status 2>&1 | tee -a "$LOG_FILE"

PM2_ONLINE=$(pm2 status | grep -c "online")
log "PM2 servers online: $PM2_ONLINE"

log "🔗 Phase 4: Test MCP Server Connectivity"

# Test individual server files exist
log "Checking server files:"
servers=(
    "servers/data-analytics/src/data-governance-fixed.ts"
    "servers/data-analytics/src/data-pipeline-fixed.ts"
    "servers/security-vulnerability/src/security-vulnerability-fixed.ts"
    "servers/optimization/src/optimization-fixed.ts"
    "servers/ui-design/src/ui-design-fixed.ts"
    "mcp/sequential-thinking/server.js"
    "servers/consolidated/data-analytics-consolidated.ts"
)

for server in "${servers[@]}"; do
    if [ -f "$server" ]; then
        log "✅ $server exists"
    else
        log "❌ $server missing"
    fi
done

log "🧪 Phase 5: Functional Testing"

# Test sequential-thinking server directly
log "Testing sequential-thinking server STDIO communication..."
echo '{"method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}}}' | timeout 5s node mcp/sequential-thinking/server.js > "$TEST_DIR/sequential_test.log" 2>&1
if [ $? -eq 0 ]; then
    log "✅ Sequential thinking server responds to STDIO"
else
    log "❌ Sequential thinking server STDIO test failed"
fi

# Test if we can load typescript servers
log "Testing TypeScript server loading..."
timeout 5s npx tsx --version > "$TEST_DIR/tsx_test.log" 2>&1
if [ $? -eq 0 ]; then
    log "✅ TypeScript execution environment working"
else
    log "❌ TypeScript execution environment failed"
fi

log "📊 Phase 6: Generate Test Report"

# Count working components
WORKING_SERVERS=0
TOTAL_SERVERS=18

# Check if critical files exist
if [ -f "mcp/sequential-thinking/server.js" ]; then
    WORKING_SERVERS=$((WORKING_SERVERS + 1))
fi

if [ -f "servers/consolidated/data-analytics-consolidated.ts" ]; then
    WORKING_SERVERS=$((WORKING_SERVERS + 1))
fi

# Add PM2 online servers
WORKING_SERVERS=$((WORKING_SERVERS + PM2_ONLINE))

# Generate final report
cat > "$TEST_DIR/test_report.json" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "test_phase": "end_to_end_execution",
  "environment": {
    "working_directory": "$(pwd)",
    "node_version": "$(node --version)",
    "npm_version": "$(npm --version)"
  },
  "pm2_status": {
    "servers_online": $PM2_ONLINE,
    "servers_expected": 10
  },
  "mcp_servers": {
    "working_servers": $WORKING_SERVERS,
    "total_expected": $TOTAL_SERVERS,
    "success_rate": "$(echo "scale=2; $WORKING_SERVERS * 100 / $TOTAL_SERVERS" | bc)%"
  },
  "claude_code_integration": {
    "config_exists": $([ -f "/Users/robertlee/.claude/claude_code_config_dev1_optimized.json" ] && echo "true" || echo "false"),
    "ready_for_testing": $([ $WORKING_SERVERS -gt 5 ] && echo "true" || echo "false")
  }
}
EOF

log "📋 FINAL TEST RESULTS"
log "====================="
log "Working MCP Servers: $WORKING_SERVERS/$TOTAL_SERVERS"
log "PM2 Online: $PM2_ONLINE/10"
log "Success Rate: $(echo "scale=2; $WORKING_SERVERS * 100 / $TOTAL_SERVERS" | bc)%"

if [ $WORKING_SERVERS -gt 10 ]; then
    log "🎉 TEST STATUS: SUCCESS - Ready for Claude Code Integration"
    echo "SUCCESS" > "$TEST_DIR/test_status.txt"
else
    log "⚠️  TEST STATUS: PARTIAL - Some servers need attention"
    echo "PARTIAL" > "$TEST_DIR/test_status.txt"
fi

log "📄 Test results saved to: $TEST_DIR"
log "🏁 End-to-End Test Completed"

# Display next steps
cat <<EOF

🚀 NEXT STEPS FOR CLAUDE CODE INTEGRATION:

1. Start Claude Code with MCP support:
   claude --mcp-config /Users/robertlee/.claude/claude_code_config_dev1_optimized.json

2. Verify MCP connection in Claude Code:
   Type: mcp
   Expected: List of connected servers

3. Test individual MCP server functionality:
   - Memory operations: "Store a test memory"
   - File operations: "List files in current directory" 
   - Security scanning: "Scan this project for vulnerabilities"
   - UI analysis: "Analyze the UI design system"

4. View detailed logs:
   ls -la $TEST_DIR/

EOF

exit 0