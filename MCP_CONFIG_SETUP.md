# MCP Configuration Setup for Dev1 Project

## ✅ Configuration Complete

### Global Configs Created:
- **Main Project**: `~/.claude/claude_code_config.json` → Points to `Claude_MCPServer`
- **Dev1 Project**: `~/.claude/claude_code_config_dev1.json` → Points to `Claude_MCPServer_Dev1`

### Running Both Projects Simultaneously:

#### Terminal 1 - Main Project:
```bash
cd /Users/robertlee/GitHubProjects/Claude_MCPServer
claude --mcp-config ~/.claude/claude_code_config.json
```

#### Terminal 2 - Dev1 Project:
```bash
cd /Users/robertlee/GitHubProjects/Claude_MCPServer_Dev1
claude --mcp-config ~/.claude/claude_code_config_dev1.json
```

### ✅ No Port Conflicts
All MCP servers use STDIO transport (not HTTP ports), so both projects can run simultaneously without conflicts.

### Server Mappings:

#### Main Project Servers:
- Point to `/Users/robertlee/GitHubProjects/Claude_MCPServer/servers/...`
- Sequential-thinking: `/Users/robertlee/GitHubProjects/Claude_MCPServer/mcp/sequential-thinking/server.js`

#### Dev1 Project Servers:
- Point to `/Users/robertlee/GitHubProjects/Claude_MCPServer_Dev1/servers/...`
- Sequential-thinking: `/Users/robertlee/GitHubProjects/Claude_MCPServer_Dev1/mcp/sequential-thinking/server.js`

### Shared Servers (No Conflicts):
- `filesystem-standard`: Uses global npx package
- `memory-enhanced`: Uses global npx package

Both configurations are completely independent and can run concurrently.