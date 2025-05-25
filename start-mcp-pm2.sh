#!/bin/bash

# MCP Server Ecosystem Startup Script - PM2 Version
# Replaces the problematic CLI-based approach with PM2 process management

set -e

echo "🚀 Starting MCP Server Ecosystem with PM2..."

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2 not found. Installing PM2 globally..."
    npm install -g pm2
fi

# Ensure logs directory exists
mkdir -p logs/pm2

# Check if Docker infrastructure is running
echo "🔍 Checking Docker infrastructure..."
if ! docker compose -f docker-compose.simple.yml ps | grep -q "Up"; then
    echo "🐳 Starting Docker infrastructure..."
    docker compose -f docker-compose.simple.yml up -d
    echo "⏳ Waiting 10 seconds for databases to initialize..."
    sleep 10
fi

# Stop any existing PM2 processes
echo "🧹 Stopping any existing PM2 processes..."
pm2 delete all 2>/dev/null || true

# Start the MCP ecosystem
echo "▶️  Starting MCP servers with PM2..."
pm2 start ecosystem.config.cjs

# Wait a moment for servers to initialize
sleep 5

# Display status
echo "📊 MCP Server Status:"
pm2 status

# Test a sample health endpoint
echo "🔍 Testing server health..."
if curl -sf http://localhost:3202/health > /dev/null; then
    echo "✅ Health check passed - Sequential Thinking server is responding"
else
    echo "⚠️  Health check failed - Sequential Thinking server may not be ready yet"
fi

echo ""
echo "🎉 MCP Server Ecosystem is now running under PM2 management!"
echo ""
echo "📋 Available PM2 commands:"
echo "   pm2 status                   - View server status"
echo "   pm2 logs                     - View all logs"
echo "   pm2 logs [server-name]       - View specific server logs"
echo "   pm2 restart all              - Restart all servers"
echo "   pm2 stop all                 - Stop all servers"
echo "   pm2 delete all               - Stop and remove all servers"
echo "   pm2 monit                    - Real-time monitoring dashboard"
echo ""
echo "🔗 Server endpoints (if HTTP wrappers are configured):"
echo "   Sequential Thinking: http://localhost:3202/health"
echo ""
echo "✨ PM2 provides automatic restarts, monitoring, and logging!"