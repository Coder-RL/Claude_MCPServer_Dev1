#!/bin/bash

# Claude MCP Server Ecosystem - Enhanced Startup Script with Database Infrastructure Checking
# This script checks for existing database infrastructure and provides guidance for starting services

set -e  # Exit on any error

PROJECT_ROOT="/Users/robertlee/GitHubProjects/Claude_MCPServer"
LOG_DIR="$PROJECT_ROOT/logs"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
STARTUP_LOG="$LOG_DIR/startup_enhanced_$TIMESTAMP.log"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
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

# Function to check PostgreSQL status
check_postgresql() {
    log "${CYAN}🔍 Checking PostgreSQL infrastructure...${NC}"
    
    # Check if PostgreSQL is running via Docker
    if docker ps --format '{{.Names}}' | grep -q "claude-mcp-postgres"; then
        if pg_isready -h localhost -U postgres &>/dev/null; then
            log "${GREEN}✅ PostgreSQL is running via Docker (Container: claude-mcp-postgres)${NC}"
            return 0
        else
            log "${YELLOW}⚠️  PostgreSQL Docker container exists but not responding${NC}"
        fi
    fi
    
    # Check if PostgreSQL is running locally
    if pg_isready -h localhost -U postgres &>/dev/null; then
        log "${GREEN}✅ PostgreSQL is running locally${NC}"
        return 0
    fi
    
    # Check if PostgreSQL process is running
    if pgrep -f postgres &>/dev/null; then
        local postgres_pid=$(pgrep -f postgres | head -1)
        log "${YELLOW}⚠️  PostgreSQL process found (PID: $postgres_pid) but not accessible on localhost:5432${NC}"
        log "${BLUE}💡 Try connecting with: psql -h localhost -U postgres${NC}"
        return 1
    fi
    
    # Check if port 5432 is occupied by something else
    if check_port 5432; then
        local port_process=$(lsof -i :5432 | tail -1 | awk '{print $1}')
        log "${YELLOW}⚠️  Port 5432 is occupied by: $port_process${NC}"
        log "${BLUE}💡 To free the port: sudo kill \$(lsof -t -i:5432)${NC}"
        return 1
    fi
    
    log "${RED}❌ PostgreSQL is not running${NC}"
    log "${BLUE}💡 To start PostgreSQL:${NC}"
    log "   1. Via Docker: docker start claude-mcp-postgres"
    log "   2. Or start all infrastructure: npm run docker:up"
    log "   3. Or install locally: brew install postgresql && brew services start postgresql"
    return 1
}

# Function to check Redis status
check_redis() {
    log "${CYAN}🔍 Checking Redis infrastructure...${NC}"
    
    # Check if Redis is running via Docker
    if docker ps --format '{{.Names}}' | grep -q "claude-mcp-redis"; then
        if docker exec claude-mcp-redis redis-cli ping &>/dev/null; then
            log "${GREEN}✅ Redis is running via Docker (Container: claude-mcp-redis)${NC}"
            return 0
        else
            log "${YELLOW}⚠️  Redis Docker container exists but not responding${NC}"
        fi
    fi
    
    # Check if Redis is running locally
    if redis-cli ping &>/dev/null; then
        log "${GREEN}✅ Redis is running locally${NC}"
        return 0
    fi
    
    # Check if Redis process is running
    if pgrep -f redis &>/dev/null; then
        local redis_pid=$(pgrep -f redis | head -1)
        log "${YELLOW}⚠️  Redis process found (PID: $redis_pid) but not accessible via redis-cli${NC}"
        log "${BLUE}💡 Try connecting with: redis-cli -h localhost -p 6379${NC}"
        return 1
    fi
    
    # Check if port 6379 is occupied by something else
    if check_port 6379; then
        local port_process=$(lsof -i :6379 | tail -1 | awk '{print $1}')
        log "${YELLOW}⚠️  Port 6379 is occupied by: $port_process${NC}"
        log "${BLUE}💡 To free the port: sudo kill \$(lsof -t -i:6379)${NC}"
        return 1
    fi
    
    log "${RED}❌ Redis is not running${NC}"
    log "${BLUE}💡 To start Redis:${NC}"
    log "   1. Via Docker: docker start claude-mcp-redis"
    log "   2. Or start all infrastructure: npm run docker:up"
    log "   3. Or install locally: brew install redis && brew services start redis"
    return 1
}

