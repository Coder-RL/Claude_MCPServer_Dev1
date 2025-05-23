#!/bin/bash

# Claude MCP Server Ecosystem - Complete Startup Script
# This script starts all infrastructure and MCP servers with comprehensive error handling

set -e  # Exit on any error

PROJECT_ROOT="/Users/robertlee/GitHubProjects/Claude_MCPServer"
LOG_DIR="$PROJECT_ROOT/logs"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
STARTUP_LOG="$LOG_DIR/startup_$TIMESTAMP.log"

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
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$STARTUP_LOG"
}

# Function to check if a port is in use
check_port() {
    local port=$1
    if lsof -i :$port &>/dev/null; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Function to wait for service to be ready
wait_for_service() {
    local service_name=$1
    local check_command=$2
    local max_attempts=${3:-30}
    local attempt=1
    
    log "${BLUE}⏳ Waiting for $service_name to be ready...${NC}"
    
    while [ $attempt -le $max_attempts ]; do
        if eval "$check_command" &>/dev/null; then
            log "${GREEN}✅ $service_name is ready!${NC}"
            return 0
        fi
        log "   Attempt $attempt/$max_attempts..."
        sleep 2
        ((attempt++))
    done
    
    log "${RED}❌ $service_name failed to start after $max_attempts attempts${NC}"
    return 1
}

# Function to start a background process with logging
start_background_service() {
    local service_name=$1
    local command=$2
    local port=$3
    local log_file="$LOG_DIR/${service_name}_$TIMESTAMP.log"
    
    log "${BLUE}🚀 Starting $service_name...${NC}"
    
    # Start service in background with logging
    nohup bash -c "$command" > "$log_file" 2>&1 &
    local pid=$!
    
    # Save PID for shutdown
    echo "$pid" > "$LOG_DIR/${service_name}.pid"
    
    # Wait a moment for service to initialize
    sleep 3
    
    # Check if process is still running
    if kill -0 $pid 2>/dev/null; then
        if [ -n "$port" ] && check_port $port; then
            log "${GREEN}✅ $service_name started successfully (PID: $pid, Port: $port)${NC}"
        elif [ -z "$port" ]; then
            log "${GREEN}✅ $service_name started successfully (PID: $pid, stdio)${NC}"
        else
            log "${YELLOW}⚠️  $service_name started (PID: $pid) but port $port not available yet${NC}"
        fi
    else
        log "${RED}❌ $service_name failed to start (check $log_file)${NC}"
        return 1
    fi
}

# Main startup sequence
main() {
    log "${GREEN}🚀 Starting Claude MCP Server Ecosystem...${NC}"
    log "${BLUE}📂 Project Root: $PROJECT_ROOT${NC}"
    log "${BLUE}📝 Startup Log: $STARTUP_LOG${NC}"
    
    cd "$PROJECT_ROOT"
    
    # Step 1: Stop any existing services
    log "${YELLOW}🛑 Stopping any existing services...${NC}"
    bash scripts/stop-mcp-ecosystem.sh 2>/dev/null || true
    
    # Step 2: Start Docker infrastructure
    log "${BLUE}🐳 Starting Docker infrastructure...${NC}"
    npm run docker:up 2>&1 | tee -a "$STARTUP_LOG"
    
    # Wait for Docker services
    wait_for_service "PostgreSQL" "pg_isready -h localhost -U postgres"
    wait_for_service "Redis" "docker exec claude-mcp-redis redis-cli ping"
    
    # Step 3: Setup database
    log "${BLUE}🗄️ Setting up database...${NC}"
    createdb -h localhost -U postgres mcp_enhanced 2>/dev/null || log "Database mcp_enhanced already exists"
    
    # Run essential migrations
    log "${BLUE}📋 Running database migrations...${NC}"
    psql -h localhost -U postgres -d mcp_enhanced -f database/migrations/001_create_schemas.sql 2>&1 | tee -a "$STARTUP_LOG" || true
    psql -h localhost -U postgres -d mcp_enhanced -f database/migrations/009_mcp_memory_tables.sql 2>&1 | tee -a "$STARTUP_LOG" || true
    
    # Step 4: Start MCP servers
    log "${BLUE}🧠 Starting MCP servers...${NC}"
    
    # Simple Memory MCP (port 3301)
    start_background_service "memory-simple" \
        "cd mcp/memory && PORT=3301 node simple-server.js" \
        "3301"
    
    # Sequential Thinking MCP (skipped - stdio server)
    log "${BLUE}⏩ Skipping sequential-thinking (stdio MCP server)${NC}"
    
    # Week 11 Data Analytics Servers
    log "${BLUE}📊 Starting Week 11 Data Analytics servers...${NC}"
    
    start_background_service "data-pipeline" \
        "DATA_PIPELINE_PORT=3011 tsx servers/data-analytics/src/data-pipeline.ts" \
        "3011"
    
    start_background_service "realtime-analytics" \
        "REALTIME_ANALYTICS_PORT=3012 tsx servers/data-analytics/src/realtime-analytics.ts" \
        "3012"
    
    start_background_service "data-warehouse" \
        "DATA_WAREHOUSE_PORT=3013 tsx servers/data-analytics/src/data-warehouse.ts" \
        "3013"
    
    start_background_service "ml-deployment" \
        "ML_DEPLOYMENT_PORT=3014 tsx servers/data-analytics/src/ml-deployment.ts" \
        "3014"
    
    start_background_service "data-governance" \
        "DATA_GOVERNANCE_PORT=3015 tsx servers/data-analytics/src/data-governance.ts" \
        "3015"
    
    # Advanced MCP Servers
    log "${BLUE}🔒 Starting Advanced MCP servers...${NC}"
    
    start_background_service "security-vulnerability" \
        "SECURITY_VULNERABILITY_PORT=3016 tsx servers/security-vulnerability/src/security-vulnerability.ts" \
        "3016"
    
    start_background_service "ui-design" \
        "UI_DESIGN_PORT=3017 tsx servers/ui-design/src/ui-design.ts" \
        "3017"
    
    start_background_service "optimization" \
        "OPTIMIZATION_PORT=3018 tsx servers/optimization/src/optimization.ts" \
        "3018"
    
    # Step 5: Health checks
    log "${BLUE}🏥 Performing health checks...${NC}"
    sleep 5
    
    # Check all services
    services_status=""
    if curl -s http://localhost:3301/health &>/dev/null; then
        services_status+="${GREEN}✅ Memory Simple MCP${NC}\n"
    else
        services_status+="${RED}❌ Memory Simple MCP${NC}\n"
    fi
    
    # Sequential Thinking skipped
    services_status+="${YELLOW}⏩ Sequential Thinking MCP (skipped)${NC}\n"
    
    # Check Week 11 servers
    for port in 3011 3012 3013 3014 3015; do
        if check_port $port; then
            services_status+="${GREEN}✅ Data Analytics Server ($port)${NC}\n"
        else
            services_status+="${RED}❌ Data Analytics Server ($port)${NC}\n"
        fi
    done
    
    # Check Advanced MCP servers
    for port in 3016 3017 3018; do
        if check_port $port; then
            services_status+="${GREEN}✅ Advanced MCP Server ($port)${NC}\n"
        else
            services_status+="${RED}❌ Advanced MCP Server ($port)${NC}\n"
        fi
    done
    
    # Step 6: Summary
    log "${GREEN}🎉 STARTUP COMPLETE!${NC}"
    log "${BLUE}📊 Services Status:${NC}"
    echo -e "$services_status" | tee -a "$STARTUP_LOG"
    
    log "${BLUE}🔗 Available endpoints:${NC}"
    log "   • Memory MCP Health: http://localhost:3301/health"
    log "   • Data Pipeline: http://localhost:3011/health"
    log "   • Realtime Analytics: http://localhost:3012/health"
    log "   • Data Warehouse: http://localhost:3013/health"
    log "   • ML Deployment: http://localhost:3014/health"
    log "   • Data Governance: http://localhost:3015/health"
    log "   • Security Vulnerability: http://localhost:3016/health"
    log "   • UI Design: http://localhost:3017/health"
    log "   • Optimization: http://localhost:3018/health"
    
    log "${BLUE}📁 Log files available in: $LOG_DIR${NC}"
    log "${BLUE}🛑 To stop all services: bash scripts/stop-mcp-ecosystem.sh${NC}"
    
    # Create status file
    echo "RUNNING" > "$LOG_DIR/ecosystem.status"
    echo "$TIMESTAMP" > "$LOG_DIR/ecosystem.start_time"
}

# Trap errors and cleanup
trap 'log "${RED}❌ Startup failed! Check logs in $LOG_DIR${NC}"; exit 1' ERR

# Run main function
main "$@"