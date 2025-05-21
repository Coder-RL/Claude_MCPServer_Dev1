#!/usr/bin/env node

/**
 * Simplified Memory MCP Server for testing
 * In-memory storage with health monitoring
 */

const http = require('http');

class SimpleMemoryMCP {
  constructor() {
    this.port = process.env.PORT || 3201;
    this.memories = new Map();
    this.server = null;
    this.startTime = Date.now();
  }

  createServer() {
    this.server = http.createServer((req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      const url = new URL(req.url, `http://${req.headers.host}`);
      
      if (url.pathname === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'healthy',
          service: 'memory-mcp-simple',
          version: '1.0.0',
          uptime: Date.now() - this.startTime,
          memoriesCount: this.memories.size,
          timestamp: new Date().toISOString()
        }));
        return;
      }

      if (url.pathname === '/memory' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const { content, importance = 1.0, tags = [] } = JSON.parse(body);
            const id = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            this.memories.set(id, {
              id,
              content,
              importance,
              tags,
              created: new Date().toISOString()
            });

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, id, content }));
          } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
          }
        });
        return;
      }

      if (url.pathname === '/memory/search' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const { query } = JSON.parse(body);
            const results = Array.from(this.memories.values())
              .filter(m => m.content.toLowerCase().includes(query.toLowerCase()))
              .slice(0, 10);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, results }));
          } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
          }
        });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });
  }

  start() {
    this.createServer();
    this.server.listen(this.port, '0.0.0.0', () => {
      console.log(`🧠 Simple Memory MCP running on port ${this.port}`);
      console.log(`📊 Health: http://localhost:${this.port}/health`);
    });
  }
}

if (require.main === module) {
  const server = new SimpleMemoryMCP();
  server.start();
}

module.exports = SimpleMemoryMCP;