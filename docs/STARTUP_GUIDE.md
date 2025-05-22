# 🚀 Claude MCP Server Ecosystem - Beginner's Startup Guide

## What is the Startup Script?

The startup script (`scripts/start-mcp-ecosystem.sh`) is an automated tool that launches the complete Claude MCP (Model Context Protocol) Server ecosystem. It starts all necessary infrastructure services and MCP servers in the correct order, with comprehensive error handling and logging.

## 📋 Prerequisites

Before running the startup script, ensure you have:

1. **Docker Desktop** - For PostgreSQL, Redis, and Qdrant databases
2. **Node.js** (v18+) - For running JavaScript/TypeScript servers
3. **PostgreSQL client tools** - For database operations (`psql`, `pg_isready`)
4. **Redis client tools** - For Redis operations (`redis-cli`)

### Quick Installation Check

```bash
# Check if required tools are installed
docker --version
node --version
npm --version
psql --version
redis-cli --version
```

## 🎯 What the Startup Script Does

### 1. Infrastructure Services (Databases)
- **PostgreSQL** (port 5432) - Main database for MCP memory storage
- **Redis** (port 6379) - Caching and message queuing
- **Qdrant** (port 6333) - Vector database for semantic search

### 2. MCP Servers
- **Memory Simple MCP** (port 3301) - Basic memory storage and retrieval
- **Sequential Thinking MCP** (port 3302) - Advanced reasoning capabilities
- **Data Pipeline** (port 3011) - Data processing workflows
- **Realtime Analytics** (port 3012) - Live data analysis
- **Data Warehouse** (port 3013) - Data storage and querying
- **ML Deployment** (port 3014) - Machine learning model serving
- **Data Governance** (port 3015) - Data quality and compliance

## 🚀 How to Use the Startup Script

### Option 1: Quick Start (Recommended for Beginners)
```bash
# Navigate to project directory
cd /Users/robertlee/GitHubProjects/Claude_MCPServer

# Run the startup script
bash scripts/start-mcp-ecosystem.sh
```

### Option 2: With Enhanced Infrastructure Checking
```bash
# Use the enhanced version with automatic database detection
bash scripts/start-mcp-ecosystem-enhanced.sh
```

## 📊 Understanding the Output

The script provides color-coded output:
- 🟢 **Green** - Success messages
- 🔴 **Red** - Error messages
- 🟡 **Yellow** - Warning messages
- 🔵 **Blue** - Information messages

### Sample Output
```
[2024-01-15 10:30:15] 🚀 Starting Claude MCP Server Ecosystem...
[2024-01-15 10:30:16] 📂 Project Root: /Users/robertlee/GitHubProjects/Claude_MCPServer
[2024-01-15 10:30:17] 🐳 Starting Docker infrastructure...
[2024-01-15 10:30:25] ✅ PostgreSQL is ready!
[2024-01-15 10:30:27] ✅ Redis is ready!
[2024-01-15 10:30:30] 🧠 Starting MCP servers...
[2024-01-15 10:30:35] ✅ Memory Simple MCP started successfully (PID: 12345, Port: 3301)
```

## 🔍 Checking if Services are Already Running

### Before Starting
The script automatically checks for existing services and stops them before starting new ones. However, you can manually check:

```bash
# Check specific ports
lsof -i :3301  # Memory MCP
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis
lsof -i :6333  # Qdrant

# Check Docker containers
docker ps

# Check for running MCP processes
ps aux | grep mcp
```

### Finding Running Processes
```bash
# Find processes by port
sudo lsof -i :3301

# Find processes by name
ps aux | grep "memory"
ps aux | grep "data-pipeline"

# Check Docker services
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

## 🗂️ Log Files and Debugging

### Log Locations
All logs are stored in the `logs/` directory:
- `startup_YYYYMMDD_HHMMSS.log` - Main startup log
- `memory-simple_YYYYMMDD_HHMMSS.log` - Memory MCP server log
- `data-pipeline_YYYYMMDD_HHMMSS.log` - Data pipeline log
- And one log file per service...

### Checking Service Health
```bash
# Test endpoints after startup
curl http://localhost:3301/health  # Memory MCP
curl http://localhost:3011/health  # Data Pipeline
curl http://localhost:3012/health  # Realtime Analytics

# Check database connections
pg_isready -h localhost -U postgres
redis-cli ping
curl http://localhost:6333/health  # Qdrant
```

## 🛑 Stopping Services

```bash
# Stop all services
bash scripts/stop-mcp-ecosystem.sh

# Or stop specific Docker services
docker stop claude-mcp-postgres claude-mcp-redis claude-mcp-qdrant
```

## ❗ Common Issues and Solutions

### 1. Port Already in Use
```
Error: Port 3301 is already in use
```
**Solution:** Stop existing services first:
```bash
bash scripts/stop-mcp-ecosystem.sh
# Or kill specific process: kill $(lsof -t -i:3301)
```

### 2. Docker Not Running
```
Error: Cannot connect to Docker daemon
```
**Solution:** Start Docker Desktop application

### 3. Database Connection Failed
```
Error: PostgreSQL connection failed
```
**Solution:** Ensure Docker services are running:
```bash
docker ps
npm run docker:up
```

### 4. Permission Denied
```
Error: Permission denied accessing /var/run/docker.sock
```
**Solution:** Ensure your user is in the docker group or use sudo

## 📱 Integration with Claude Desktop/Code

After successful startup, configure Claude Desktop/Code with:

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["/Users/robertlee/GitHubProjects/Claude_MCPServer/mcp/memory/simple-server.js"],
      "env": {"PORT": "3301"}
    }
  }
}
```

## 🎯 Next Steps

1. **Verify all services are running** using the health check endpoints
2. **Test MCP integration** with Claude Desktop/Code
3. **Review logs** if any service fails to start
4. **Use the stop script** when done: `bash scripts/stop-mcp-ecosystem.sh`

## 📞 Getting Help

- Check logs in the `logs/` directory
- Run health checks on individual services
- Use `scripts/test-ecosystem.sh` for comprehensive testing
- Review error messages in the startup log file

---

*For advanced users: See the script source code at `scripts/start-mcp-ecosystem.sh` for detailed implementation.*