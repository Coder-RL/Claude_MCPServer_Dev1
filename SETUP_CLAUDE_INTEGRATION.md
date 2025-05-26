# 🔗 Claude Desktop & Claude Code Integration Setup

## Prerequisites

1. **Start your MCP servers first:**
   ```bash
   cd /Users/robertlee/GitHubProjects/Claude_MCPServer
   bash scripts/start-mcp-ecosystem.sh
   ```

2. **Verify servers are running:**
   ```bash
   curl http://localhost:3301/health
   ```

## Claude Desktop Setup

### Step 1: Find Claude Desktop Config Location
```bash
# macOS default location
~/Library/Application Support/Claude/claude_desktop_config.json
```

### Step 2: Copy Our Configuration
```bash
# Copy our config to Claude Desktop
cp /Users/robertlee/GitHubProjects/Claude_MCPServer/config/claude-desktop/claude_desktop_config.json ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

### Step 3: Restart Claude Desktop
- Quit Claude Desktop completely
- Restart Claude Desktop
- You should see MCP servers connecting in the status bar

## Claude Code Setup

### Step 1: Find Claude Code Config Location
Claude Code uses a different config location (check Claude Code documentation for exact path).

### Step 2: Add MCP Configuration
Add this to your Claude Code configuration:
```json
{
  "mcpServers": {
    "memory-simple": {
      "command": "node",
      "args": ["/Users/robertlee/GitHubProjects/Claude_MCPServer/mcp/memory/simple-server.js"],
      "env": {
        "PORT": "3301"
      }
    },
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    }
  }
}
```

## Quick Setup Commands

### Option 1: Manual Copy for Claude Desktop
```bash
# Ensure MCP servers are running
bash scripts/start-mcp-ecosystem.sh

# Copy config for Claude Desktop
mkdir -p ~/Library/Application\ Support/Claude/
cp config/claude-desktop/claude_desktop_config.json ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Restart Claude Desktop
```

### Option 2: Automated Setup Script
```bash
# Run our setup script (if available)
bash scripts/setup-claude-integration.sh
```

## Verification

### Test in Claude Desktop:
1. Open Claude Desktop
2. Type: "Can you access my memory?"
3. You should see the memory MCP server responding

### Test in Claude Code:
1. Open Claude Code
2. Check the MCP server status
3. Try memory-related commands

## Troubleshooting

### MCP Servers Not Connecting:
1. **Check if servers are running:**
   ```bash
   curl http://localhost:3301/health
   lsof -i :3301
   ```

2. **Check Claude logs for connection errors**

3. **Verify file paths in config are correct**

### Configuration Issues:
1. **Ensure JSON syntax is valid**
2. **Check file permissions**
3. **Verify absolute paths are correct**

## Available MCP Servers

Once connected, you'll have access to:

- **Memory Simple MCP (Port 3301)**: Store and retrieve memories
- **Sequential Thinking**: Advanced reasoning capabilities
- **Data Analytics Suite**: 
  - Data Pipeline (Port 3011)
  - Realtime Analytics (Port 3012) 
  - Data Warehouse (Port 3013)
  - ML Deployment (Port 3014)
  - Data Governance (Port 3015)

## Next Steps

1. Start your MCP ecosystem
2. Configure Claude Desktop/Code
3. Test the integration
4. Explore memory and analytics capabilities

---

For more details, see the startup guide: `docs/STARTUP_GUIDE.md`