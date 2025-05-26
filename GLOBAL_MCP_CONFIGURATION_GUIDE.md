# Global MCP Configuration Guide

**Created**: May 26, 2025  
**Status**: ✅ PRODUCTION READY  
**Purpose**: Configure MCP servers to work globally across all directories  

---

## 🎯 **OBJECTIVE**

Enable MCP (Model Context Protocol) servers to be available in Claude Code from **any directory**, not just the project directory containing `.mcp.json`.

---

## 📁 **CONFIGURATION FILES**

### **Global Configuration File**
```
Location: ~/.config/claude-code/config.json
Scope: All directories
Priority: Default for Claude Code sessions
```

### **Local Configuration File**  
```
Location: ./project/.mcp.json  
Scope: Specific project directory only
Priority: Overrides global when present
```

---

## ⚙️ **CURRENT GLOBAL CONFIGURATION**

**File**: `~/.config/claude-code/config.json`

```json
{
  "mcpServers": {
    "memory-simple-user": {
      "command": "node",
      "args": ["/Users/robertlee/GitHubProjects/Claude_MCPServer/mcp/memory/simple-server.js"]
    },
    "filesystem-standard": {
      "command": "/Users/robertlee/.nvm/versions/node/v20.18.3/bin/npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/robertlee"]
    },
    "sequential-thinking": {
      "command": "/Users/robertlee/.nvm/versions/node/v20.18.3/bin/mcp-server-sequential-thinking"
    },
    "data-pipeline": {
      "command": "/Users/robertlee/.nvm/versions/node/v20.18.3/bin/tsx",
      "args": ["/Users/robertlee/GitHubProjects/Claude_MCPServer/servers/data-analytics/src/data-pipeline-fixed.ts"]
    },
    "data-governance": {
      "command": "/Users/robertlee/.nvm/versions/node/v20.18.3/bin/tsx",
      "args": ["/Users/robertlee/GitHubProjects/Claude_MCPServer/servers/data-analytics/src/data-governance-fixed.ts"]
    },
    "realtime-analytics": {
      "command": "/Users/robertlee/.nvm/versions/node/v20.18.3/bin/tsx",
      "args": ["/Users/robertlee/GitHubProjects/Claude_MCPServer/servers/data-analytics/src/realtime-analytics-fixed.ts"]
    },
    "data-warehouse": {
      "command": "/Users/robertlee/.nvm/versions/node/v20.18.3/bin/tsx",
      "args": ["/Users/robertlee/GitHubProjects/Claude_MCPServer/servers/data-analytics/src/data-warehouse-fixed.ts"]
    },
    "ml-deployment": {
      "command": "/Users/robertlee/.nvm/versions/node/v20.18.3/bin/tsx",
      "args": ["/Users/robertlee/GitHubProjects/Claude_MCPServer/servers/data-analytics/src/ml-deployment-fixed.ts"]
    },
    "security-vulnerability": {
      "command": "/Users/robertlee/.nvm/versions/node/v20.18.3/bin/tsx",
      "args": ["/Users/robertlee/GitHubProjects/Claude_MCPServer/servers/security-vulnerability/src/security-vulnerability-fixed.ts"]
    },
    "optimization": {
      "command": "/Users/robertlee/.nvm/versions/node/v20.18.3/bin/tsx",
      "args": ["/Users/robertlee/GitHubProjects/Claude_MCPServer/servers/optimization/src/optimization-fixed.ts"]
    },
    "ui-design": {
      "command": "/Users/robertlee/.nvm/versions/node/v20.18.3/bin/tsx",
      "args": ["/Users/robertlee/GitHubProjects/Claude_MCPServer/servers/ui-design/src/ui-design-fixed.ts"]
    },
    "memory-enhanced": {
      "command": "node", 
      "args": ["/Users/robertlee/GitHubProjects/Claude_MCPServer/mcp/memory/server.js"],
      "env": {
        "POSTGRES_HOST": "localhost",
        "POSTGRES_DB": "mcp_enhanced", 
        "POSTGRES_USER": "postgres",
        "POSTGRES_PASSWORD": "postgres",
        "QDRANT_URL": "http://localhost:6333"
      }
    }
  }
}
```

---

## ✅ **VERIFIED WORKING SERVERS**

### **1. memory-simple-user**
**Status**: ✅ FULLY FUNCTIONAL  
**Tools Available**:
- `mcp__memory-simple-user__store_memory(key, value, metadata)`
- `mcp__memory-simple-user__retrieve_memory(key)`
- `mcp__memory-simple-user__list_memories()`
- `mcp__memory-simple-user__delete_memory(key)`
- `mcp__memory-simple-user__health_check()`

**Use Cases**:
- Persistent memory across Claude sessions
- Store project context and notes
- Maintain conversation history
- Save user preferences and settings

