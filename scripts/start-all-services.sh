#!/bin/bash

# Complete Claude MCP Server Ecosystem Startup
# Starts ALL services that the health check expects

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$PROJECT_ROOT/logs"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
STARTUP_LOG="$LOG_DIR/complete_startup_$TIMESTAMP.log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

mkdir -p "$LOG_DIR"

log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$STARTUP_LOG"
}

log_info() {
    log "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    log "${GREEN}✅ $1${NC}"
}

log_warning() {
    log "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    log "${RED}❌ $1${NC}"
}

# Function to start a service in background
start_service() {
    local name=$1
    local command=$2
    local port=$3
    local working_dir=${4:-$PROJECT_ROOT}
    
    log_info "Starting $name on port $port..."
    
    cd "$working_dir"
    
    # Kill any existing process on the port
    pkill -f ":$port" 2>/dev/null || true
    
    # Start the service
    nohup bash -c "$command" > "$LOG_DIR/${name}_$TIMESTAMP.log" 2>&1 &
    local pid=$!
    echo $pid > "$LOG_DIR/${name}.pid"
    
    # Wait for service to be ready
    local attempts=0
    local max_attempts=15
    
    while [ $attempts -lt $max_attempts ]; do
        if curl -s "http://localhost:$port/health" &>/dev/null; then
            log_success "$name started successfully (PID: $pid)"
            return 0
        fi
        sleep 2
        attempts=$((attempts + 1))
    done
    
    log_warning "$name may not be fully ready yet (PID: $pid)"
    return 0
}

# Main startup sequence
main() {
    log_info "🚀 Starting Complete Claude MCP Server Ecosystem"
    log_info "============================================="
    log_info "Project Root: $PROJECT_ROOT"
    log_info "Startup Log: $STARTUP_LOG"
    log_info ""
    
    cd "$PROJECT_ROOT"
    
    # 1. Stop existing services
    log_info "🛑 Stopping existing services..."
    ./scripts/stop-mcp-ecosystem.sh &>/dev/null || true
    
    # 2. Start Docker infrastructure
    log_info "🐳 Starting Docker infrastructure..."
    npm run docker:up
    
    # Wait for Docker services
    log_info "⏳ Waiting for Docker services..."
    sleep 10
    
    # 3. Start MCP Servers
    log_info "🧠 Starting MCP Servers..."
    
    # Memory MCP Server (port 3201)
    start_service "memory-mcp" "cd mcp/memory && node server.js" "3201" "$PROJECT_ROOT/mcp/memory"
    
    # Sequential Thinking MCP (port 3202)
    start_service "sequential-thinking" "cd mcp/sequential-thinking && node server.js" "3202" "$PROJECT_ROOT/mcp/sequential-thinking"
    
    # Filesystem MCP Server (port 3203)
    start_service "filesystem-mcp" "cd mcp/filesystem && PORT=3203 node server.js" "3203" "$PROJECT_ROOT/mcp/filesystem"
    
    # 4. Start Week 11 Data Analytics Servers
    log_info "📊 Starting Week 11 Data Analytics Servers..."
    
    start_service "data-pipeline" "PORT=3011 tsx servers/data-analytics/src/data-pipeline.ts" "3011"
    start_service "realtime-analytics" "PORT=3012 tsx servers/data-analytics/src/realtime-analytics.ts" "3012"
    start_service "data-warehouse" "PORT=3013 tsx servers/data-analytics/src/data-warehouse.ts" "3013"
    start_service "ml-deployment" "ML_DEPLOYMENT_PORT=3014 tsx servers/data-analytics/src/ml-deployment.ts" "3014"
    start_service "data-governance" "DATA_GOVERNANCE_PORT=3015 tsx servers/data-analytics/src/data-governance.ts" "3015"
    
    # 5. Start Week 14 Attention Mechanisms
    log_info "🎯 Starting Week 14 Attention Mechanisms..."
    
    start_service "attention-pattern-analyzer" "PORT=8000 tsx servers/attention-mechanisms/src/attention-pattern-analyzer.ts" "8000"
    start_service "sparse-attention-engine" "PORT=8001 tsx servers/attention-mechanisms/src/sparse-attention-engine.ts" "8001"
    start_service "memory-efficient-attention" "PORT=8002 tsx servers/attention-mechanisms/src/memory-efficient-attention.ts" "8002"
    start_service "attention-visualization" "PORT=8004 tsx servers/attention-mechanisms/src/attention-visualization-engine.ts" "8004"
    start_service "cross-attention-controller" "PORT=8005 tsx servers/attention-mechanisms/src/cross-attention-controller.ts" "8005"
    
    # 6. Start Week 15 Language Model Interface
    log_info "🗣️  Starting Week 15 Language Model Interface..."
    
    start_service "language-model-interface" "PORT=8003 tsx servers/language-model/src/language-model-interface.ts" "8003"
    start_service "inference-pipeline-manager" "PORT=8006 tsx servers/language-model/src/inference-pipeline-manager.ts" "8006"
    start_service "model-benchmarking-suite" "PORT=8007 tsx servers/language-model/src/model-benchmarking-suite.ts" "8007"
    start_service "model-integration-hub" "PORT=8008 tsx servers/language-model/src/model-integration-hub.ts" "8008"
    
    # 7. Final verification
    log_info "🔍 Running final health check..."
    sleep 5
    node scripts/health-check-all.cjs
    
    log_success ""
    log_success "🎉 COMPLETE STARTUP FINISHED!"
    log_success "============================="
    log_success "All services should now be running"
    log_success "Check health with: node scripts/health-check-all.cjs"
    log_success "Logs directory: $LOG_DIR"
    log_success "Startup log: $STARTUP_LOG"
    log_success ""
}

# Cleanup on exit
cleanup() {
    log_info "Startup script terminating..."
}

trap cleanup EXIT

# Run main function
main "$@"