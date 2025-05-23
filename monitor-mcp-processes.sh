#!/bin/bash

# MCP Process Monitor - Tracks process health for 5+ minutes
# Detects automatic shutdowns and logs all activity

PROJECT_ROOT="/Users/robertlee/GitHubProjects/Claude_MCPServer"
LOG_FILE="$PROJECT_ROOT/logs/process-monitor.log"
MONITOR_DURATION=360  # 6 minutes (360 seconds)

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Log function
log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Monitor specific services
SERVICES=(
    "memory-simple:3301:/health"
    "data-pipeline:8110:/health" 
    "realtime-analytics:8112:/health"
    "data-warehouse:8113:/health"
    "ml-deployment:8114:/health"
    "data-governance:8115:/health"
)

log "${GREEN}🔍 Starting MCP Process Monitor (Duration: ${MONITOR_DURATION}s)${NC}"
log "${BLUE}📊 Monitoring ${#SERVICES[@]} services${NC}"

# Initial status check
log "${BLUE}📋 Initial Status Check:${NC}"
for service in "${SERVICES[@]}"; do
    IFS=':' read -r name port endpoint <<< "$service"
    if lsof -i :$port >/dev/null 2>&1; then
        if curl -s "http://localhost:$port$endpoint" >/dev/null 2>&1; then
            log "   ✅ $name (port $port) - RUNNING & HEALTHY"
        else
            log "   ⚠️  $name (port $port) - RUNNING but health check failed"
        fi
    else
        log "   ❌ $name (port $port) - NOT RUNNING"
    fi
done

start_time=$(date +%s)
check_interval=30  # Check every 30 seconds
check_count=0

log "${BLUE}⏱️  Starting continuous monitoring (checking every ${check_interval}s)${NC}"

while true; do
    current_time=$(date +%s)
    elapsed=$((current_time - start_time))
    
    if [ $elapsed -ge $MONITOR_DURATION ]; then
        log "${GREEN}✅ Monitoring completed successfully (${elapsed}s elapsed)${NC}"
        break
    fi
    
    check_count=$((check_count + 1))
    log "${YELLOW}🔄 Check #${check_count} (${elapsed}s elapsed, ${MONITOR_DURATION}s target)${NC}"
    
    # Check each service
    for service in "${SERVICES[@]}"; do
        IFS=':' read -r name port endpoint <<< "$service"
        
        if lsof -i :$port >/dev/null 2>&1; then
            # Port is listening, check health
            if curl -s --max-time 5 "http://localhost:$port$endpoint" >/dev/null 2>&1; then
                log "   ✅ $name - OK"
            else
                log "   ⚠️  $name - Port open but health check failed"
            fi
        else
            # Port not listening - potential shutdown
            log "   ❌ $name - PORT NOT LISTENING (potential shutdown detected!)"
            
            # Try to find the process by name
            if pgrep -f "$name" >/dev/null 2>&1; then
                log "   🔍 Process '$name' still found in process list but not listening on port $port"
            else
                log "   💀 Process '$name' completely disappeared - AUTOMATIC SHUTDOWN DETECTED!"
            fi
        fi
    done
    
    # Memory usage check
    memory_usage=$(ps -A -o %mem,command | grep -E "(tsx|node)" | grep -E "(data-|memory-)" | awk '{sum += $1} END {print sum}')
    if [ -n "$memory_usage" ]; then
        log "   💾 Total MCP memory usage: ${memory_usage}%"
    fi
    
    log "   ⏰ Next check in ${check_interval}s..."
    sleep $check_interval
done

# Final comprehensive check
log "${BLUE}🏁 Final Status Report:${NC}"
for service in "${SERVICES[@]}"; do
    IFS=':' read -r name port endpoint <<< "$service"
    if lsof -i :$port >/dev/null 2>&1; then
        if curl -s "http://localhost:$port$endpoint" >/dev/null 2>&1; then
            log "   ✅ $name - STILL RUNNING & HEALTHY"
        else
            log "   ⚠️  $name - STILL RUNNING but health degraded"
        fi
    else
        log "   💀 $name - SHUTDOWN (not listening on port $port)"
    fi
done

log "${GREEN}🎯 Monitoring Summary:${NC}"
log "   📊 Total checks performed: $check_count"
log "   ⏱️  Total monitoring time: ${elapsed}s"
log "   📁 Full log: $LOG_FILE"

# Check for any process crashes in logs
log "${BLUE}🔍 Checking for error patterns in recent logs:${NC}"
for service in "${SERVICES[@]}"; do
    IFS=':' read -r name port endpoint <<< "$service"
    log_pattern="*${name}*.log"
    if ls logs/$log_pattern 2>/dev/null | head -1 >/dev/null; then
        error_count=$(grep -i -E "(error|crash|exit|fail)" logs/$log_pattern 2>/dev/null | wc -l | tr -d ' ')
        if [ "$error_count" -gt 0 ]; then
            log "   ⚠️  $name: Found $error_count potential error lines in logs"
        else
            log "   ✅ $name: No obvious errors in logs"
        fi
    fi
done

log "${GREEN}🏁 MCP Process Monitoring Complete!${NC}"