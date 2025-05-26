# 🛠️ TROUBLESHOOTING GUIDE - Claude MCP Server Ecosystem

**Documentation Date**: 2025-05-24  
**Context**: Comprehensive troubleshooting guide based on resolved architecture issues  
**Scope**: Common problems, systematic diagnostics, and proven solutions

---

## 🚨 CRITICAL ISSUES RESOLVED (2025-05-24)

### **SESSION 2025-05-24: MAJOR CONFIGURATION BREAKTHROUGH** ✅ SOLVED:

#### **Configuration Environment Variable Mismatch** ✅ FIXED
**Symptoms**:
- MCP status shows some servers "connected" but others "failed"
- Servers work individually but fail Claude Code integration
- Pattern: 3 servers work, 7 servers fail

**Root Cause Discovered**:
```json
// ❌ BROKEN: STDIO servers with PORT environment variables
"data-pipeline": {
  "env": { "DATA_PIPELINE_PORT": "3011" }  // Causes STDIO servers to try HTTP mode
}

// ✅ FIXED: STDIO servers need ID environment variables  
"data-pipeline": {
  "env": { "DATA_PIPELINE_ID": "data-pipeline-server" }  // Proper STDIO mode
}
```

**Impact Analysis**:
- **Working servers** had ID variables: optimization, security-vulnerability, ui-design
- **Failing servers** had PORT variables: all data analytics servers + memory-simple
- **Claude Code config location**: `/Users/robertlee/.claude/claude_code_config.json` (not project config)

**✅ Complete Fix Applied**:
- Updated system config with correct ID variables for all servers
- Standardized project config for consistency
- Verified all servers work with corrected environment variables
- Updated startup scripts to include optimization server (was being skipped)

**✅ RESOLUTION COMPLETE**: All 10 servers now working with proper configuration. Final state: 10/10 connected after restart.

### **Previously Encountered Major Issues** ✅ SOLVED:

#### **1. MCP Server Connection Failures**
**Symptoms**: 
- Claude Code `/mcp` shows servers as "failed"
- Error: "Expected string, received object" in server logs
- MCP servers start but don't connect to Claude

**Root Causes Identified & Fixed**:
- **Method Signature Incompatibility**: Servers implementing `Promise<any>` instead of `Promise<CallToolResult>`
- **Return Value Format Violations**: Raw object returns instead of MCP CallToolResult format
- **Constructor Pattern Issues**: Object-based constructors instead of string-based parameters

**✅ Solutions Applied**:
```typescript
// Fixed method signatures:
async handleToolCall(name: string, args: any): Promise<CallToolResult> {
  const result = await this.service.doOperation(args);
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}

// Fixed constructor patterns:
constructor() {
  super('server-name', 'Description'); // String-based, not object
}

// Added required imports:
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
```

#### **2. Configuration Propagation Issues**
**Symptoms**:
- Configuration changes not reflected in Claude Code
- Servers show outdated behavior after config updates
- Cache issues preventing config reload

**✅ Solutions Applied**:
- **Multi-location Distribution**: Configs placed in all possible Claude locations
- **Cache Clearing**: Systematic removal of stale cache files
- **Path Corrections**: Fixed memory server path from non-existent to working location

#### **3. Architecture Protocol Violations**
**Symptoms**:
- Port conflicts during server startup
- EADDRINUSE errors on ports 3011-3015
- Hybrid STDIO/HTTP confusion

**✅ Solutions Applied**:
- **Pure STDIO Architecture**: Complete elimination of HTTP endpoints for MCP servers
- **StandardMCPServer Implementation**: MCP protocol compliant base class
- **Transport Standardization**: All servers use StdioServerTransport only

---

## 🔍 DIAGNOSTIC PROCEDURES

### **Quick Health Check (5 minutes)**:
```bash
# 1. Infrastructure Status:
docker ps | grep -E "(postgres|redis|qdrant)"
# Expected: 3 containers running

# 2. MCP Server Test:
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}' | npx tsx servers/data-analytics/src/data-governance.ts
# Expected: JSON response with tools list

# 3. Port Conflict Check:
lsof -i :3011,3012,3013,3014,3015
# Expected: No output (STDIO servers don't bind ports)

# 4. Configuration Validation:
ls -la ~/.claude-desktop/claude_desktop_config.json ~/.config/claude-desktop/claude_desktop_config.json
# Expected: Both files exist
```

