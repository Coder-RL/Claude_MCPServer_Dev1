#!/bin/bash

# Claude MCP Server Ecosystem - Complete Shutdown Script
# This script stops all infrastructure and MCP servers gracefully

PROJECT_ROOT="/Users/robertlee/GitHubProjects/Claude_MCPServer"
LOG_DIR="$PROJECT_ROOT/logs"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
SHUTDOWN_LOG="$LOG_DIR/shutdown_$TIMESTAMP.log"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Create logs directory
mkdir -p "$LOG_DIR"

# Function to log with timestamp
log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$SHUTDOWN_LOG"
}

# Function to stop a service by PID file
stop_service() {
    local service_name=$1
    local pid_file="$LOG_DIR/${service_name}.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            log "${YELLOW}🛑 Stopping $service_name (PID: $pid)...${NC}"
            kill "$pid" 2>/dev/null || true
            
            # Wait for graceful shutdown
            local count=0
            while kill -0 "$pid" 2>/dev/null && [ $count -lt 10 ]; do
                sleep 1
                ((count++))
            done
            
            # Force kill if still running
            if kill -0 "$pid" 2>/dev/null; then
                log "${RED}⚡ Force killing $service_name...${NC}"
                kill -9 "$pid" 2>/dev/null || true
            fi
            
            log "${GREEN}✅ $service_name stopped${NC}"
        else
            log "${BLUE}ℹ️  $service_name was not running${NC}"
        fi
        rm -f "$pid_file"
    else
        log "${BLUE}ℹ️  No PID file found for $service_name${NC}"
    fi
}

# Function to stop processes by port
stop_by_port() {
    local port=$1
    local service_name=$2
    
    local pid=$(lsof -ti :$port 2>/dev/null || true)
    if [ -n "$pid" ]; then
        log "${YELLOW}🛑 Stopping $service_name on port $port (PID: $pid)...${NC}"
        kill "$pid" 2>/dev/null || true
        sleep 2
        
        # Force kill if still running
        if kill -0 "$pid" 2>/dev/null; then
            log "${RED}⚡ Force killing process on port $port...${NC}"
            kill -9 "$pid" 2>/dev/null || true
        fi
        log "${GREEN}✅ Port $port freed${NC}"
    else
        log "${BLUE}ℹ️  No process found on port $port${NC}"
    fi
}

# Main shutdown sequence
main() {
    log "${YELLOW}🛑 Stopping Claude MCP Server Ecosystem...${NC}"
    log "${BLUE}📂 Project Root: $PROJECT_ROOT${NC}"
    log "${BLUE}📝 Shutdown Log: $SHUTDOWN_LOG${NC}"
    
    cd "$PROJECT_ROOT"
    
    # Step 1: Stop MCP servers by PID files
    log "${BLUE}🧠 Stopping MCP servers...${NC}"
    
    stop_service "memory-simple"
    stop_service "sequential-thinking"
    stop_service "data-pipeline"
    stop_service "realtime-analytics"
    stop_service "data-warehouse"
    stop_service "ml-deployment"
    stop_service "data-governance"
    
    # Step 2: Stop any remaining processes by port
    log "${BLUE}🔌 Checking ports and stopping remaining processes...${NC}"
    
    stop_by_port 3301 "Memory Simple MCP"
    stop_by_port 3302 "Sequential Thinking MCP"
    stop_by_port 3011 "Data Pipeline"
    stop_by_port 3012 "Realtime Analytics"
    stop_by_port 3013 "Data Warehouse"
    stop_by_port 3014 "ML Deployment"
    stop_by_port 3015 "Data Governance"
    
    # Step 3: Stop Docker services
    log "${BLUE}🐳 Stopping Docker infrastructure...${NC}"
    npm run docker:down 2>&1 | tee -a "$SHUTDOWN_LOG" || true
    
    # Step 4: Clean up any remaining Node.js processes related to MCP
    log "${BLUE}🧹 Cleaning up remaining MCP processes...${NC}"
    
    # Kill any remaining tsx processes
    pkill -f "tsx.*servers.*analytics" 2>/dev/null || true
    pkill -f "npx.*sequential-thinking" 2>/dev/null || true
    pkill -f "simple-server.js" 2>/dev/null || true
    
    # Step 5: Clean up status files
    log "${BLUE}📄 Cleaning up status files...${NC}"
    rm -f "$LOG_DIR/ecosystem.status"
    rm -f "$LOG_DIR/ecosystem.start_time"
    rm -f "$LOG_DIR"/*.pid
    
    # Step 6: Final verification
    log "${BLUE}🔍 Final verification...${NC}"
    
    local remaining_processes=""
    for port in 3301 3302 3011 3012 3013 3014 3015; do
        if lsof -i :$port &>/dev/null; then
            remaining_processes+="Port $port still in use\n"
        fi
    done
    
    if [ -n "$remaining_processes" ]; then
        log "${YELLOW}⚠️  Warning: Some processes may still be running:${NC}"
        echo -e "$remaining_processes" | tee -a "$SHUTDOWN_LOG"
    else
        log "${GREEN}✅ All MCP services stopped successfully${NC}"
    fi
    
    log "${GREEN}🎉 SHUTDOWN COMPLETE!${NC}"
    log "${BLUE}📁 Shutdown log: $SHUTDOWN_LOG${NC}"
}

# Run main function
main "$@"