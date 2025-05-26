# Claude Code MCP Configuration Reference Guide

## 📋 OFFICIAL CONFIGURATION STANDARDS

### Configuration Scopes (Official Documentation)

| Scope | Description | Location | Use Case |
|-------|-------------|----------|----------|
| **local** (default) | Project-specific, private to you | Project user settings | Testing, development |
| **user** | Available across all projects | User configuration | Personal MCP servers |
| **project** | Shared with team | `.mcp.json` in project root | Team collaboration |

### Configuration Hierarchy (Precedence)
1. **Enterprise policies** (highest priority)
2. **Command line arguments**
3. **Local project settings** (`.mcp.json`)
4. **Shared project settings**
5. **User settings** (lowest priority)

⚠️ **CRITICAL**: Project-scoped configuration (`.mcp.json`) overrides user-scoped configuration!

## 🎯 RECOMMENDED CONFIGURATION STRATEGY

### For Personal MCP Servers (RECOMMENDED)
```bash
# Use user scope for personal servers available everywhere
claude mcp add memory-enhanced -s user "node" "/path/to/server.js" -e VAR=value
claude mcp add sequential-thinking -s user -- npx -y @package/server
```

**Benefits:**
- ✅ Available in all projects
- ✅ Survives Claude Code restarts
- ✅ No custom config files needed
- ✅ Standards compliant

### For Team Collaboration
```bash
# Use project scope for team-shared servers
claude mcp add shared-server -s project "command" "args"
```

**Creates:** `.mcp.json` file (commit to git)

## 📁 OFFICIAL FILE LOCATIONS

### User Configuration
```
~/.claude/
├── settings.json          # ✅ Main settings (permissions, etc.)
└── todos/                 # ✅ Claude Code operational files
```

### Project Configuration (Optional)
```
project-root/
└── .mcp.json             # ✅ Team-shared MCP servers
```

## ❌ ANTI-PATTERNS TO AVOID

### Non-Standard Files
- ❌ `claude_code_config*.json` (NOT in official docs)
- ❌ `claude_desktop_config.json` (Different product)
- ❌ Multiple `settings*.json` files
- ❌ Custom config paths with `--mcp-config`

### Configuration Conflicts
- ❌ Mixing user and project scope for same server names
- ❌ Multiple `.mcp.json` files in different locations
- ❌ Custom startup commands instead of standard `claude`

## 🔧 STANDARD COMMANDS

### Managing MCP Servers
```bash
# List all configured servers
claude mcp list

# Add server with user scope (recommended)
claude mcp add <name> -s user <command> [args...] -e VAR=value

# Add server with project scope (team sharing)
claude mcp add <name> -s project <command> [args...]

# Get server details
claude mcp get <name>

# Remove server
claude mcp remove <name> [-s scope]

# Reset project choices
claude mcp reset-project-choices
```

### Starting Claude Code
```bash
# Standard startup (recommended)
claude

# NOT recommended: custom config files
# claude --mcp-config custom.json
```

## 🛠️ TROUBLESHOOTING COMMON ISSUES

### Problem: MCP Server Persists After Removal
**Symptoms:** Server shows in `mcp` status despite `claude mcp remove`

**Causes:**
1. Project `.mcp.json` overriding user config
2. Multiple config files with same server name
3. Known bugs in `claude mcp remove` command

**Solution:**
1. Check for project `.mcp.json` files: `find . -name ".mcp.json"`
2. Manually edit/remove server from all config files
3. Verify with `claude mcp list` and `mcp` status

### Problem: Configuration Conflicts
**Symptoms:** Unexpected MCP behavior, wrong servers loading

**Solution:**
1. Audit all config files: `find ~/.claude -name "*.json"`
2. Remove non-standard files
3. Use single `~/.claude/settings.json`
4. Configure MCP servers with user scope only

### Problem: Non-Standard Configuration Files
**Symptoms:** Multiple `claude_code_config*.json` files

**Solution:**
1. Remove ALL `claude_code_config*.json` files
2. Use official `claude mcp add` commands instead
3. Rely on user-scoped configuration

## 📊 CONFIGURATION AUDIT CHECKLIST

### Clean Configuration State
- [ ] Single `~/.claude/settings.json` file
- [ ] No `claude_code_config*.json` files
- [ ] No multiple `settings*.json` files
- [ ] User-scoped MCP servers only (unless team sharing needed)
- [ ] `claude mcp list` shows expected servers
- [ ] `mcp` status shows only desired servers
- [ ] Standard `claude` startup works

### File Locations to Check
```bash
# User config (should exist)
ls -la ~/.claude/settings.json

# Non-standard files (should NOT exist)
ls -la ~/.claude/claude_code_config*.json
ls -la ~/.claude/settings.*.json

# Project files (check if needed)
find . -name ".mcp.json"
```

## 🎯 IMPLEMENTATION EXAMPLES

### Personal Development Setup
```bash
# Configure essential MCP servers (user scope)
claude mcp add memory-enhanced -s user "node" "/path/to/memory-server.js"
claude mcp add filesystem-standard -s user -- npx -y @modelcontextprotocol/server-filesystem /Users/username
claude mcp add sequential-thinking -s user -- npx -y @modelcontextprotocol/server-sequential-thinking

# Start Claude Code
claude
```

### Team Project Setup
```bash
# Add team-shared server (creates .mcp.json)
claude mcp add project-analyzer -s project "node" "/path/to/analyzer.js"

# Commit .mcp.json to git
git add .mcp.json
git commit -m "Add project MCP server configuration"
```

### Migration from Non-Standard Setup
```bash
# 1. Backup existing config
cp ~/.claude/claude_code_config.json ~/backup.json

# 2. Remove non-standard files
rm ~/.claude/claude_code_config*.json

# 3. Configure using official commands
claude mcp add memory-enhanced -s user "node" "/path/to/server.js"
# ... add other servers

# 4. Verify clean state
claude mcp list
mcp
```

## 🔄 MAINTENANCE PROCEDURES

### Monthly Configuration Audit
1. **Check for config drift:** `find ~/.claude -name "*.json" | wc -l` (should be 1)
2. **Verify MCP servers:** `claude mcp list` matches expected
3. **Test clean startup:** `claude` starts without issues
4. **Remove temporary files:** Clean any backup or test configs

### Before Major Updates
1. **Document current state:** `claude mcp list > mcp-backup.txt`
2. **Backup settings:** `cp ~/.claude/settings.json settings-backup.json`
3. **Test after update:** Verify all MCP servers still work

---

**Created**: May 26, 2025  
**Purpose**: Prevent configuration management issues through standardized practices  
**Next Review**: After configuration crisis resolution