# Simultaneous Setup Guide - Running Both Projects

## Overview
This guide explains how to run both the main Claude_MCPServer and Claude_MCPServer_Dev1 projects simultaneously without conflicts.

## Port Separation Summary

### Main Project (`Claude_MCPServer`)
- PostgreSQL: 5432
- Redis: 6379  
- Qdrant: 6333/6334
- etcd: 2379/2380
- Orchestration: 3100
- Services: 3101-3107, 3201-3203

### Dev1 Project (`Claude_MCPServer_Dev1`)
- PostgreSQL: 5442 (+10)
- Redis: 6389 (+10)
- Qdrant: 6343/6344 (+10)
- etcd: 2389/2390 (+10)
- Orchestration: 3200 (avoiding 3100 conflict)
- Services: 3111-3117, 3211-3213 (+10)

## Container Name Separation
- Main: `claude-mcp-*`
- Dev1: `claude-mcp-*-dev1`

## Network Separation
- Main: `claude-mcp-network`
- Dev1: `claude-mcp-network-dev1`

## Starting Both Projects

### Terminal 1 - Main Project
```bash
cd /Users/robertlee/GitHubProjects/Claude_MCPServer
bash scripts/start-mcp-ecosystem.sh
```

### Terminal 2 - Dev1 Project
```bash
cd /Users/robertlee/GitHubProjects/Claude_MCPServer_Dev1
bash scripts/start-mcp-ecosystem.sh
```

## Stopping Projects

### Stop Main Project
```bash
cd /Users/robertlee/GitHubProjects/Claude_MCPServer
bash scripts/stop-mcp-ecosystem.sh
```

### Stop Dev1 Project
```bash
cd /Users/robertlee/GitHubProjects/Claude_MCPServer_Dev1
bash scripts/stop-mcp-ecosystem.sh
```

## Verification Commands

### Check Running Containers
```bash
docker ps --format "table {{.Names}}\t{{.Ports}}\t{{.Status}}"
```

### Check Port Usage
```bash
lsof -i :5432,5442,6379,6389,3100,3200
```

### Check Networks
```bash
docker network ls | grep claude-mcp
```

## Development Workflow

1. **Main Project**: Use for stable development and testing
2. **Dev1 Project**: Use for experimental features and risky changes
3. **No Conflicts**: Both can run simultaneously with complete isolation
4. **Separate Databases**: Each has its own PostgreSQL and Redis instances
5. **Separate MCP Configs**: Use different .mcp.json paths for Claude Code integration

## Troubleshooting

### Port Conflicts
If you see port binding errors, verify:
1. Both projects use different external ports
2. No other services are using the ports
3. Previous containers are fully stopped

### Container Name Conflicts  
All Dev1 containers have `-dev1` suffix to prevent naming conflicts.

### Database Conflicts
Each project uses separate database instances with different ports.

## Ready for Parallel Development! 🚀