# Function to check Qdrant status
check_qdrant() {
    log "${CYAN}🔍 Checking Qdrant infrastructure...${NC}"
    
    # Check if Qdrant is running via Docker
    if docker ps --format '{{.Names}}' | grep -q "claude-mcp-qdrant"; then
        if curl -s http://localhost:6333/health &>/dev/null; then
            log "${GREEN}✅ Qdrant is running via Docker (Container: claude-mcp-qdrant)${NC}"
            return 0
        else
            log "${YELLOW}⚠️  Qdrant Docker container exists but not responding${NC}"
        fi
    fi
    
    # Check if Qdrant is running locally
    if curl -s http://localhost:6333/health &>/dev/null; then
        log "${GREEN}✅ Qdrant is running locally${NC}"
        return 0
    fi
    
    # Check if Qdrant process is running
    if pgrep -f qdrant &>/dev/null; then
        local qdrant_pid=$(pgrep -f qdrant | head -1)
        log "${YELLOW}⚠️  Qdrant process found (PID: $qdrant_pid) but not accessible on localhost:6333${NC}"
        log "${BLUE}💡 Try accessing: curl http://localhost:6333/health${NC}"
        return 1
    fi
    
    # Check if port 6333 is occupied by something else
    if check_port 6333; then
        local port_process=$(lsof -i :6333 | tail -1 | awk '{print $1}')
        log "${YELLOW}⚠️  Port 6333 is occupied by: $port_process${NC}"
        log "${BLUE}💡 To free the port: sudo kill \$(lsof -t -i:6333)${NC}"
        return 1
    fi
    
    log "${RED}❌ Qdrant is not running${NC}"
    log "${BLUE}💡 To start Qdrant:${NC}"
    log "   1. Via Docker: docker start claude-mcp-qdrant"
    log "   2. Or start all infrastructure: npm run docker:up"
    log "   3. Or install locally: Download from https://qdrant.tech/documentation/quick-start/"
    return 1
}

# Function to check Docker availability
check_docker() {
    log "${CYAN}🔍 Checking Docker infrastructure...${NC}"
    
    if ! command -v docker &>/dev/null; then
        log "${RED}❌ Docker is not installed${NC}"
        log "${BLUE}💡 Install Docker Desktop from: https://www.docker.com/products/docker-desktop${NC}"
        return 1
    fi
    
    if ! docker info &>/dev/null; then
        log "${RED}❌ Docker daemon is not running${NC}"
        log "${BLUE}💡 Start Docker Desktop application${NC}"
        return 1
    fi
    
    log "${GREEN}✅ Docker is available and running${NC}"
    return 0
}

