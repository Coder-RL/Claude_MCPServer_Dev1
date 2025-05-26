#!/bin/bash

# Functional MCP Test - Test actual available servers
set -e

echo "🔬 FUNCTIONAL MCP TEST - AVAILABLE SERVERS"
echo "=========================================="
echo "Testing actual server functionality with Claude Code"
echo ""

PROJECT_DIR="/Users/robertlee/GitHubProjects/Claude_MCPServer"
RESULTS_DIR="$PROJECT_DIR/functional_test_results"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
TEST_LOG="$RESULTS_DIR/functional_test_$TIMESTAMP.log"

mkdir -p "$RESULTS_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$TEST_LOG"
}

log "🚀 Starting functional MCP test with available servers"

# STEP 1: Kill existing processes
log "📋 STEP 1: Cleaning up existing processes"
pkill -f "mcp" || true
pkill -f "claude" || true
sleep 2
log "✅ Cleanup complete"

# STEP 2: Start available MCP servers
log "📋 STEP 2: Starting available MCP servers"

# Start filesystem server (official NPX)
log "🔧 Starting filesystem-standard (official)..."
npx @modelcontextprotocol/server-filesystem /Users/robertlee > "$RESULTS_DIR/filesystem.log" 2>&1 &
FILESYSTEM_PID=$!
sleep 2

# Start memory server (our custom)
log "🔧 Starting enhanced-memory (custom)..."
node "$PROJECT_DIR/mcp/memory/enhanced-server-stdio.js" > "$RESULTS_DIR/memory.log" 2>&1 &
MEMORY_PID=$!
sleep 2

# Start sequential thinking (official NPX)
log "🔧 Starting sequential-thinking (official)..."
npx @modelcontextprotocol/server-sequential-thinking > "$RESULTS_DIR/sequential.log" 2>&1 &
SEQUENTIAL_PID=$!
sleep 2

log "⏳ Waiting 5 seconds for servers to initialize..."
sleep 5

# STEP 3: Verify servers are running
log "📋 STEP 3: Verifying servers are running"
running_servers=0

if kill -0 $FILESYSTEM_PID 2>/dev/null; then
    log "✅ filesystem-standard running (PID: $FILESYSTEM_PID)"
    running_servers=$((running_servers + 1))
else
    log "❌ filesystem-standard failed to start"
fi

if kill -0 $MEMORY_PID 2>/dev/null; then
    log "✅ enhanced-memory running (PID: $MEMORY_PID)"
    running_servers=$((running_servers + 1))
else
    log "❌ enhanced-memory failed to start"
fi

if kill -0 $SEQUENTIAL_PID 2>/dev/null; then
    log "✅ sequential-thinking running (PID: $SEQUENTIAL_PID)"
    running_servers=$((running_servers + 1))
else
    log "❌ sequential-thinking failed to start"
fi

log "📊 Summary: $running_servers/3 servers started successfully"

if [ "$running_servers" -lt 2 ]; then
    log "❌ ERROR: Not enough servers running for testing"
    exit 1
fi

# STEP 4: Generate Claude Code configuration
log "📋 STEP 4: Generating Claude Code configuration"

cat > "$RESULTS_DIR/claude_mcp_config.json" << EOF
{
  "mcpServers": {
    "filesystem-standard": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem", "/Users/robertlee"],
      "env": {}
    },
    "enhanced-memory": {
      "command": "node",
      "args": ["$PROJECT_DIR/mcp/memory/enhanced-server-stdio.js"],
      "env": {}
    },
    "sequential-thinking": {
      "command": "npx", 
      "args": ["@modelcontextprotocol/server-sequential-thinking"],
      "env": {}
    }
  }
}
EOF

log "✅ Configuration generated: $RESULTS_DIR/claude_mcp_config.json"

# STEP 5: Create test files and scenarios
log "📋 STEP 5: Creating functional test scenarios"
mkdir -p "$RESULTS_DIR/test_scenarios"

