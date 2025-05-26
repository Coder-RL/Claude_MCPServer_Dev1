#!/bin/bash

# Claude Code MCP Global Wrapper - Sets up global MCP configuration and starts Claude Code
# Usage: ./claude-mcp-wrapper.sh [claude-code-args...]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
GLOBAL_CLAUDE_CONFIG_DIR="$HOME/.claude"
GLOBAL_CLAUDE_CONFIG_FILE="$GLOBAL_CLAUDE_CONFIG_DIR/claude_code_config.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

echo -e "${BLUE}🤖 Claude Code MCP Global Wrapper${NC}"
echo "======================================"

# Function to setup global MCP configuration
setup_global_mcp_config() {
    log "${BLUE}🔧 Setting up global MCP configuration...${NC}"
    
    # Create global Claude config directory if it doesn't exist
    if [ ! -d "$GLOBAL_CLAUDE_CONFIG_DIR" ]; then
        log "${YELLOW}📁 Creating global Claude config directory: $GLOBAL_CLAUDE_CONFIG_DIR${NC}"
        mkdir -p "$GLOBAL_CLAUDE_CONFIG_DIR"
    fi
    
    # Backup existing global config if it exists
    if [ -f "$GLOBAL_CLAUDE_CONFIG_FILE" ]; then
        backup_file="${GLOBAL_CLAUDE_CONFIG_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
        log "${YELLOW}💾 Backing up existing global config to: $backup_file${NC}"
        cp "$GLOBAL_CLAUDE_CONFIG_FILE" "$backup_file"
    fi
    
    # Create merged configuration with MCP servers
    log "${BLUE}📋 Creating global MCP configuration...${NC}"
    cat > "$GLOBAL_CLAUDE_CONFIG_FILE" << EOF
{
  "tool-choice": {
    "always-allow": true
  },
  "auto-scroll": "all",
  "auto-accept": "all",
  "mcpServers": {
    "memory-simple": {
      "command": "node",
      "args": ["$PROJECT_ROOT/mcp/memory/simple-server.js"],
      "env": {
        "MEMORY_ID": "memory-simple"
      }
    },
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    },
    "data-pipeline": {
      "command": "npx",
      "args": ["tsx", "$PROJECT_ROOT/servers/data-analytics/src/data-pipeline.ts"],
      "env": {
        "DATA_PIPELINE_ID": "data-pipeline-server"
      }
    },
    "realtime-analytics": {
      "command": "npx",
      "args": ["tsx", "$PROJECT_ROOT/servers/data-analytics/src/realtime-analytics.ts"],
      "env": {
        "REALTIME_ANALYTICS_ID": "realtime-analytics-server"
      }
    },
    "data-warehouse": {
      "command": "npx",
      "args": ["tsx", "$PROJECT_ROOT/servers/data-analytics/src/data-warehouse.ts"],
      "env": {
        "DATA_WAREHOUSE_ID": "data-warehouse-server"
      }
    },
    "ml-deployment": {
      "command": "npx",
      "args": ["tsx", "$PROJECT_ROOT/servers/data-analytics/src/ml-deployment.ts"],
      "env": {
        "ML_DEPLOYMENT_ID": "ml-deployment-server"
      }
    },
    "data-governance": {
      "command": "npx",
      "args": ["tsx", "$PROJECT_ROOT/servers/data-analytics/src/data-governance.ts"],
      "env": {
        "DATA_GOVERNANCE_ID": "data-governance-server"
      }
    },
    "security-vulnerability": {
      "command": "npx",
      "args": ["tsx", "$PROJECT_ROOT/servers/security-vulnerability/src/security-vulnerability.ts"],
      "env": {
        "SECURITY_ID": "security-vulnerability-server"
      }
    },
    "optimization": {
      "command": "npx",
      "args": ["tsx", "$PROJECT_ROOT/servers/optimization/src/optimization.ts"],
      "env": {
        "OPTIMIZATION_ID": "optimization-server"
      }
    },
    "ui-design": {
      "command": "npx",
      "args": ["tsx", "$PROJECT_ROOT/servers/ui-design/src/ui-design.ts"],
      "env": {
        "UI_DESIGN_ID": "ui-design-server"
      }
    }
  }
}
EOF
    
    log "${GREEN}✅ Global MCP configuration created at: $GLOBAL_CLAUDE_CONFIG_FILE${NC}"
}