# Function to auto-start infrastructure if needed
auto_start_infrastructure() {
    local missing_services=()
    
    # Check which services are missing
    check_postgresql || missing_services+=("PostgreSQL")
    check_redis || missing_services+=("Redis")
    check_qdrant || missing_services+=("Qdrant")
    
    if [ ${#missing_services[@]} -eq 0 ]; then
        log "${GREEN}🎉 All database infrastructure is running!${NC}"
        return 0
    fi
    
    log "${YELLOW}⚠️  Missing services: ${missing_services[*]}${NC}"
    
    # Check if Docker is available for auto-start
    if check_docker; then
        log "${BLUE}🐳 Attempting to start missing services via Docker...${NC}"
        
        # Start Docker infrastructure
        cd "$PROJECT_ROOT"
        npm run docker:up 2>&1 | tee -a "$STARTUP_LOG"
        
        # Wait a moment for services to initialize
        sleep 5
        
        # Re-check services
        local still_missing=()
        check_postgresql || still_missing+=("PostgreSQL")
        check_redis || still_missing+=("Redis")
        check_qdrant || still_missing+=("Qdrant")
        
        if [ ${#still_missing[@]} -eq 0 ]; then
            log "${GREEN}🎉 All database services started successfully!${NC}"
            return 0
        else
            log "${RED}❌ Failed to start: ${still_missing[*]}${NC}"
            return 1
        fi
    else
        log "${RED}❌ Cannot auto-start services without Docker${NC}"
        return 1
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
    
    # Check if port is already in use
    if [ -n "$port" ] && check_port $port; then
        local existing_process=$(lsof -i :$port | tail -1 | awk '{print $2}')
        log "${YELLOW}⚠️  Port $port is already in use by PID $existing_process${NC}"
        log "${BLUE}💡 To stop existing process: kill $existing_process${NC}"
        return 1
    fi
    
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
        else
            log "${GREEN}✅ $service_name started successfully (PID: $pid)${NC}"
        fi
    else
        log "${RED}❌ $service_name failed to start (check $log_file)${NC}"
        return 1
    fi
}

# Function to check existing MCP services
check_existing_mcp_services() {
    log "${CYAN}🔍 Checking for existing MCP services...${NC}"
    
    local mcp_ports=(3301 3302 3011 3012 3013 3014 3015)
    local running_services=()
    
    for port in "${mcp_ports[@]}"; do
        if check_port $port; then
            local process_info=$(lsof -i :$port | tail -1 | awk '{print $2 " " $1}')
            running_services+=("Port $port: $process_info")
        fi
    done
    
    if [ ${#running_services[@]} -gt 0 ]; then
        log "${YELLOW}⚠️  Found existing MCP services:${NC}"
        for service in "${running_services[@]}"; do
            log "   $service"
        done
        log "${BLUE}💡 To stop all MCP services: bash scripts/stop-mcp-ecosystem.sh${NC}"
        return 1
    else
        log "${GREEN}✅ No existing MCP services found${NC}"
        return 0
    fi
}

# Main startup sequence
main() {
    log "${GREEN}🚀 Starting Claude MCP Server Ecosystem (Enhanced)...${NC}"
    log "${BLUE}📂 Project Root: $PROJECT_ROOT${NC}"
    log "${BLUE}📝 Startup Log: $STARTUP_LOG${NC}"
    
    cd "$PROJECT_ROOT"
    
    # Step 1: Infrastructure checks
    log "${BLUE}🔍 Phase 1: Infrastructure Assessment${NC}"
    
    # Auto-start infrastructure if needed
    if ! auto_start_infrastructure; then
        log "${RED}❌ Infrastructure setup failed. Please start services manually.${NC}"
        exit 1
    fi
    
    # Step 2: Check for existing MCP services
    log "${BLUE}🔍 Phase 2: MCP Service Assessment${NC}"
    
    if ! check_existing_mcp_services; then
        log "${YELLOW}🛑 Stopping existing MCP services...${NC}"
        bash scripts/stop-mcp-ecosystem.sh 2>/dev/null || true
        sleep 2
    fi
    
    # Step 3: Database setup
    log "${BLUE}🗄️ Phase 3: Database Setup${NC}"
    createdb -h localhost -U postgres mcp_enhanced 2>/dev/null || log "Database mcp_enhanced already exists"
    
    # Run essential migrations
    log "${BLUE}📋 Running database migrations...${NC}"
    psql -h localhost -U postgres -d mcp_enhanced -f database/migrations/001_create_schemas.sql 2>&1 | tee -a "$STARTUP_LOG" || true
    psql -h localhost -U postgres -d mcp_enhanced -f database/migrations/009_mcp_memory_tables.sql 2>&1 | tee -a "$STARTUP_LOG" || true
    
    # Step 4: Start MCP servers
    log "${BLUE}🧠 Phase 4: Starting MCP Servers${NC}"
    
    # Simple Memory MCP (port 3301)
    start_background_service "memory-simple" \
        "cd mcp/memory && PORT=3301 node simple-server.js" \
        "3301"
    
    # Sequential Thinking MCP (port 3302)
    start_background_service "sequential-thinking" \
        "PORT=3302 npx -y @modelcontextprotocol/server-sequential-thinking" \
        "3302"
    
    # Week 11 Data Analytics Servers
    log "${BLUE}📊 Starting Week 11 Data Analytics servers...${NC}"
    
    start_background_service "data-pipeline" \
        "tsx servers/data-analytics/src/data-pipeline.ts" \
        "3011"
    
    start_background_service "realtime-analytics" \
        "tsx servers/data-analytics/src/realtime-analytics.ts" \
        "3012"
    
    start_background_service "data-warehouse" \
        "tsx servers/data-analytics/src/data-warehouse.ts" \
        "3013"
    
    start_background_service "ml-deployment" \
        "tsx servers/data-analytics/src/ml-deployment.ts" \
        "3014"
    
    start_background_service "data-governance" \
        "tsx servers/data-analytics/src/data-governance.ts" \
        "3015"
    
    # Step 5: Final health checks
    log "${BLUE}🏥 Phase 5: Final Health Assessment${NC}"
    sleep 5
    
    # Infrastructure status
    log "${BLUE}📊 Infrastructure Status:${NC}"
    check_postgresql && echo "✅ PostgreSQL" || echo "❌ PostgreSQL"
    check_redis && echo "✅ Redis" || echo "❌ Redis"
    check_qdrant && echo "✅ Qdrant" || echo "❌ Qdrant"
    
    # MCP services status
    log "${BLUE}📊 MCP Services Status:${NC}"
    services_status=""
    if curl -s http://localhost:3301/health &>/dev/null; then
        services_status+="${GREEN}✅ Memory Simple MCP (3301)${NC}\n"
    else
        services_status+="${RED}❌ Memory Simple MCP (3301)${NC}\n"
    fi
    
    if check_port 3302; then
        services_status+="${GREEN}✅ Sequential Thinking MCP (3302)${NC}\n"
    else
        services_status+="${RED}❌ Sequential Thinking MCP (3302)${NC}\n"
    fi
    
    # Check Week 11 servers
    local analytics_services=("Data Pipeline" "Realtime Analytics" "Data Warehouse" "ML Deployment" "Data Governance")
    for i in {0..4}; do
        local port=$((3011 + i))
        if check_port $port; then
            services_status+="${GREEN}✅ ${analytics_services[$i]} ($port)${NC}\n"
        else
            services_status+="${RED}❌ ${analytics_services[$i]} ($port)${NC}\n"
        fi
    done
    
    echo -e "$services_status" | tee -a "$STARTUP_LOG"
    
    # Step 6: Summary and next steps
    log "${GREEN}🎉 ENHANCED STARTUP COMPLETE!${NC}"
    
    log "${BLUE}🔗 Available endpoints:${NC}"
    log "   • Memory MCP Health: http://localhost:3301/health"
    log "   • Data Pipeline: http://localhost:3011/health"
    log "   • Realtime Analytics: http://localhost:3012/health"
    log "   • Data Warehouse: http://localhost:3013/health"
    log "   • ML Deployment: http://localhost:3014/health"
    log "   • Data Governance: http://localhost:3015/health"
    
    log "${BLUE}🛠️  Management commands:${NC}"
    log "   • Stop all services: bash scripts/stop-mcp-ecosystem.sh"
    log "   • Test ecosystem: bash scripts/test-ecosystem.sh"
    log "   • View logs: ls -la $LOG_DIR"
    
    log "${BLUE}📖 For detailed guidance, see: docs/STARTUP_GUIDE.md${NC}"
    
    # Create status file
    echo "RUNNING_ENHANCED" > "$LOG_DIR/ecosystem.status"
    echo "$TIMESTAMP" > "$LOG_DIR/ecosystem.start_time"
}

# Trap errors and cleanup
trap 'log "${RED}❌ Enhanced startup failed! Check logs in $LOG_DIR${NC}"; exit 1' ERR

# Run main function
main "$@"