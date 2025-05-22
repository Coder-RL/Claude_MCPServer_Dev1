# 🖥️ Claude Code MCP Setup Instructions

## Prerequisites
1. **Start your MCP servers:**
   ```bash
   cd /Users/robertlee/GitHubProjects/Claude_MCPServer
   bash scripts/start-mcp-ecosystem.sh
   ```

2. **Verify servers are running:**
   ```bash
   curl http://localhost:3301/health
   curl http://localhost:3011/health
   curl http://localhost:3012/health
   curl http://localhost:3013/health
   curl http://localhost:3014/health
   curl http://localhost:3015/health
   ```

## Claude Code MCP Configuration

### Step 1: Add Memory Simple MCP
```bash
claude mcp add memory-simple -e PORT=3301 -- node /Users/robertlee/GitHubProjects/Claude_MCPServer/mcp/memory/simple-server.js
```

### Step 2: Add Sequential Thinking MCP
```bash
claude mcp add sequential-thinking -- npx -y @modelcontextprotocol/server-sequential-thinking
```

### Step 3: Add Data Analytics MCP Servers

**Data Pipeline:**
```bash
claude mcp add data-pipeline -e DATA_PIPELINE_PORT=3011 -- tsx /Users/robertlee/GitHubProjects/Claude_MCPServer/servers/data-analytics/src/data-pipeline.ts
```

**Realtime Analytics:**
```bash
claude mcp add realtime-analytics -e REALTIME_ANALYTICS_PORT=3012 -- tsx /Users/robertlee/GitHubProjects/Claude_MCPServer/servers/data-analytics/src/realtime-analytics.ts
```

**Data Warehouse:**
```bash
claude mcp add data-warehouse -e DATA_WAREHOUSE_PORT=3013 -- tsx /Users/robertlee/GitHubProjects/Claude_MCPServer/servers/data-analytics/src/data-warehouse.ts
```

**ML Deployment:**
```bash
claude mcp add ml-deployment -e ML_DEPLOYMENT_PORT=3014 -- tsx /Users/robertlee/GitHubProjects/Claude_MCPServer/servers/data-analytics/src/ml-deployment.ts
```

**Data Governance:**
```bash
claude mcp add data-governance -e DATA_GOVERNANCE_PORT=3015 -- tsx /Users/robertlee/GitHubProjects/Claude_MCPServer/servers/data-analytics/src/data-governance.ts
```

## Verification Commands

### List All MCP Servers:
```bash
claude mcp list
```

### Check Specific Server:
```bash
claude mcp get memory-simple
claude mcp get data-pipeline
```

### Remove a Server (if needed):
```bash
claude mcp remove <server-name>
```

## Quick Setup Script

Run this automated setup:
```bash
bash scripts/setup-claude-code-mcp.sh
```

## Test Your Setup

In Claude Code, try:
- "Can you access my memory MCP server?"
- "Show me data pipeline status"
- "What analytics servers are available?"
- "Can you help me with data warehouse operations?"

## Troubleshooting

### MCP Server Not Found:
```bash
# Check if servers are running
lsof -i :3301,3011,3012,3013,3014,3015

# Restart MCP ecosystem
bash scripts/start-mcp-ecosystem.sh
```

### Permission Issues:
```bash
# Use --scope flag for different configuration levels
claude mcp add --scope user memory-simple -e PORT=3301 -- node /path/to/server.js
```

### Environment Variables:
```bash
# Add multiple environment variables
claude mcp add data-pipeline \
  -e DATA_PIPELINE_PORT=3011 \
  -e NODE_ENV=development \
  -e DEBUG=true \
  -- tsx /path/to/data-pipeline.ts
```

---

**All 6 MCP servers will now be available in Claude Code!** 🚀