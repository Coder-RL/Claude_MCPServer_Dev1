# 🚀 Claude MCP Server Ecosystem

## 🚨 **CRITICAL: Two Issues That Keep Causing Problems**

### **1. GLOBAL CONFIG REQUIRED** 
- MCP configs MUST be global (`~/.claude/claude_code_config.json`), NOT local/project-specific
- Local configs are lost when changing directories

### **2. STDIO TRANSPORT REQUIRED**
- ALL MCP servers MUST use STDIO communication, NOT HTTP/ports  
- Claude Code only supports STDIO transport

### **Quick Fix for MCP Issues:**
```bash
# If MCP tools not working in Claude Code:
exit  # Exit current session  
claude --mcp-config ~/.claude/claude_code_config.json  # Restart with global config
```

**Status**: ✅ OPTIMIZED SYSTEM ARCHITECTURE IMPLEMENTED (2025-05-26)  
**Servers**: 13 configured (optimized from 17 → 13 via consolidation)  
**Tools**: 150+ available including consolidated data analytics and enhanced memory optimization  
**Memory**: 58% reduction in memory overhead through server consolidation

---

## ⚡ INSTANT START (60 SECONDS)

### 1. Verify System Status:
```bash
bash verify-system-status.sh
```

### 2. Start MCP Ecosystem:
**Option A - PM2 (Recommended for Production):**
```bash
./start-mcp-pm2.sh
```

**Option B - CLI (Legacy):**
```bash
./claude-mcp-setup start
```
**Expected**: "All 11 servers ready, 0 failed"

### 3. Test in Claude Code:
```
/mcp
```
**Expected**: 11 connected servers listed (including enhanced-memory)

---

## 📚 DOCUMENTATION

### **🚀 START HERE**
- **⚡ IMMEDIATE START**: [`START_HERE_IMMEDIATE.md`](START_HERE_IMMEDIATE.md) - Where you are right now, what to do next
- **💻 ENVIRONMENT STATUS**: [`DEVELOPMENT_ENVIRONMENT_STATUS.md`](DEVELOPMENT_ENVIRONMENT_STATUS.md) - Current system state, process status, validation
- **⌨️ COMMAND REFERENCE**: [`COMMAND_REFERENCE_IMMEDIATE.md`](COMMAND_REFERENCE_IMMEDIATE.md) - Copy-paste ready commands for all tasks

### **📖 COMPLETE DOCUMENTATION**
- **⚡ Latest Session**: [`SESSION_2025-05-26_SYSTEM_OPTIMIZATION.md`](SESSION_2025-05-26_SYSTEM_OPTIMIZATION.md) - Server consolidation, memory optimization, and performance improvements
- **📊 Optimization Summary**: [`OPTIMIZATION_SUMMARY_2025-05-26.md`](OPTIMIZATION_SUMMARY_2025-05-26.md) - Executive summary of optimization results
- **📖 Current State**: [`CURRENT_WORKING_STATE.md`](CURRENT_WORKING_STATE.md) - Updated with session 2025-05-26 optimizations  
- **🧠 Previous Session**: [`SESSION_2025-05-25_ENHANCED_MEMORY_IMPLEMENTATION.md`](SESSION_2025-05-25_ENHANCED_MEMORY_IMPLEMENTATION.md) - Enhanced memory system + MCP fixes
- **📖 Complete Guide**: [`README_AUTHORITATIVE_2025-05-24.md`](README_AUTHORITATIVE_2025-05-24.md)
- **📁 Historical Docs**: [`docs/archive/`](docs/archive/) (for reference only)

---

## 🎯 WHAT THIS PROJECT IS

A **production-ready MCP server ecosystem** that gives Claude AI 150+ specialized tools across:

- **📊 Consolidated Data Analytics** (40+ tools): Unified server combining pipelines, warehousing, governance, ML deployment, real-time analytics
- **🧠 Enhanced Memory** (3 tools): 6 optimization techniques including context compression, hierarchical memory, semantic chunking
- **🔐 Security** (6 tools): Vulnerability scanning, compliance checking  
- **🎨 Design** (8 tools): UI analysis, accessibility, design systems
- **💾 Memory Management** (5 tools): Persistent storage, context management
- **⚡ Optimization** (5 tools): Performance profiling, bottleneck analysis
- **🏗️ Infrastructure** (85+ tools): Database, Docker, configuration management

**Key Optimization (2025-05-26)**: Consolidated 5 separate data analytics servers into 1 unified server, reducing memory usage by ~350MB while maintaining full functionality.

**Infrastructure**: PostgreSQL + Redis + Qdrant + Docker orchestration

---

## ⚠️ IMPORTANT

**If you see any issues**: 
1. Run `bash verify-system-status.sh` for diagnosis
2. Check [`README_AUTHORITATIVE_2025-05-24.md`](README_AUTHORITATIVE_2025-05-24.md) for troubleshooting
3. Ignore other markdown files (they contain outdated information)

**Last Verified**: 2025-05-24  
**Root Cause Fixed**: claude-mcp-wrapper.sh environment variable configuration  
**Result**: All 10 servers working with 149 tools available