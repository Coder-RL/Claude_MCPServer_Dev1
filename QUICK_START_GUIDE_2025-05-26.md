# QUICK START GUIDE - Get Running in 5 Minutes

**Date**: May 26, 2025  
**Purpose**: Get productive immediately with working MCP servers  
**Time to Complete**: 5 minutes  

---

## ⚡ **INSTANT PRODUCTIVITY - TEST WORKING SERVERS NOW**

### **Step 1: Verify You're in the Right Place (30 seconds)**
```bash
# Check if you're in the project directory:
pwd
# Should show: /Users/robertlee/GitHubProjects/Claude_MCPServer

# Verify core files exist:
ls -la ~/.config/claude-code/config.json
ls -la mcp/memory/simple-server.js

# If either file is missing, see "Setup" section below
```

### **Step 2: Test Production MCP Servers (2 minutes)**
Open Claude Code and run these commands to verify functionality:

#### **Test Memory Server**
```javascript
// Check server health
mcp__memory-simple-user__health_check()
// Expected: {"status": "healthy", "service": "memory-simple", "version": "1.0.0", ...}

// Store some data
mcp__memory-simple-user__store_memory("test-key", "Hello MCP World!", {"timestamp": "2025-05-26"})
// Expected: "Memory stored successfully: test-key"

// Retrieve the data
mcp__memory-simple-user__retrieve_memory("test-key")
// Expected: {"key": "test-key", "value": "Hello MCP World!", "metadata": {...}, "created": "..."}

// List all memories
mcp__memory-simple-user__list_memories()
// Expected: {"count": 1, "memories": [{"key": "test-key", "created": "..."}]}
```

#### **Test Filesystem Server**
```javascript
// Check allowed directories
mcp__filesystem-standard__list_allowed_directories()
// Expected: "Allowed directories: /Users/robertlee"

// Create a test directory
mcp__filesystem-standard__create_directory("/Users/robertlee/mcp-test")
// Expected: "Successfully created directory /Users/robertlee/mcp-test"

// Write a test file
mcp__filesystem-standard__write_file("/Users/robertlee/mcp-test/test.txt", "MCP filesystem test")
// Expected: "Successfully wrote to /Users/robertlee/mcp-test/test.txt"

// Read the file back
mcp__filesystem-standard__read_file("/Users/robertlee/mcp-test/test.txt")
// Expected: "MCP filesystem test"

// Clean up
rm -rf /Users/robertlee/mcp-test
```

### **Step 3: Verify Global Access (1 minute)**
```bash
# Change to a different directory
cd ~

# Start Claude Code from home directory
claude

# Test that MCP servers still work (run same commands as Step 2)
# This confirms global configuration is working
```

### **Step 4: Check Status (Ignore "Failed" Messages) (1 minute)**
```bash
# From any directory, check MCP status
mcp
```

**Expected Output (Don't Worry About "Failed"):**
```
MCP Server Status

• filesystem-standard: connected
• memory-simple-user: connected  
• sequential-thinking: failed    ← IGNORE: This is a false positive
```

**Key Point**: The "failed" status for sequential-thinking is a **known false positive**. The memory and filesystem servers are what matter and they show "connected".

### **Step 5: Understanding Current Capabilities (30 seconds)**

**You Now Have:**
1. **Persistent Memory**: Claude remembers things between sessions
2. **Global File Access**: Claude can read/write files from any directory
3. **Cross-Directory Workflow**: Same capabilities everywhere

**Immediate Use Cases:**
- Store project notes and context that persist across Claude sessions
- Read configuration files, code, and documents from anywhere
- Write files, create directories, and manage filesystem from Claude
- Build knowledge base that grows over time

---

## 🚨 **QUICK TROUBLESHOOTING**

### **Problem: `mcp__memory-simple-user__` commands not found**
```bash
# Check global config exists:
cat ~/.config/claude-code/config.json

# If missing, copy from project:
cp /Users/robertlee/GitHubProjects/Claude_MCPServer/.mcp.json ~/.config/claude-code/config.json

# Restart Claude Code
```

### **Problem: "Permission denied" or "File not found"**
```bash
# Check Node.js version:
node --version
# Should be v20.18.3 or similar

# Check if memory server starts manually:
node /Users/robertlee/GitHubProjects/Claude_MCPServer/mcp/memory/simple-server.js
# Should output: "Memory Simple MCP server started"
# Press Ctrl+C to stop
```

### **Problem: Filesystem operations fail**
```bash
# Check if official filesystem server is installed:
which mcp-server-filesystem
# Should show path or run: npm install -g @modelcontextprotocol/server-filesystem
```

---

## 🎯 **WHAT TO DO NEXT**

### **If Everything Works (Normal Case)**
1. **Start Using**: Use memory server to store project context
2. **Explore**: Try different filesystem operations  
3. **Learn More**: Read `COMPLETE_PROJECT_CONTEXT_BRIDGE_2025-05-26.md`
4. **Expand**: Look into debugging non-working servers

### **If You Want to Debug More Servers**
1. **Pick One**: Choose `data-pipeline` or `security-vulnerability`
2. **Read Logs**: Check why TypeScript servers aren't connecting
3. **Fix Dependencies**: Resolve tsx/module issues systematically

### **If You Want to Understand the Full Project**
1. **Read Context Bridge**: `COMPLETE_PROJECT_CONTEXT_BRIDGE_2025-05-26.md`
2. **Review Architecture**: See what 165+ servers are available
3. **Study Evolution**: Understand the 3-phase development approach

---

## 📊 **SUCCESS METRICS**

**You've succeeded in this Quick Start if:**
- [x] Memory server health check returns "healthy"
- [x] You can store and retrieve data with memory server
- [x] You can create files and directories with filesystem server  
- [x] MCP servers work from multiple directories (global access confirmed)
- [x] You understand the "failed" status is a false positive for sequential-thinking

**Total Time**: Should complete in 5 minutes or less

**Next Step**: You're now ready to use MCP servers productively or dive deeper into the project architecture.

---

## 🔗 **REFERENCE LINKS**

- **Complete Project Context**: `COMPLETE_PROJECT_CONTEXT_BRIDGE_2025-05-26.md`
- **Global Configuration Guide**: `GLOBAL_MCP_CONFIGURATION_GUIDE.md`  
- **Troubleshooting**: `MCP_TROUBLESHOOTING_GUIDE_2025-05-26.md`
- **Latest Session**: `SESSION_2025-05-26_GLOBAL_MCP_INTEGRATION_COMPLETE.md`

**This Quick Start gets you productive immediately. The other documents provide complete context and expansion strategies.**