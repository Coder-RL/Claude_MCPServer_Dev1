# Port Assignment Registry - Dev1 Environment

## Reserved Ports - Dev1

### Infrastructure Services Only
- **No MCP servers use HTTP ports** - All MCP servers are pure STDIO

### Infrastructure Services - Dev1 (Original + 10)
- **5442**: PostgreSQL (Docker) [was 5432]
- **6389**: Redis (Docker) [was 6379]
- **6343**: Qdrant Vector Database (Docker) [was 6333]
- **6344**: Qdrant GRPC (Docker) [was 6334]
- **2389**: etcd client (Docker) [was 2379]
- **2390**: etcd peer (Docker) [was 2380]

### HTTP Services - Dev1 (Original + 10)
- **3110**: Orchestration [was 3100]
- **3111**: Inference Enhancement [was 3101]
- **3112**: UI Testing [was 3102]
- **3113**: Analytics [was 3103]
- **3114**: Code Quality [was 3104]
- **3115**: Documentation [was 3105]
- **3116**: Memory Management [was 3106]
- **3117**: Web Access [was 3107]
- **3211**: Memory MCP [was 3201]
- **3212**: Sequential Thinking MCP [was 3202]
- **3213**: Filesystem MCP [was 3203]

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
1. Dev1 ports = Original ports + 10 (or +20 for some services)
2. HTTP servers must use consistent port assignments
3. STDIO servers never bind to ports
4. All port assignments are documented here
5. No port conflicts allowed between main and Dev1

### Container Names - Dev1
All containers have "-dev1" suffix to avoid conflicts:
- claude-mcp-postgres-dev1
- claude-mcp-redis-dev1
- claude-mcp-etcd-dev1
- etc.

### Usage
- Start main ecosystem: `bash scripts/start-mcp-ecosystem.sh`
- Start Dev1 ecosystem: `cd Claude_MCPServer_Dev1 && bash scripts/start-mcp-ecosystem.sh`
- Stop main ecosystem: `bash scripts/stop-mcp-ecosystem.sh`
- Stop Dev1 ecosystem: `cd Claude_MCPServer_Dev1 && bash scripts/stop-mcp-ecosystem.sh`

### Network Isolation
- Main: claude-mcp-network
- Dev1: claude-mcp-network-dev1