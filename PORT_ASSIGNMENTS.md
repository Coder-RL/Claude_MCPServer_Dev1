# Port Assignment Registry

## Reserved Ports

### Infrastructure Services Only
- **No MCP servers use HTTP ports** - All MCP servers are pure STDIO

### Infrastructure Services  
- **5432**: PostgreSQL (Docker)
- **6379**: Redis (Docker)
- **6333**: Qdrant Vector Database (Docker)

### STDIO MCP Servers (no ports - Claude Desktop/Code managed)
- **data-pipeline**: Pure STDIO, 3 tools
- **realtime-analytics**: Pure STDIO, 3 tools  
- **data-warehouse**: Pure STDIO, 2 tools
- **ml-deployment**: Pure STDIO, 6 tools
- **data-governance**: Pure STDIO, 7 tools
- **memory-server**: Pure STDIO, 5 tools
- **security-vulnerability**: Pure STDIO, 6 tools
- **ui-design**: Pure STDIO, 8 tools

### Port Management Rules
1. HTTP servers must use consistent port assignments
2. STDIO servers never bind to ports
3. All port assignments are documented here
4. No port conflicts allowed

### Usage
- Start ecosystem: `bash scripts/start-mcp-ecosystem.sh`
- Stop ecosystem: `bash scripts/stop-mcp-ecosystem.sh`
EOF < /dev/null