### **Comprehensive System Validation**:
```bash
# Full ecosystem startup test:
cd /Users/robertlee/GitHubProjects/Claude_MCPServer
bash scripts/start-mcp-ecosystem.sh

# Expected output indicators:
# ✅ "PostgreSQL is ready!"
# ✅ "Redis is ready!"  
# ✅ "data-pipeline: 3 tools available"
# ✅ "memory-server: 5 tools available"
# ✅ "All servers verified working"
```

---

## 🛠️ SPECIFIC PROBLEM RESOLUTION

### **Problem: "MCP Server Failed to Connect"**

#### **Diagnostic Steps**:
1. **Check Error Logs**:
```bash
# View recent Claude Code logs:
ls -la /Users/robertlee/Library/Caches/claude-cli-nodejs/-Users-robertlee-GitHubProjects-Claude-MCPServer/

# Check specific server log:
tail -20 /Users/robertlee/Library/Caches/claude-cli-nodejs/-Users-robertlee-GitHubProjects-Claude-MCPServer/mcp-logs-data-governance/[latest-timestamp].txt
```

2. **Test Server Individually**:
```bash
# Test server starts without errors:
cd servers/data-analytics/src
timeout 5s npx tsx data-governance.ts
# Should start and stop cleanly without errors
```

3. **Verify Method Signatures**:
```bash
# Check for correct return type:
grep -n "handleToolCall.*Promise<" servers/data-analytics/src/data-governance.ts
# Should show: Promise<CallToolResult>
```

#### **Solutions by Error Type**:

**Error: "Expected string, received object"**:
```typescript
// Problem: Object-based constructor
constructor() {
  super({ name: 'server', port: 3015 }); // ❌ Wrong
}

// Solution: String-based constructor  
constructor() {
  super('server', 'Description'); // ✅ Correct
}
```

**Error: "Method signature mismatch"**:
```typescript
// Problem: Wrong return type
async handleToolCall(name: string, args: any): Promise<any> { // ❌ Wrong
  return { result: data };
}

// Solution: Correct return type and format
async handleToolCall(name: string, args: any): Promise<CallToolResult> { // ✅ Correct
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}
```

### **Problem: "Configuration Not Loading"**

#### **UPDATED: Configuration Location Discovery (2025-05-24)**:
**Critical Finding**: Claude Code uses **system config**, not project config!

```bash
# Primary config location (Claude Code uses this):
/Users/robertlee/.claude/claude_code_config.json

# Secondary locations (for backup/consistency):
config/claude-code/claude_code_config.json
~/.claude-desktop/claude_desktop_config.json
~/.config/claude-desktop/claude_desktop_config.json
```

#### **Diagnostic Steps**:
1. **Verify Config File Locations**:
```bash
# Check all possible config locations:
find ~ -name "*claude*config*" -type f 2>/dev/null | grep -v node_modules

# Check primary Claude Code config:
ls -la /Users/robertlee/.claude/claude_code_config.json
```

2. **Validate Config Syntax**:
```bash
# Test JSON syntax for primary config:
jq . /Users/robertlee/.claude/claude_code_config.json
# Should parse without errors
```

3. **Check Environment Variables**:
```bash
# Verify environment variable format:
grep -A 3 "env" /Users/robertlee/.claude/claude_code_config.json
# Should show ID variables, not PORT variables
```

4. **Check File Paths**:
```bash
# Verify server file paths exist:
ls -la /Users/robertlee/GitHubProjects/Claude_MCPServer/servers/data-analytics/src/data-governance.ts
ls -la /Users/robertlee/GitHubProjects/Claude_MCPServer/mcp/memory/simple-server.js
```

#### **Solutions**:

**Environment Variable Fix (2025-05-24)**:
```bash
# Fix the primary config file directly:
vim /Users/robertlee/.claude/claude_code_config.json

# Change all PORT variables to ID variables:
# OLD: "DATA_PIPELINE_PORT": "3011"
# NEW: "DATA_PIPELINE_ID": "data-pipeline-server"
```

