# ⚡ COMMAND REFERENCE - COPY & PASTE READY

**Purpose**: Immediate commands for common tasks - no explanations, just commands  
**Updated**: May 26, 2025 post-optimization  
**Context**: Use these commands to quickly execute common tasks

---

## 🚀 DEPLOYMENT COMMANDS

### **Deploy Optimized System (13 servers)**
```bash
claude --mcp-config ~/.claude/claude_code_config_dev1_optimized.json
```

### **Deploy Original System (17 servers)**  
```bash
claude --mcp-config ~/.claude/claude_code_config_dev1.json
```

### **Emergency Rollback**
```bash
# Kill current Claude Code
pkill -f "claude.*mcp-config"
# Start with original config
claude --mcp-config ~/.claude/claude_code_config_dev1.json
```

---

## 🧪 TESTING COMMANDS

### **Run Comprehensive Test Suite**
```bash
cd /Users/robertlee/GitHubProjects/Claude_MCPServer_Dev1
node test-optimized-system.js
```

### **Test Individual Servers**
```bash
# Test consolidated data analytics server
cd /Users/robertlee/GitHubProjects/Claude_MCPServer_Dev1
timeout 10 npx tsx servers/consolidated/data-analytics-consolidated.ts

# Test enhanced memory server  
timeout 10 npx tsx servers/memory/src/enhanced-memory-final.ts

# Test sequential thinking server
timeout 10 node mcp/sequential-thinking/server.js
```

### **Quick Server Count Check**
```bash
# Count running MCP processes
ps aux | grep -E "(tsx|node.*mcp)" | grep -v grep | wc -l
```

---

## 🔍 VERIFICATION COMMANDS

### **Check Configuration Status**
```bash
# Verify optimized config exists and is valid
ls -la ~/.claude/claude_code_config_dev1_optimized.json
jq . ~/.claude/claude_code_config_dev1_optimized.json > /dev/null && echo "Valid JSON"

# Count servers in configs
echo "Optimized servers: $(jq '.mcpServers | keys | length' ~/.claude/claude_code_config_dev1_optimized.json)"
echo "Original servers: $(jq '.mcpServers | keys | length' ~/.claude/claude_code_config_dev1.json)"

# Check for memory-simple (should be empty)
jq '.mcpServers | keys[]' ~/.claude/claude_code_config_dev1_optimized.json | grep simple || echo "✅ memory-simple not found"
```

### **Check Process Status**
```bash
# See what's currently running
ps aux | grep claude | grep -v grep
ps aux | grep -E "(tsx|node.*mcp)" | grep -v grep

# Memory usage of MCP processes
ps aux | grep -E "(tsx|node.*mcp)" | grep -v grep | awk '{print $2, $4"% memory", $11}' | sort -k2 -nr
```

### **Check Docker Infrastructure**
```bash
# Check containers
docker ps | grep claude-mcp

# Test database connections
docker exec claude-mcp-postgres psql -U postgres -d mcp_enhanced -c "SELECT 1;"
docker exec claude-mcp-redis redis-cli ping
curl -s http://localhost:6333/collections > /dev/null && echo "✅ Qdrant responding"
```

---

## 📊 MONITORING COMMANDS

### **Memory Usage Monitoring**
```bash
# System memory (macOS)
vm_stat | head -5

# System memory (Linux)  
free -h

# Process memory detailed
ps aux | grep -E "(tsx|node.*mcp)" | grep -v grep | awk '{mem+=$4} END {print "Total MCP Memory: " mem "%"}'
```

### **Performance Monitoring**
```bash
# CPU usage of MCP processes
ps aux | grep -E "(tsx|node.*mcp)" | grep -v grep | awk '{print $2, $3"% CPU", $11}' | sort -k2 -nr

# Port usage check
lsof -i :3000-4000 | grep LISTEN

# Network connections
netstat -an | grep LISTEN | grep -E ":(3[0-9]{3}|4000)"
```

---

## 🛠️ MAINTENANCE COMMANDS

### **Start/Stop Infrastructure**
```bash
# Start Docker infrastructure
docker-compose up -d

# Stop Docker infrastructure  
docker-compose down

# Restart infrastructure
docker-compose restart
```

### **Clean Up Processes**
```bash
# Kill all MCP processes
pkill -f "tsx.*mcp"
pkill -f "node.*mcp"

# Kill specific server type
pkill -f "data-analytics-consolidated"
pkill -f "data-pipeline-fixed"
```

### **Log Checking**
```bash
# Check recent Docker logs
docker-compose logs --tail=50

# Check specific container logs
docker logs claude-mcp-postgres --tail=20
docker logs claude-mcp-redis --tail=20
docker logs claude-mcp-qdrant --tail=20
```

---

## 🔧 DEVELOPMENT COMMANDS

### **Environment Setup**
```bash
# Verify Node version
node --version

# Check npm/npx availability
npx --version

# Test TypeScript execution
npx tsx --version
```