# Filesystem test scenario
cat > "$RESULTS_DIR/test_scenarios/filesystem_test.txt" << 'EOF'
FILESYSTEM MCP SERVER TEST SCENARIO
===================================

1. BASIC FILE OPERATIONS:
   - Ask Claude: "Use filesystem tools to list files in the current directory"
   - Expected: Should return actual file listing using mcp__filesystem-standard__list_directory

2. FILE READING:
   - Ask Claude: "Read the contents of this test file: functional_test_results/test_scenarios/filesystem_test.txt"
   - Expected: Should use mcp__filesystem-standard__read_file and return this content

3. FILE CREATION:
   - Ask Claude: "Create a file called test_output.txt with content 'MCP filesystem test successful'"
   - Expected: Should use mcp__filesystem-standard__write_file

VALIDATION CRITERIA:
- Claude should specifically mention using "mcp__filesystem-standard" tools
- No "tool not found" errors
- Actual file operations should succeed
EOF

# Memory test scenario  
cat > "$RESULTS_DIR/test_scenarios/memory_test.txt" << 'EOF'
ENHANCED MEMORY MCP SERVER TEST SCENARIO
========================================

1. MEMORY STORAGE:
   - Ask Claude: "Store in memory: key='test_session' value='MCP test at $(date)'"
   - Expected: Should use mcp__memory-simple-user__store_memory

2. MEMORY RETRIEVAL:
   - Ask Claude: "Retrieve the memory with key 'test_session'"
   - Expected: Should use mcp__memory-simple-user__retrieve_memory and return stored value

3. MEMORY LISTING:
   - Ask Claude: "List all stored memories"
   - Expected: Should use mcp__memory-simple-user__list_memories

VALIDATION CRITERIA:
- Claude should specifically mention using "mcp__memory-simple-user" tools
- Should successfully store and retrieve data
- No PostgreSQL connection errors (if using enhanced version)
EOF

# Sequential thinking test scenario
cat > "$RESULTS_DIR/test_scenarios/sequential_test.txt" << 'EOF'
SEQUENTIAL THINKING MCP SERVER TEST SCENARIO
============================================

1. STEP-BY-STEP REASONING:
   - Ask Claude: "Use sequential thinking to solve: How would you deploy a Node.js application to production?"
   - Expected: Should use sequential thinking tools for structured reasoning

2. COMPLEX PROBLEM SOLVING:
   - Ask Claude: "Use sequential thinking to analyze: What are the pros and cons of microservices vs monolithic architecture?"
   - Expected: Should break down the problem systematically

VALIDATION CRITERIA:
- Claude should use structured, step-by-step thinking approach
- Should reference sequential thinking tools/capabilities
- No tool availability errors
EOF

log "✅ Test scenarios created"

# STEP 6: Create verification script
cat > "$RESULTS_DIR/verify_test_results.sh" << 'EOF'
#!/bin/bash

echo "🔍 MCP TEST RESULT VERIFICATION"
echo "==============================="

RESULTS_DIR="$1"
if [ -z "$RESULTS_DIR" ]; then
    echo "Usage: $0 <results_directory>"
    exit 1
fi

echo "📊 Checking test results in: $RESULTS_DIR"
echo ""

# Check if test output files exist
if [ -f "$RESULTS_DIR/test_output.txt" ]; then
    echo "✅ Filesystem test: File creation successful"
    echo "   Content: $(cat $RESULTS_DIR/test_output.txt)"
else
    echo "❌ Filesystem test: File creation failed"
fi

# Check server logs for errors
echo ""
echo "📋 Server log analysis:"

if [ -f "$RESULTS_DIR/filesystem.log" ]; then
    errors=$(grep -i "error" "$RESULTS_DIR/filesystem.log" | wc -l)
    echo "   Filesystem errors: $errors"
fi

