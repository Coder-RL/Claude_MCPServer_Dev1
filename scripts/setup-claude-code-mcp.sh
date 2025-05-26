#!/bin/bash

# Claude Code MCP Servers Setup Script
# This script adds all 6 MCP servers to Claude Code

set -e

PROJECT_ROOT="/Users/robertlee/GitHubProjects/Claude_MCPServer"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Check if Claude Code is available
check_claude_code() {
    if ! command -v claude &> /dev/null; then
        log "${RED}❌ Claude Code CLI not found${NC}"
        log "${YELLOW}💡 Please install Claude Code first${NC}"
        exit 1
    fi
    log "${GREEN}✅ Claude Code CLI found${NC}"
}

# Check if MCP servers are running
check_mcp_servers() {
    log "${BLUE}🔍 Checking MCP servers...${NC}"
    
    local servers=(3301 3011 3012 3013 3014 3015 3016 3017 3018)
    local failed=0
    
    for port in "${servers[@]}"; do
        if curl -s http://localhost:$port/health >/dev/null 2>&1; then
            log "${GREEN}✅ Server on port $port is running${NC}"
        else
            log "${RED}❌ Server on port $port is not running${NC}"
            failed=1
        fi
    done
    
    if [ $failed -eq 1 ]; then
        log "${YELLOW}💡 Start servers first: bash scripts/start-mcp-ecosystem.sh${NC}"
        exit 1
    fi
}

# Remove existing MCP servers (cleanup)
cleanup_existing() {
    log "${BLUE}🧹 Cleaning up existing MCP servers...${NC}"
    
    local servers=("memory-simple" "sequential-thinking" "data-pipeline" "realtime-analytics" "data-warehouse" "ml-deployment" "data-governance" "security-vulnerability" "ui-design" "optimization")
    
    for server in "${servers[@]}"; do
        if claude mcp list | grep -q "$server"; then
            log "${YELLOW}🗑️  Removing existing $server${NC}"
            claude mcp remove "$server" || true
        fi
    done
}

# Add all MCP servers
add_mcp_servers() {
    log "${BLUE}🚀 Adding MCP servers to Claude Code...${NC}"
    
    # Memory Simple MCP
    log "${BLUE}📝 Adding Memory Simple MCP...${NC}"
    claude mcp add memory-simple \
        -e PORT=3301 \
        -- node "$PROJECT_ROOT/mcp/memory/simple-server.js"
    
    # Sequential Thinking MCP
    log "${BLUE}🧠 Adding Sequential Thinking MCP...${NC}"
    claude mcp add sequential-thinking \
        -- npx -y @modelcontextprotocol/server-sequential-thinking
    
    # Data Pipeline MCP
    log "${BLUE}🔄 Adding Data Pipeline MCP...${NC}"
    claude mcp add data-pipeline \
        -e DATA_PIPELINE_PORT=3011 \
        -- tsx "$PROJECT_ROOT/servers/data-analytics/src/data-pipeline.ts"
    
    # Realtime Analytics MCP
    log "${BLUE}📊 Adding Realtime Analytics MCP...${NC}"
    claude mcp add realtime-analytics \
        -e REALTIME_ANALYTICS_PORT=3012 \
        -- tsx "$PROJECT_ROOT/servers/data-analytics/src/realtime-analytics.ts"
    
    # Data Warehouse MCP
    log "${BLUE}🏢 Adding Data Warehouse MCP...${NC}"
    claude mcp add data-warehouse \
        -e DATA_WAREHOUSE_PORT=3013 \
        -- tsx "$PROJECT_ROOT/servers/data-analytics/src/data-warehouse.ts"
    
    # ML Deployment MCP
    log "${BLUE}🤖 Adding ML Deployment MCP...${NC}"
    claude mcp add ml-deployment \
        -e ML_DEPLOYMENT_PORT=3014 \
        -- tsx "$PROJECT_ROOT/servers/data-analytics/src/ml-deployment.ts"
    
    # Data Governance MCP
    log "${BLUE}🛡️  Adding Data Governance MCP...${NC}"
    claude mcp add data-governance \
        -e DATA_GOVERNANCE_PORT=3015 \
        -- tsx "$PROJECT_ROOT/servers/data-analytics/src/data-governance.ts"
    
    # Advanced MCP Servers
    log "${BLUE}🔒 Adding Security Vulnerability MCP...${NC}"
    claude mcp add security-vulnerability \
        -e SECURITY_VULNERABILITY_PORT=3016 \
        -- tsx "$PROJECT_ROOT/servers/security-vulnerability/src/security-vulnerability.ts"
    
    log "${BLUE}🎨 Adding UI Design MCP...${NC}"
    claude mcp add ui-design \
        -e UI_DESIGN_PORT=3017 \
        -- tsx "$PROJECT_ROOT/servers/ui-design/src/ui-design.ts"
    
    log "${BLUE}⚡ Adding Optimization MCP...${NC}"
    claude mcp add optimization \
        -e OPTIMIZATION_PORT=3018 \
        -- tsx "$PROJECT_ROOT/servers/optimization/src/optimization.ts"
}

