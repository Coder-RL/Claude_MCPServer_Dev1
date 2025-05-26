#!/bin/bash

# Claude Desktop & Claude Code Integration Setup Script

set -e

PROJECT_ROOT="/Users/robertlee/GitHubProjects/Claude_MCPServer"
CLAUDE_DESKTOP_CONFIG_DIR="$HOME/Library/Application Support/Claude"
CLAUDE_DESKTOP_CONFIG_FILE="$CLAUDE_DESKTOP_CONFIG_DIR/claude_desktop_config.json"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Function to check if MCP servers are running
check_mcp_servers() {
    log "${BLUE}🔍 Checking if MCP servers are running...${NC}"
    
    if curl -s http://localhost:3301/health >/dev/null 2>&1; then
        log "${GREEN}✅ Memory Simple MCP is running (Port 3301)${NC}"
        return 0
    else
        log "${RED}❌ Memory Simple MCP is not running${NC}"
        log "${YELLOW}💡 Please start MCP servers first: bash scripts/start-mcp-ecosystem.sh${NC}"
        return 1
    fi
}

# Function to setup Claude Desktop
setup_claude_desktop() {
    log "${BLUE}🖥️  Setting up Claude Desktop integration...${NC}"
    
    # Create Claude config directory if it doesn't exist
    if [ ! -d "$CLAUDE_DESKTOP_CONFIG_DIR" ]; then
        log "${YELLOW}📁 Creating Claude Desktop config directory...${NC}"
        mkdir -p "$CLAUDE_DESKTOP_CONFIG_DIR"
    fi
    
    # Backup existing config if it exists
    if [ -f "$CLAUDE_DESKTOP_CONFIG_FILE" ]; then
        backup_file="${CLAUDE_DESKTOP_CONFIG_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
        log "${YELLOW}💾 Backing up existing config to: $backup_file${NC}"
        cp "$CLAUDE_DESKTOP_CONFIG_FILE" "$backup_file"
    fi
    
    # Copy our config
    log "${BLUE}📋 Installing Claude Desktop MCP configuration...${NC}"
    cp "$PROJECT_ROOT/config/claude-desktop/claude_desktop_config.json" "$CLAUDE_DESKTOP_CONFIG_FILE"
    
    log "${GREEN}✅ Claude Desktop configuration installed${NC}"
    log "${BLUE}📍 Config location: $CLAUDE_DESKTOP_CONFIG_FILE${NC}"
}

# Function to display Claude Code setup instructions
setup_claude_code() {
    log "${BLUE}💻 Claude Code Setup Instructions:${NC}"
    log "${YELLOW}📋 Claude Code requires manual configuration:${NC}"
    echo ""
    log "1. Open Claude Code settings/configuration"
    log "2. Add the following MCP server configuration:"
    echo ""
    cat "$PROJECT_ROOT/config/claude-code/claude_code_config.json"
    echo ""
    log "3. Save and restart Claude Code"
    echo ""
}

# Function to verify setup
verify_setup() {
    log "${BLUE}🔍 Verifying setup...${NC}"
    
    # Check if Claude Desktop config exists and is valid
    if [ -f "$CLAUDE_DESKTOP_CONFIG_FILE" ]; then
        if python3 -m json.tool "$CLAUDE_DESKTOP_CONFIG_FILE" >/dev/null 2>&1; then
            log "${GREEN}✅ Claude Desktop config is valid JSON${NC}"
        else
            log "${RED}❌ Claude Desktop config has invalid JSON syntax${NC}"
            return 1
        fi
    else
        log "${RED}❌ Claude Desktop config file not found${NC}"
        return 1
    fi
    
    # Check if MCP servers are still running
    if check_mcp_servers; then
        log "${GREEN}✅ MCP servers are accessible${NC}"
    else
        log "${RED}❌ MCP servers are not accessible${NC}"
        return 1
    fi
    
    return 0
}

# Function to display next steps
show_next_steps() {
    log "${GREEN}🎉 Setup Complete!${NC}"
    echo ""
    log "${BLUE}📋 Next Steps:${NC}"
    log "1. ${YELLOW}Restart Claude Desktop${NC} (quit completely and reopen)"
    log "2. ${YELLOW}Configure Claude Code${NC} manually (see instructions above)"
    log "3. ${YELLOW}Test the integration:${NC}"
    log "   • In Claude Desktop: Ask 'Can you access my memory?'"
    log "   • Check for MCP server connections in status bar"
    echo ""
    log "${BLUE}🔗 Available Endpoints:${NC}"
    log "   • Memory MCP: http://localhost:3301/health"
    log "   • Data Pipeline: http://localhost:3011/health"
    log "   • Realtime Analytics: http://localhost:3012/health"
    log "   • Data Warehouse: http://localhost:3013/health"
    log "   • ML Deployment: http://localhost:3014/health"
    log "   • Data Governance: http://localhost:3015/health"
    echo ""
    log "${BLUE}📖 Documentation:${NC}"
    log "   • Setup Guide: SETUP_CLAUDE_INTEGRATION.md"
    log "   • Startup Guide: docs/STARTUP_GUIDE.md"
    echo ""
}

# Main execution
main() {
    log "${GREEN}🚀 Claude Desktop & Claude Code Integration Setup${NC}"
    log "${BLUE}📂 Project Root: $PROJECT_ROOT${NC}"
    echo ""
    
    cd "$PROJECT_ROOT"
    
    # Step 1: Check if MCP servers are running
    if ! check_mcp_servers; then
        log "${RED}❌ Setup failed: MCP servers must be running first${NC}"
        log "${BLUE}💡 Run this command first: bash scripts/start-mcp-ecosystem.sh${NC}"
        exit 1
    fi
    
    # Step 2: Setup Claude Desktop
    setup_claude_desktop
    
    # Step 3: Show Claude Code instructions
    setup_claude_code
    
    # Step 4: Verify setup
    if verify_setup; then
        show_next_steps
    else
        log "${RED}❌ Setup verification failed${NC}"
        exit 1
    fi
}

# Run main function
main "$@"