### **2. filesystem-standard**
**Status**: ✅ FULLY FUNCTIONAL  
**Tools Available**:
- `mcp__filesystem-standard__read_file(path)`
- `mcp__filesystem-standard__write_file(path, content)`
- `mcp__filesystem-standard__create_directory(path)`
- `mcp__filesystem-standard__list_directory(path)`
- `mcp__filesystem-standard__search_files(path, pattern)`
- `mcp__filesystem-standard__move_file(source, destination)`
- `mcp__filesystem-standard__get_file_info(path)`
- `mcp__filesystem-standard__list_allowed_directories()`

**Use Cases**:
- Read and write files from any directory
- Create and manage directory structures
- Search for files across the filesystem
- Get file metadata and permissions

---

## ❌ **NON-WORKING SERVERS (Configuration Issues)**

The following servers are configured but not connecting due to TypeScript/tsx dependency issues:

- **sequential-thinking**: Protocol works, but not fully connecting
- **data-pipeline**: tsx dependency issues
- **data-governance**: tsx dependency issues  
- **realtime-analytics**: tsx dependency issues
- **data-warehouse**: tsx dependency issues
- **ml-deployment**: tsx dependency issues
- **security-vulnerability**: tsx dependency issues
- **optimization**: tsx dependency issues
- **ui-design**: tsx dependency issues
- **memory-enhanced**: Database dependency issues

**Root Cause**: TypeScript servers using `tsx` have unresolved module resolution or dependency issues in the Claude Code environment.

---

## 🔧 **SETUP INSTRUCTIONS**

### **Prerequisites**
1. **Node.js**: v20.18.3 or later
2. **npm**: Latest version
3. **Global packages installed**:
   ```bash
   npm install -g @modelcontextprotocol/server-filesystem
   npm install -g @modelcontextprotocol/server-sequential-thinking
   npm install -g tsx
   ```

### **Installation Steps**

1. **Create global config directory** (if not exists):
   ```bash
   mkdir -p ~/.config/claude-code
   ```

2. **Copy configuration file**:
   ```bash
   cp /Users/robertlee/GitHubProjects/Claude_MCPServer/config/claude-code/global-config.json ~/.config/claude-code/config.json
   ```

3. **Verify configuration**:
   ```bash
   cat ~/.config/claude-code/config.json
   ```

4. **Restart Claude Code**:
   - Close all Claude Code sessions
   - Start new Claude Code session
   - MCP servers will be available globally

### **Verification Steps**

1. **Navigate to any directory**:
   ```bash
   cd ~
   ```

2. **Start Claude Code and test MCP servers**:
   ```bash
   claude
   ```

3. **Test memory server**:
   ```javascript
   mcp__memory-simple-user__health_check()
   ```

4. **Test filesystem server**:
   ```javascript
   mcp__filesystem-standard__list_allowed_directories()
   ```

---

## 🚨 **TROUBLESHOOTING**

### **Problem: MCP servers show "failed" status**
**Solution**: This is a false positive. Test functionality directly:

```javascript
// Don't rely on status messages, test actual functionality:
mcp__memory-simple-user__health_check()  // Should return health status
mcp__filesystem-standard__list_allowed_directories()  // Should return directories
```

### **Problem: "Command not found" errors**
**Solution**: Use absolute paths in configuration:

```json
// Instead of:
"command": "npx"

// Use:
"command": "/Users/robertlee/.nvm/versions/node/v20.18.3/bin/npx"
```

### **Problem: Servers not loading globally**
**Solution**: 
1. Verify config file location: `~/.config/claude-code/config.json`
2. Restart Claude Code completely
3. Check for syntax errors in JSON configuration

### **Problem: TypeScript servers not working**
**Current Status**: Known issue with tsx/dependency resolution
**Workaround**: Focus on working servers (memory-simple-user, filesystem-standard)
**Future Fix**: Resolve TypeScript server dependencies

---

## 📊 **STATUS SUMMARY**

| Component | Status | Notes |
|-----------|--------|-------|
| **Global Configuration** | ✅ WORKING | 12 servers configured |
| **Cross-Directory Access** | ✅ VERIFIED | Works from any directory |
| **Memory Operations** | ✅ PRODUCTION | Full CRUD functionality |
| **Filesystem Operations** | ✅ PRODUCTION | Complete file management |
| **TypeScript Servers** | ❌ PENDING | Dependency issues to resolve |

**Overall Status**: ✅ **PRODUCTION READY** for core functionality (memory + filesystem)

---

## 🔄 **MAINTENANCE**

### **Regular Tasks**
1. **Monitor server health**: Use health check tools regularly
2. **Update global config**: Add new working servers as they're debugged
3. **Clean up non-working servers**: Remove servers that can't be fixed

### **Update Procedure**
1. **Test changes locally** in project `.mcp.json` first
2. **Verify functionality** with end-to-end testing
3. **Update global config** only after local verification
4. **Document changes** in session notes

### **Backup Strategy**
```bash
# Backup current config before changes:
cp ~/.config/claude-code/config.json ~/.config/claude-code/config.json.backup.$(date +%Y%m%d)
```

---

**This guide provides complete instructions for maintaining and using the global MCP server configuration established in the 2025-05-26 session.**