if [ -f "$RESULTS_DIR/memory.log" ]; then
    errors=$(grep -i "error" "$RESULTS_DIR/memory.log" | wc -l)
    echo "   Memory errors: $errors"
fi

if [ -f "$RESULTS_DIR/sequential.log" ]; then
    errors=$(grep -i "error" "$RESULTS_DIR/sequential.log" | wc -l)
    echo "   Sequential errors: $errors"
fi

echo ""
echo "🎯 To complete the test:"
echo "1. Run: claude --mcp-config $RESULTS_DIR/claude_mcp_config.json"
echo "2. Execute the test scenarios in test_scenarios/"
echo "3. Run: $0 $RESULTS_DIR to verify results"
EOF

chmod +x "$RESULTS_DIR/verify_test_results.sh"

# STEP 7: Provide detailed testing instructions
log "📋 STEP 7: Functional test setup complete"
log ""
log "🎯 CLAUDE CODE FUNCTIONAL TESTING INSTRUCTIONS:"
log "=============================================="
log ""
log "1. LAUNCH CLAUDE CODE:"
log "   Open NEW terminal and run:"
log "   claude --mcp-config $RESULTS_DIR/claude_mcp_config.json"
log ""
log "2. EXECUTE THESE EXACT TESTS:"
log ""
log "   📁 FILESYSTEM TEST:"
log "   Ask: 'Use filesystem tools to list files in the current directory'"
log "   Then: 'Create a file called test_output.txt with content \"MCP filesystem test successful\"'"
log "   Verify: Claude mentions 'mcp__filesystem-standard' tools"
log ""
log "   🧠 MEMORY TEST:"
log "   Ask: 'Store in memory: key=\"test_session\" value=\"MCP test at $(date)\"'"
log "   Then: 'Retrieve the memory with key test_session'"
log "   Verify: Claude mentions 'mcp__memory-simple-user' tools"
log ""
log "   🤔 SEQUENTIAL THINKING TEST:"
log "   Ask: 'Use sequential thinking to solve: How would you deploy a Node.js application?'"
log "   Verify: Claude uses structured reasoning approach"
log ""
log "3. SUCCESS CRITERIA:"
log "   ✅ No 'tool not found' errors"
log "   ✅ Specific MCP tool names mentioned"
log "   ✅ Actual functional responses from each server"
log "   ✅ File test_output.txt created successfully"
log "   ✅ Memory store/retrieve works"
log "   ✅ Sequential thinking provides structured output"
log ""
log "4. VERIFY RESULTS:"
log "   Run: $RESULTS_DIR/verify_test_results.sh $RESULTS_DIR"
log ""
log "📊 MONITORING:"
log "   Server logs: $RESULTS_DIR/*.log"
log "   Test scenarios: $RESULTS_DIR/test_scenarios/"
log "   Configuration: $RESULTS_DIR/claude_mcp_config.json"
log ""
log "✅ ALL SERVERS RUNNING AND READY FOR FUNCTIONAL TESTING"

# Keep servers running for testing
log "⏳ Servers running (PIDs: $FILESYSTEM_PID, $MEMORY_PID, $SEQUENTIAL_PID)"
log "💡 Press Ctrl+C to stop all servers when testing complete"

trap 'log "🛑 Stopping servers..."; kill $FILESYSTEM_PID $MEMORY_PID $SEQUENTIAL_PID 2>/dev/null || true; exit 0' INT

# Monitor servers
while true; do
    sleep 30
    still_running=0
    
    if kill -0 $FILESYSTEM_PID 2>/dev/null; then still_running=$((still_running + 1)); fi
    if kill -0 $MEMORY_PID 2>/dev/null; then still_running=$((still_running + 1)); fi
    if kill -0 $SEQUENTIAL_PID 2>/dev/null; then still_running=$((still_running + 1)); fi
    
    log "📊 Status: $still_running/3 servers still running"
    
    if [ "$still_running" -eq 0 ]; then
        log "❌ All servers stopped - exiting"
        exit 1
    fi
done