**Config Distribution**:
```bash
# Distribute config to all Claude locations:
cp config/claude-desktop/claude_desktop_config.json ~/.claude-desktop/
cp config/claude-desktop/claude_desktop_config.json ~/.config/claude-desktop/
cp config/claude-desktop/claude_desktop_config.json ~/Library/Application\ Support/Claude/

# Ensure Claude Code config is also updated:
cp config/claude-code/claude_code_config.json /Users/robertlee/.claude/
```

**Cache Clearing + Restart**:
```bash
# Clear Claude Code cache:
rm -rf /Users/robertlee/Library/Caches/claude-cli-nodejs/

# CRITICAL: Complete Claude Code restart (not just reload)
# Exit Claude Code application entirely, then restart
```

### **Problem: "Port Conflicts (EADDRINUSE)"**

#### **Diagnostic Steps**:
1. **Identify Port Usage**:
```bash
# Check what's using conflicting ports:
lsof -i :3011,3012,3013,3014,3015,8000

# Kill conflicting processes:
pkill -f "node.*3011"
pkill -f "tsx.*data-"
```

2. **Verify Architecture**:
```bash
# Check for HTTP server creation:
grep -r "createServer\|listen.*port" servers/data-analytics/src/
# Should have no matches (pure STDIO servers)
```

#### **Solutions**:

**Eliminate HTTP Endpoints**:
```typescript
// Remove any HTTP server code:
❌ const server = http.createServer();
❌ app.listen(port);
❌ this.httpServer = ...;

// Use only STDIO transport:
✅ const transport = new StdioServerTransport();
✅ await this.server.connect(transport);
```

**Update Startup Scripts**:
```bash
# Remove port-based health checks:
# OLD: curl http://localhost:3011/health
# NEW: Test STDIO communication directly
```

### **Problem: "Database Connection Issues"**

#### **Diagnostic Steps**:
```bash
# Test database connectivity:
docker exec claude-mcp-postgres psql -U user -d mcp_enhanced -c "\dt"

# Test Redis connectivity:
docker exec claude-mcp-redis redis-cli ping

# Test Qdrant connectivity:
curl http://localhost:6333/collections
```

#### **Solutions**:
```bash
# Restart database infrastructure:
docker-compose down
docker-compose up -d

# Wait for services to be ready:
bash scripts/start-mcp-ecosystem.sh
```

---

## 🚀 PREVENTIVE MEASURES

### **Development Best Practices**:

#### **1. MCP Server Creation Checklist**:
- [ ] Extends `StandardMCPServer` (not `BaseMCPServer`)
- [ ] Uses string-based constructor: `super('name', 'description')`
- [ ] Implements `handleToolCall(): Promise<CallToolResult>`
- [ ] Returns proper CallToolResult format
- [ ] No HTTP server creation or port binding
- [ ] Includes required imports: `CallToolResult`

#### **2. Configuration Management**:
- [ ] Use absolute file paths in configurations
- [ ] Distribute configs to all Claude locations
- [ ] Test configuration syntax with `jq`
- [ ] Clear cache after configuration changes
- [ ] Restart Claude Code session for config reload

#### **3. Testing Protocol**:
```bash
# Before committing changes:
# 1. Test individual server startup:
timeout 5s npx tsx servers/path/to/server.ts

# 2. Test STDIO communication:
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}' | npx tsx servers/path/to/server.ts

# 3. Test ecosystem startup:
bash scripts/start-mcp-ecosystem.sh

# 4. Verify no port conflicts:
lsof -i :3011,3012,3013,3014,3015
```

---

## 📋 COMMON ERROR PATTERNS & SOLUTIONS

### **Error Pattern 1: TypeScript Compilation Errors**
```bash
# Symptom: Build fails with type errors
# Diagnosis: Check TypeScript configuration
npx tsc --noEmit

# Common solutions:
# - Add missing imports
# - Fix method signature mismatches  
# - Update return types to match interface
```

### **Error Pattern 2: Environment Variable Type Issues (2025-05-24)**
```bash
# Symptom: Servers start individually but fail in Claude integration
# Check environment variable format:
grep -A 3 "env" /Users/robertlee/.claude/claude_code_config.json

# WRONG (causes STDIO servers to try HTTP mode):
"env": { "DATA_PIPELINE_PORT": "3011" }

# CORRECT (proper STDIO mode):
"env": { "DATA_PIPELINE_ID": "data-pipeline-server" }
```