# Verify setup
verify_setup() {
    log "${BLUE}🔍 Verifying MCP server setup...${NC}"
    
    log "${BLUE}📋 Configured MCP servers:${NC}"
    claude mcp list
    
    log "${GREEN}✅ All 9 MCP servers configured in Claude Code!${NC}"
}

# Show usage instructions
show_usage() {
    log "${GREEN}🎉 Claude Code MCP Setup Complete!${NC}"
    echo ""
    log "${BLUE}📋 What you can now do in Claude Code:${NC}"
    log "   • 'Can you access my memory?' (Memory MCP)"
    log "   • 'Show me data pipeline status' (Data Pipeline)"
    log "   • 'Help with realtime analytics' (Realtime Analytics)"
    log "   • 'Query the data warehouse' (Data Warehouse)"
    log "   • 'Deploy ML models' (ML Deployment)"
    log "   • 'Check data governance policies' (Data Governance)"
    log "   • 'Scan for security vulnerabilities' (Security Vulnerability)"
    log "   • 'Analyze UI design consistency' (UI Design)"
    log "   • 'Profile performance and optimize' (Optimization)"
    echo ""
    log "${BLUE}🔧 Management commands:${NC}"
    log "   • claude mcp list               # List all servers"
    log "   • claude mcp get <name>         # Get server details"
    log "   • claude mcp remove <name>      # Remove a server"
    echo ""
    log "${BLUE}🔗 Server endpoints (for reference):${NC}"
    log "   • Memory: http://localhost:3301/health"
    log "   • Data Pipeline: http://localhost:3011/health"
    log "   • Realtime Analytics: http://localhost:3012/health"
    log "   • Data Warehouse: http://localhost:3013/health"
    log "   • ML Deployment: http://localhost:3014/health"
    log "   • Data Governance: http://localhost:3015/health"
    log "   • Security Vulnerability: http://localhost:3016/health"
    log "   • UI Design: http://localhost:3017/health"
    log "   • Optimization: http://localhost:3018/health"
}

# Main execution
main() {
    log "${GREEN}🚀 Claude Code MCP Servers Setup${NC}"
    log "${BLUE}📂 Project Root: $PROJECT_ROOT${NC}"
    echo ""
    
    cd "$PROJECT_ROOT"
    
    # Step 1: Check Claude Code CLI
    check_claude_code
    
    # Step 2: Check if MCP servers are running
    check_mcp_servers
    
    # Step 3: Cleanup existing servers
    cleanup_existing
    
    # Step 4: Add all MCP servers
    add_mcp_servers
    
    # Step 5: Verify setup
    verify_setup
    
    # Step 6: Show usage instructions
    show_usage
}

# Run main function
main "$@"