# Function to check if MCP servers are ready (STDIO servers)
check_mcp_servers() {
    log "${BLUE}🔍 Checking MCP server readiness...${NC}"
    
    # Test all 10 MCP servers to verify they can start and respond
    local test_servers=(
        "memory-simple:MEMORY_ID=memory-simple:mcp/memory/simple-server.js"
        "data-pipeline:DATA_PIPELINE_ID=data-pipeline-server:servers/data-analytics/src/data-pipeline.ts"
        "realtime-analytics:REALTIME_ANALYTICS_ID=realtime-analytics-server:servers/data-analytics/src/realtime-analytics.ts"
        "data-warehouse:DATA_WAREHOUSE_ID=data-warehouse-server:servers/data-analytics/src/data-warehouse.ts"
        "ml-deployment:ML_DEPLOYMENT_ID=ml-deployment-server:servers/data-analytics/src/ml-deployment.ts"
        "data-governance:DATA_GOVERNANCE_ID=data-governance-server:servers/data-analytics/src/data-governance.ts"
        "security-vulnerability:SECURITY_ID=security-vulnerability-server:servers/security-vulnerability/src/security-vulnerability.ts"
        "optimization:OPTIMIZATION_ID=optimization-server:servers/optimization/src/optimization.ts"
        "ui-design:UI_DESIGN_ID=ui-design-server:servers/ui-design/src/ui-design.ts"
    )
    
    local available=0
    local failed=0
    
    for server_info in "${test_servers[@]}"; do
        IFS=':' read -r server_name env_var server_path <<< "$server_info"
        
        log "${BLUE}   Testing $server_name...${NC}"
        
        if [[ "$server_path" == *.js ]]; then
            # Node.js server
            if timeout 3s bash -c "cd '$PROJECT_ROOT' && echo '{\"jsonrpc\": \"2.0\", \"id\": 1, \"method\": \"tools/list\"}' | $env_var node $server_path" >/dev/null 2>&1; then
                log "${GREEN}   ✅ $server_name: Ready${NC}"
                available=$((available + 1))
            else
                log "${RED}   ❌ $server_name: Failed${NC}"
                failed=$((failed + 1))
            fi
        else
            # TypeScript server
            if timeout 3s bash -c "cd '$PROJECT_ROOT' && echo '{\"jsonrpc\": \"2.0\", \"id\": 1, \"method\": \"tools/list\"}' | $env_var npx tsx $server_path" >/dev/null 2>&1; then
                log "${GREEN}   ✅ $server_name: Ready${NC}"
                available=$((available + 1))
            else
                log "${RED}   ❌ $server_name: Failed${NC}"
                failed=$((failed + 1))
            fi
        fi
    done
    
    # Test sequential-thinking separately (no environment variables needed)
    log "${BLUE}   Testing sequential-thinking...${NC}"
    if timeout 3s bash -c "echo '{\"jsonrpc\": \"2.0\", \"id\": 1, \"method\": \"tools/list\"}' | npx -y @modelcontextprotocol/server-sequential-thinking" >/dev/null 2>&1; then
        log "${GREEN}   ✅ sequential-thinking: Ready${NC}"
        available=$((available + 1))
    else
        log "${RED}   ❌ sequential-thinking: Failed${NC}"
        failed=$((failed + 1))
    fi
    
    log "${BLUE}📊 MCP Server Status: ${GREEN}$available${NC} ready, ${RED}$failed${NC} failed${NC}"
    
    if [ $failed -gt 0 ]; then
        log "${YELLOW}⚠️  Some MCP servers are not responding${NC}"
        log "${YELLOW}💡 To check infrastructure: cd $PROJECT_ROOT && bash scripts/start-mcp-ecosystem.sh${NC}"
        log "${YELLOW}Do you want to continue anyway? (y/N):${NC}"
        read -r response
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            log "${RED}Aborting Claude Code startup${NC}"
            exit 1
        fi
    else
        log "${GREEN}✅ All tested MCP servers are ready${NC}"
    fi
}

# Function to display configuration info
show_config_info() {
    log "${BLUE}📋 Global MCP Configuration Info:${NC}"
    log "   Config file: $GLOBAL_CLAUDE_CONFIG_FILE"
    log "   Project root: $PROJECT_ROOT"
    log "   Available servers: 10 MCP servers configured"
    echo ""
}

# Main setup and execution
main() {
    # Step 1: Setup global MCP configuration
    setup_global_mcp_config
    
    # Step 2: Check MCP server health
    check_mcp_servers
    
    # Step 3: Show configuration info
    show_config_info
    
    # Step 4: Start Claude Code with global MCP config and debug mode
    log "${GREEN}🚀 Starting Claude Code with global MCP support...${NC}"
    log "${BLUE}MCP Debug mode: Enabled${NC}"
    log "${BLUE}Global config: $GLOBAL_CLAUDE_CONFIG_FILE${NC}"
    log "${BLUE}Command: claude --debug --mcp-config $GLOBAL_CLAUDE_CONFIG_FILE $*${NC}"
    echo ""
    
    # Pass all arguments to Claude Code with global MCP config and debug mode
    exec claude --debug --mcp-config "$GLOBAL_CLAUDE_CONFIG_FILE" "$@"
}

# Run main function
main "$@"