### **Error Pattern 3: Memory Server Path Issues**
```bash
# Symptom: memory-simple server not found
# Check config path:
grep -A 5 "memory-simple" /Users/robertlee/.claude/claude_code_config.json

# Should point to: mcp/memory/simple-server.js
# NOT: servers/memory/src/memory-server.ts (doesn't exist)
```

### **Error Pattern 3: Runtime JSON-RPC Errors**
```bash
# Symptom: Server starts but tool calls fail
# Diagnosis: Check return value format

# Wrong format:
return { result: data }; // ❌

# Correct format:
return { content: [{ type: 'text', text: JSON.stringify(data) }] }; // ✅
```

---

## 🆘 EMERGENCY RECOVERY PROCEDURES

### **Complete System Reset**:
```bash
# Nuclear option - reset everything:
cd /Users/robertlee/GitHubProjects/Claude_MCPServer

# 1. Stop all processes:
pkill -f node
pkill -f tsx
docker-compose down

# 2. Clean slate:
git stash  # Save any work
npm install

# 3. Restart infrastructure:
docker-compose up -d
bash scripts/start-mcp-ecosystem.sh

# 4. Clear Claude cache:
rm -rf /Users/robertlee/Library/Caches/claude-cli-nodejs/-Users-robertlee-GitHubProjects-Claude-MCPServer/

# 5. Restart Claude Code session
```

### **Partial Recovery (Configuration Only)**:
```bash
# If only config issues:
# 1. Re-distribute configurations:
cp config/claude-desktop/claude_desktop_config.json ~/.claude-desktop/
cp config/claude-desktop/claude_desktop_config.json ~/.config/claude-desktop/

# 2. Clear cache:
rm -rf /Users/robertlee/Library/Caches/claude-cli-nodejs/-Users-robertlee-GitHubProjects-Claude-MCPServer/

# 3. Restart Claude Code
```

---

## 🎯 SUCCESS VALIDATION

### **System Health Indicators**:
```bash
# All these should succeed after fixes:

# ✅ Infrastructure operational:
docker ps | grep claude-mcp | wc -l
# Expected: 3

# ✅ No port conflicts:
lsof -i :3011,3012,3013,3014,3015 | wc -l  
# Expected: 0

# ✅ MCP servers functional:
bash scripts/start-mcp-ecosystem.sh | grep "✅" | wc -l
# Expected: 8+

# ✅ Claude integration ready:
# Run /mcp in Claude Code - all servers show "connected"
```

### **Integration Test**:
```bash
# Final validation:
# 1. Restart Claude Code session
# 2. Run: /mcp
# 3. Expected: All servers show "connected" status
# 4. Ask Claude: "What MCP tools do you have available?"
# 5. Expected: List of 40+ available tools
```

---

## 📁 REFERENCE MATERIALS

### **Key Files for Troubleshooting**:
- `servers/shared/standard-mcp-server.ts` - Correct base class pattern
- `servers/data-analytics/src/data-governance.ts` - Example of fully fixed server
- `config/claude-desktop/claude_desktop_config.json` - Working configuration
- `scripts/start-mcp-ecosystem.sh` - System startup validation

### **Documentation References**:
- `SESSION_COMPLETION_SUCCESS.md` - Latest fixes and solutions
- `ARCHITECTURE_FIX_COMPLETE.md` - Technical remediation details
- `COMPREHENSIVE_PROJECT_OVERVIEW_2025-05-24.md` - Complete system analysis

---

## 🎉 CONCLUSION

This troubleshooting guide addresses all critical issues discovered and resolved during the comprehensive project analysis. The systematic layer-by-layer approach to architectural remediation has eliminated all major failure patterns, resulting in a stable, production-ready MCP server ecosystem.

**Current Status**: ✅ **ALL CRITICAL ISSUES RESOLVED**  
**System Stability**: ✅ **PRODUCTION READY**  
**Integration Status**: ✅ **CLAUDE COMPATIBLE**  

All solutions have been tested and validated. The system is ready for immediate productive use with Claude Desktop and Claude Code.