### **Code Validation**
```bash
# TypeScript compilation check
cd /Users/robertlee/GitHubProjects/Claude_MCPServer_Dev1
npx tsc --noEmit

# Dependency check
npm audit --audit-level moderate

# Install missing dependencies
npm install
```

### **File System Commands**
```bash
# Navigate to project
cd /Users/robertlee/GitHubProjects/Claude_MCPServer_Dev1

# Check disk usage
du -sh servers/
du -sh node_modules/

# Find large files
find . -type f -size +10M | head -10
```

---

## 📁 FILE OPERATIONS

### **Quick File Checks**
```bash
# Check critical files exist
ls -la ~/.claude/claude_code_config_dev1_optimized.json
ls -la /Users/robertlee/GitHubProjects/Claude_MCPServer_Dev1/servers/consolidated/data-analytics-consolidated.ts
ls -la /Users/robertlee/GitHubProjects/Claude_MCPServer_Dev1/test-optimized-system.js

# File sizes
wc -l /Users/robertlee/GitHubProjects/Claude_MCPServer_Dev1/servers/consolidated/data-analytics-consolidated.ts
wc -l /Users/robertlee/GitHubProjects/Claude_MCPServer_Dev1/test-optimized-system.js
```

### **Configuration Backup/Restore**
```bash
# Backup current config
cp ~/.claude/claude_code_config_dev1.json ~/.claude/claude_code_config_dev1.json.backup

# Restore from backup
cp ~/.claude/claude_code_config_dev1.json.backup ~/.claude/claude_code_config_dev1.json

# List config backups
ls -la ~/.claude/*.backup
```

---

## 🚨 EMERGENCY COMMANDS

### **System Recovery**
```bash
# Emergency stop everything
pkill -f claude
pkill -f tsx
pkill -f "node.*mcp"
docker-compose down

# Emergency restart infrastructure
docker-compose down
docker-compose up -d
sleep 30

# Emergency start with original config
claude --mcp-config ~/.claude/claude_code_config_dev1.json
```

### **Emergency Diagnostics**
```bash
# Check system resources
df -h
free -h 2>/dev/null || vm_stat | head -5
ps aux | head -20

# Check network issues
ping -c 3 localhost
telnet localhost 5432 < /dev/null
telnet localhost 6379 < /dev/null  
telnet localhost 6333 < /dev/null
```

### **Emergency File Recovery**
```bash
# Find deleted files (if needed)
cd /Users/robertlee/GitHubProjects/Claude_MCPServer_Dev1
git status
git log --oneline -10

# Restore from git (if tracked)
git checkout HEAD -- servers/consolidated/data-analytics-consolidated.ts
git checkout HEAD -- test-optimized-system.js
```

---

## ✅ QUICK VALIDATION SEQUENCE

**Copy-paste this entire block to validate system:**
```bash
echo "=== VALIDATION START ==="
echo "1. Config files:"
ls -la ~/.claude/claude_code_config_dev1*.json | wc -l
echo "2. Docker containers:"
docker ps | grep claude-mcp | wc -l
echo "3. MCP processes:"
ps aux | grep -E "(tsx|node.*mcp)" | grep -v grep | wc -l
echo "4. Critical files:"
ls -la /Users/robertlee/GitHubProjects/Claude_MCPServer_Dev1/servers/consolidated/data-analytics-consolidated.ts > /dev/null && echo "✅ Consolidated server exists"
ls -la /Users/robertlee/GitHubProjects/Claude_MCPServer_Dev1/test-optimized-system.js > /dev/null && echo "✅ Test suite exists"
echo "5. Database connectivity:"
docker exec claude-mcp-postgres psql -U postgres -d mcp_enhanced -c "SELECT 1;" 2>/dev/null | grep -q "1" && echo "✅ PostgreSQL OK"
docker exec claude-mcp-redis redis-cli ping 2>/dev/null | grep -q "PONG" && echo "✅ Redis OK"  
curl -s http://localhost:6333/collections > /dev/null && echo "✅ Qdrant OK"
echo "=== VALIDATION COMPLETE ==="
```

---

## 🎯 CONTEXT-SPECIFIC COMMANDS

### **For New Session Startup**
```bash
# Check what's running
ps aux | grep claude | grep -v grep
# If nothing: start with preferred config
claude --mcp-config ~/.claude/claude_code_config_dev1_optimized.json
# Verify: /mcp (should show 13 servers)
```

### **For Testing Optimization**
```bash
# Run full test suite
cd /Users/robertlee/GitHubProjects/Claude_MCPServer_Dev1 && node test-optimized-system.js
# Expected: All tests pass, 65+ req/s throughput
```

### **For Troubleshooting**
```bash
# Standard diagnostic sequence
docker ps | grep claude-mcp
ps aux | grep -E "(tsx|node.*mcp)" | grep -v grep | wc -l
jq . ~/.claude/claude_code_config_dev1_optimized.json > /dev/null && echo "Config OK"
```

**All commands tested on**: macOS Darwin 24.4.0, Node v20.18.3  
**Last verified**: May 26, 2025