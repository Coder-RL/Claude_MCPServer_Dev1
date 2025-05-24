#!/usr/bin/env node

/**
 * HTTP-based Memory MCP Server for testing
 * Fixed version that uses HTTP transport instead of STDIO
 * Addresses common MCP server startup issues found in community forums
 */

import http from 'http';
import { URL } from 'url';

class HTTPMemoryMCP {
  constructor() {
    this.memories = new Map();
    this.startTime = Date.now();
    this.port = process.env.PORT || 3301;
    this.server = null;
  }

  async start() {
    this.server = http.createServer((req, res) => {
      // Set CORS headers for all responses
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      this.handleRequest(req, res).catch(error => {
        console.error('Request handling error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: 'Internal server error', 
          details: error.message 
        }));
      });
    });

    this.server.listen(this.port, '0.0.0.0', () => {
      console.log(`🧠 Simple Memory MCP running on port ${this.port}`);
      console.log(`📊 Health: http://localhost:${this.port}/health`);
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down Memory MCP server...');
      this.server.close(() => {
        console.log('✅ Server stopped');
        process.exit(0);
      });
    });
  }

  async handleRequest(req, res) {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const path = parsedUrl.pathname;
    const method = req.method.toLowerCase();

    // Health check endpoint
    if (path === '/health' && method === 'get') {
      return this.handleHealth(req, res);
    }

    // MCP protocol endpoint for tool listing
    if (path === '/tools' && method === 'get') {
      return this.handleToolsList(req, res);
    }

    // MCP tool execution endpoint
    if (path === '/tools/call' && method === 'post') {
      return this.handleToolCall(req, res);
    }

    // Legacy memory operations for backward compatibility
    if (path === '/memory' && method === 'post') {
      return this.handleStoreMemory(req, res);
    }

    if (path === '/memory/list' && method === 'get') {
      return this.handleListMemories(req, res);
    }

    if (path.startsWith('/memory/') && method === 'get') {
      const key = path.split('/')[2];
      return this.handleGetMemory(req, res, key);
    }

    if (path.startsWith('/memory/') && method === 'delete') {
      const key = path.split('/')[2];
      return this.handleDeleteMemory(req, res, key);
    }

    // Default 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  async handleHealth(req, res) {
    const health = {
      status: 'healthy',
      service: 'memory-mcp-simple',
      version: '1.0.0',
      uptime: Date.now() - this.startTime,
      memoriesCount: this.memories.size,
      timestamp: new Date().toISOString()
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health));
  }

  async handleToolsList(req, res) {
    const tools = [
      {
        name: 'store_memory',
        description: 'Store a memory with a key-value pair',
        inputSchema: {
          type: 'object',
          properties: {
            key: { type: 'string' },
            value: { type: 'string' },
            metadata: { type: 'object' }
          },
          required: ['key', 'value']
        }
      },
      {
        name: 'retrieve_memory',
        description: 'Retrieve a memory by key',
        inputSchema: {
          type: 'object',
          properties: {
            key: { type: 'string' }
          },
          required: ['key']
        }
      },
      {
        name: 'list_memories',
        description: 'List all stored memories',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'delete_memory',
        description: 'Delete a memory by key',
        inputSchema: {
          type: 'object',
          properties: {
            key: { type: 'string' }
          },
          required: ['key']
        }
      },
      {
        name: 'health_check',
        description: 'Check server health status',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ];

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tools }));
  }

  async handleToolCall(req, res) {
    const body = await this.readRequestBody(req);
    const { name, arguments: args } = JSON.parse(body);

    let result;
    try {
      switch (name) {
        case 'store_memory':
          result = await this.storeMemory(args);
          break;
        case 'retrieve_memory':
          result = await this.retrieveMemory(args);
          break;
        case 'list_memories':
          result = await this.listMemories();
          break;
        case 'delete_memory':
          result = await this.deleteMemory(args);
          break;
        case 'health_check':
          result = await this.healthCheck();
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, result }));

    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: false, 
        error: error.message 
      }));
    }
  }

  async storeMemory(args) {
    const { key, value, metadata = {} } = args;
    
    this.memories.set(key, {
      key,
      value,
      metadata,
      created: new Date().toISOString(),
      updated: new Date().toISOString()
    });

    return {
      content: [
        {
          type: 'text',
          text: `Memory stored successfully: ${key}`
        }
      ]
    };
  }

  async retrieveMemory(args) {
    const { key } = args;
    const memory = this.memories.get(key);

    if (!memory) {
      return {
        content: [
          {
            type: 'text',
            text: `Memory not found: ${key}`
          }
        ]
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(memory, null, 2)
        }
      ]
    };
  }

  async listMemories() {
    const memories = Array.from(this.memories.values());

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            count: memories.length,
            memories: memories.map(m => ({ key: m.key, created: m.created }))
          }, null, 2)
        }
      ]
    };
  }

  async deleteMemory(args) {
    const { key } = args;
    const existed = this.memories.has(key);
    
    if (existed) {
      this.memories.delete(key);
    }

    return {
      content: [
        {
          type: 'text',
          text: existed ? `Memory deleted: ${key}` : `Memory not found: ${key}`
        }
      ]
    };
  }

  async healthCheck() {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'healthy',
            service: 'memory-simple',
            version: '1.0.0',
            uptime: Date.now() - this.startTime,
            memoriesCount: this.memories.size,
            timestamp: new Date().toISOString()
          }, null, 2)
        }
      ]
    };
  }

  // Legacy HTTP endpoints for backward compatibility
  async handleStoreMemory(req, res) {
    const body = await this.readRequestBody(req);
    const { key, value, metadata } = JSON.parse(body);

    if (!key || !value) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Key and value are required' }));
      return;
    }

    const result = await this.storeMemory({ key, value, metadata });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: result.content[0].text }));
  }

  async handleListMemories(req, res) {
    const result = await this.listMemories();
    const data = JSON.parse(result.content[0].text);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  async handleGetMemory(req, res, key) {
    const result = await this.retrieveMemory({ key });
    const text = result.content[0].text;
    
    if (text.includes('not found')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: text }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(text);
    }
  }

  async handleDeleteMemory(req, res, key) {
    const result = await this.deleteMemory({ key });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: result.content[0].text }));
  }

  async readRequestBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new HTTPMemoryMCP();
  server.start().catch(error => {
    console.error('❌ Failed to start Memory MCP Server:', error);
    process.exit(1);
  });
}

export default HTTPMemoryMCP;