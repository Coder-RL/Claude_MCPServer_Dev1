# MCP CRITICAL REQUIREMENTS - MANDATORY

**Date**: May 26, 2025  
**Status**: MANDATORY REQUIREMENTS  
**Applies to**: ALL MCP servers and Claude Code sessions  

---

## 🚨 **TWO MANDATORY REQUIREMENTS**

### **REQUIREMENT #1: ALL MCP SERVERS MUST USE STDIO COMMUNICATION**
**No exceptions. No HTTP. No WebSocket. No TCP. STDIO ONLY.**

### **REQUIREMENT #2: ALL MCP CONFIGS MUST BE GLOBAL, NOT LOCAL**
**No project-specific configs. Global `~/.claude/claude_code_config.json` ONLY.**

---

## 🔥 **GLOBAL CONFIG REQUIREMENT**

### **❌ WRONG: Local/Project-Specific Config**
```bash
# These FAIL - configs are lost when changing directories:
claude --mcp-config ./local_config.json
claude --mcp-config /some/project/mcp_config.json
```

### **✅ CORRECT: Global Config Only**
```bash
# This WORKS - config persists across all directories:
claude --mcp-config ~/.claude/claude_code_config.json
# OR (if global config is default):
claude --debug
```

### **Global Config Location**
- **File**: `~/.claude/claude_code_config.json`
- **Scope**: Works from ANY directory
- **Persistence**: Survives directory changes and session restarts

### **Why Global Config is Mandatory**
1. **Directory Independence**: Works regardless of where Claude Code starts
2. **Session Persistence**: Config survives restarts and directory changes  
3. **Consistent Access**: Same MCP servers available everywhere
4. **No Lost Configs**: Never lose server access due to directory location

### **Why STDIO is Required**
1. **Claude Code Compatibility**: Claude Code only supports STDIO communication
2. **Simplicity**: No port management, no networking complexity
3. **Security**: Process-to-process communication, no network exposure
4. **Reliability**: Direct process communication, no network failures
5. **Standardization**: MCP protocol standard expects STDIO

### **Configuration Requirements**
```json
// CORRECT (STDIO):
{
  "command": "node",
  "args": ["path/to/server.js"]
  // No port, no HTTP, no network configuration
}

// INCORRECT (HTTP):
{
  "command": "node", 
  "args": ["path/to/server.js", "--port", "3201"]
  // ❌ NEVER USE PORTS OR HTTP
}
```

### **Server Implementation Requirements**
```javascript
// CORRECT (STDIO):
process.stdin.on('data', (data) => {
  // Handle MCP requests from stdin
});

process.stdout.write(JSON.stringify(response));

// INCORRECT (HTTP):
const server = http.createServer(); // ❌ NEVER USE HTTP
server.listen(3201); // ❌ NEVER USE PORTS
```

---

## 🔧 **FIXING SERVERS THAT USE HTTP**

### **Enhanced Memory Server Fix Required**
The enhanced memory server currently uses HTTP and MUST be converted to STDIO.

**Current Issue**:
```bash
node /Users/robertlee/GitHubProjects/Claude_MCPServer/mcp/memory/server.js
# Output: "Memory MCP Server listening on port 3201" ❌ WRONG
```

**Required Fix**:
```bash
node /Users/robertlee/GitHubProjects/Claude_MCPServer/mcp/memory/server.js  
# Output: "Memory MCP Server running on stdio" ✅ CORRECT
```

---

## 📋 **VERIFICATION CHECKLIST**

Before configuring any MCP server:

- [ ] **Server outputs "running on stdio"** (not "listening on port")
- [ ] **No HTTP server creation** in server code
- [ ] **No port configuration** in command arguments
- [ ] **Responds to STDIO MCP protocol** test
- [ ] **Configuration uses only command + args** (no port/HTTP settings)

### **STDIO Test Command**
```bash
echo '{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "test", "version": "1.0.0"}}}' | node path/to/server.js
# Must return MCP response via stdout, not HTTP
```

---

**THIS IS NON-NEGOTIABLE. ALL MCP SERVERS MUST USE STDIO.**