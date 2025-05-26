# MCP Server Connection - Final Solution

## Problem Root Cause
Claude Code is launched from `/Users/robertlee` but expects MCP servers to work from any directory. The transport is closing because of path resolution and dependency issues.

## Complete Solution

### Step 1: Apply Minimal Working Configuration
```bash
# From your current Claude Code session, run:
cp /Users/robertlee/GitHubProjects/Claude_MCPServer/config/claude-code/claude_code_config_minimal.json ~/.config/claude-code/claude_code_config.json
```

### Step 2: Restart Claude Code Process
```bash
# Kill all Claude Code processes and restart
pkill -f "claude.*code"
# Wait 5 seconds then restart Claude Code
```

### Step 3: Test Connection
```bash
# In new Claude Code session:
mcp
```

## Why This Works
1. **Simple node command**: Uses system `node` instead of full nvm path
2. **Absolute file paths**: No relative path dependencies
3. **Minimal configuration**: Single server reduces complexity
4. **Proven server code**: The simple-server.js works in all test scenarios

## Expected Result
```
MCP Server Status
• memory-simple-user: connected
```

## If Still Failing - Debugging Steps

### Check logs:
```bash
ls -la "/Users/robertlee/Library/Caches/claude-cli-nodejs/-Users-robertlee/mcp-logs-memory-simple-user/"
cat "/Users/robertlee/Library/Caches/claude-cli-nodejs/-Users-robertlee/mcp-logs-memory-simple-user"/*.txt
```

### Manual server test:
```bash
# Should start and show "Memory Simple MCP server started"
timeout 5s node /Users/robertlee/GitHubProjects/Claude_MCPServer/mcp/memory/simple-server.js
```

### Alternative minimal config if needed:
```json
{
  "mcpServers": {
    "memory-test": {
      "command": "/usr/local/bin/node",
      "args": ["/Users/robertlee/GitHubProjects/Claude_MCPServer/mcp/memory/simple-server.js"]
    }
  }
}
```

## Once Working - Add Enhanced Memory
After the simple server connects, we can add back the enhanced memory server using the wrapper script:

```json
{
  "mcpServers": {
    "memory-simple-user": {
      "command": "node",
      "args": ["/Users/robertlee/GitHubProjects/Claude_MCPServer/mcp/memory/simple-server.js"],
      "env": {
        "MEMORY_ID": "memory-simple-user"
      }
    },
    "enhanced-memory": {
      "command": "/Users/robertlee/GitHubProjects/Claude_MCPServer/scripts/start-enhanced-memory.sh",
      "args": []
    }
  }
}
```

## Tools Available After Connection
- `store_memory` - Store key-value pairs
- `retrieve_memory` - Get stored values
- `list_memories` - List all memories
- `delete_memory` - Remove memories
- `health_check` - Server status