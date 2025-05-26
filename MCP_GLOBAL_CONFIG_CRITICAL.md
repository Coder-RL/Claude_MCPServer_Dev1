# 🚨 MCP GLOBAL CONFIG - CRITICAL ISSUE

**Date**: May 26, 2025  
**Priority**: CRITICAL - Read this FIRST when working with MCP  
**Problem**: Repeatedly dealing with global vs local config issues

---

## 🔥 **THE PROBLEM WE KEEP FACING**

### **Issue**: MCP configs created locally don't persist
- Create config in project directory: `/Users/robertlee/GitHubProjects/Claude_MCPServer/config.json`
- Start Claude Code from different directory 
- **Result**: MCP servers not available - config "lost"
- **Waste time** recreating configs repeatedly

### **Root Cause**: Directory-dependent configurations
- Local configs only work when Claude Code starts from that exact directory
- Changing directories breaks MCP server access
- No persistence across sessions

---

## ✅ **THE SOLUTION: GLOBAL CONFIG ONLY**

### **ALWAYS Use Global Config**
```bash
# Global config location (ALWAYS use this):
~/.claude/claude_code_config.json

# Start Claude Code with global config:
claude --mcp-config ~/.claude/claude_code_config.json
```

### **NEVER Use Local Configs**
```bash
# These are WRONG - don't create configs in project directories:
./mcp_config.json                    # ❌ Local to current directory
./configs/claude_mcp.json           # ❌ Project-specific  
/Users/robertlee/some/path/config.json  # ❌ Absolute but not global
```

---

## 🎯 **GLOBAL CONFIG TEMPLATE**

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

**Key Points**:
- Use **absolute paths** for server files (not relative)
- Global config works from **any directory**
- **One config file** for all MCP servers

---

## 🔍 **HOW TO CHECK IF YOU'RE DOING IT RIGHT**

### **✅ Success Indicators**
```bash
# 1. Global config exists:
ls -la ~/.claude/claude_code_config.json
# Should show the file exists

# 2. Claude Code started correctly:
claude --mcp-config ~/.claude/claude_code_config.json
# Should load MCP servers regardless of current directory

# 3. MCP tools available:
# In Claude Code session, try: "Use memory tools to store test data"
# Should work and mention specific mcp__ tool names
```

### **❌ Failure Indicators**
```bash
# 1. Local configs being created:
ls -la ./mcp_config.json
ls -la ./configs/
# If these exist, you're doing it wrong

# 2. Directory-dependent behavior:
# MCP works from one directory but not another
# Indicates local config dependency

# 3. No MCP tools in Claude Code:
# No mcp__ tools available in session
# Indicates config not loaded
```

---

## 🚀 **IMMEDIATE ACTION PLAN**

### **Step 1: Clean Up Local Configs**
```bash
# Remove any local MCP configs you've created:
find . -name "*mcp*config*.json" -not -path "*/node_modules/*"
# Review and delete local configs
```

### **Step 2: Ensure Global Config Exists** 
```bash
# Check global config:
cat ~/.claude/claude_code_config.json
# Should show your MCP servers configuration
```

### **Step 3: Always Use Global Config**
```bash
# ALWAYS start Claude Code this way:
claude --mcp-config ~/.claude/claude_code_config.json

# NEVER start with local configs:
claude --mcp-config ./local_config.json  # ❌ DON'T DO THIS
```

### **Step 4: Test MCP Functionality**
```bash
# In Claude Code, test that MCP tools work:
# "Use filesystem tools to list current directory"
# "Store test data in memory"
# Should get specific mcp__ tool usage, not generic responses
```

---

## 📋 **TROUBLESHOOTING CHECKLIST**

**Problem**: MCP tools not available in Claude Code session

**Checklist**:
- [ ] Global config exists: `~/.claude/claude_code_config.json`
- [ ] Started Claude Code with: `claude --mcp-config ~/.claude/claude_code_config.json`
- [ ] Not using any local/project configs
- [ ] Server paths in config are absolute (not relative)
- [ ] Servers use STDIO transport (not HTTP)

**If all checked but still not working**:
1. Exit Claude Code completely
2. Restart with global config command above
3. Test MCP tools again

---

## 💡 **WHY THIS KEEPS HAPPENING**

### **Natural Instinct**: Create configs locally
- Feels logical to put configs in project directories
- Seems more "organized" or "project-specific"
- **But this breaks** when changing directories

### **MCP Reality**: Global persistence required
- Claude Code sessions need consistent server access
- Directory changes shouldn't break functionality  
- Global config provides this persistence

### **Solution**: Fight the instinct, always go global

---

**REMEMBER: One global config = MCP success across all directories and sessions**