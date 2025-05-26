# 🚨 MCP QUICK REFERENCE - CRITICAL ISSUES

**ALWAYS CHECK THIS FIRST** - These are the two issues that repeatedly cause problems:

---

## 🔥 **ISSUE #1: GLOBAL CONFIG REQUIRED**

### **❌ COMMON MISTAKE**
```bash
# Creating local configs that get lost:
claude --mcp-config ./project_config.json
claude --mcp-config /Users/robertlee/GitHubProjects/Claude_MCPServer/config.json
```

### **✅ CORRECT SOLUTION**
```bash
# ALWAYS use global config:
claude --mcp-config ~/.claude/claude_code_config.json
# OR if global config is set as default:
claude --debug
```

### **Why This Matters**
- Local configs are **lost when changing directories**
- MCP servers become **unavailable in new sessions**
- **Wastes time** recreating configs repeatedly

---

## ⚡ **ISSUE #2: STDIO TRANSPORT REQUIRED**

### **❌ COMMON MISTAKE**
```javascript
// HTTP servers DON'T WORK with Claude Code:
const server = http.createServer();
server.listen(3201);
console.log("Server listening on port 3201"); // ❌ WRONG
```

### **✅ CORRECT SOLUTION**
```javascript
// STDIO servers work with Claude Code:
process.stdin.on('data', handleMCPRequest);
process.stdout.write(response);
console.log("Server running on stdio"); // ✅ CORRECT
```

### **Why This Matters**
- Claude Code **only supports STDIO** communication
- HTTP servers **cannot connect** to Claude Code
- **No ports, no networking** - STDIO only

---

## 🎯 **IMMEDIATE ACTION CHECKLIST**

Before working with MCP servers, verify:

### **Global Config Check**
```bash
# 1. Verify global config exists:
ls -la ~/.claude/claude_code_config.json

# 2. Check current session has MCP tools:
# Try any mcp__ tool in Claude Code
# If none work, restart Claude Code with global config
```

### **STDIO Server Check**
```bash
# 3. Verify servers use STDIO (not HTTP):
# Server logs should show "running on stdio"
# NOT "listening on port"
```

### **Common Fixes**
```bash
# If MCP tools not available:
exit  # Exit current Claude Code session
claude --mcp-config ~/.claude/claude_code_config.json  # Restart with global config

# If servers won't connect:
# Check server logs for "running on stdio" (not port messages)
# Convert HTTP servers to STDIO if needed
```

---

## 📋 **SUCCESS INDICATORS**

### **✅ WORKING SETUP**
- Global config: `~/.claude/claude_code_config.json` exists
- Claude Code started with: `claude --mcp-config ~/.claude/claude_code_config.json`
- Server logs show: "running on stdio"
- MCP tools available: `mcp__server-name__tool-name` works in Claude Code

### **❌ BROKEN SETUP**
- Local configs: `./config.json` or project-specific paths
- Claude Code started without MCP config
- Server logs show: "listening on port"
- No MCP tools available in Claude Code session

---

## 🔧 **TEMPLATE: GLOBAL MCP CONFIG**

**File**: `~/.claude/claude_code_config.json`
```json
{
  "mcpServers": {
    "filesystem-standard": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem", "/Users/robertlee"],
      "env": {}
    },
    "memory-simple": {
      "command": "node",
      "args": ["/Users/robertlee/GitHubProjects/Claude_MCPServer/mcp/memory/enhanced-server-stdio.js"],
      "env": {}
    },
    "sequential-thinking": {
      "command": "npx", 
      "args": ["@modelcontextprotocol/server-sequential-thinking"],
      "env": {}
    }
  }
}
```

**Start Command**: `claude --mcp-config ~/.claude/claude_code_config.json`

---

**REMEMBER: Global config + STDIO servers = MCP success**