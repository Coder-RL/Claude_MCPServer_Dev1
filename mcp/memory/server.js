#!/usr/bin/env node

/**
 * Memory MCP Server for Claude_MCPServer Ecosystem
 * Provides persistent memory capabilities using PostgreSQL + Qdrant vector search
 * Enterprise-grade implementation with health monitoring and error handling
 */

const http = require('http');
const { Client } = require('pg');

class MemoryMCPServer {
  constructor() {
    this.port = process.env.PORT || 3201;
    this.pgClient = null;
    this.qdrantClient = null;
    this.server = null;
    this.isConnected = false;
    this.memoryStore = new Map();
    this.healthStatus = 'starting';
  }

  async initialize() {
    try {
      console.log('🧠 Initializing Memory MCP Server...');
      
      // Initialize PostgreSQL connection
      await this.initializePostgreSQL();
      
      // Initialize Qdrant connection (simplified for now)
      await this.initializeQdrant();
      
      // Create HTTP server
      this.createHTTPServer();
      
      this.healthStatus = 'healthy';
      this.isConnected = true;
      
      console.log(`✅ Memory MCP Server initialized on port ${this.port}`);
    } catch (error) {
      console.error('❌ Failed to initialize Memory MCP Server:', error);
      this.healthStatus = 'unhealthy';
      throw error;
    }
  }

  async initializePostgreSQL() {
    try {
      this.pgClient = new Client({
        host: process.env.POSTGRES_HOST || 'claude-mcp-postgres',
        port: process.env.POSTGRES_PORT || 5432,
        database: process.env.POSTGRES_DB || 'mcp_enhanced',
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'postgres'
      });

      await this.pgClient.connect();
      
      // Test connection
      const result = await this.pgClient.query('SELECT NOW()');
      console.log('📊 PostgreSQL connected:', result.rows[0]);
      
      // Ensure memory tables exist
      await this.ensureMemoryTables();
      
    } catch (error) {
      console.error('❌ PostgreSQL connection failed:', error);
      throw error;
    }
  }

  async ensureMemoryTables() {
    // Check if the table exists and has the expected structure
    const checkTableQuery = `
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'mcp_memories' AND table_schema = 'public'
      ORDER BY ordinal_position;
    `;
    
    try {
      const result = await this.pgClient.query(checkTableQuery);
      if (result.rows.length > 0) {
        console.log('📝 Using existing mcp_memories table with columns:', result.rows.map(r => r.column_name).join(', '));
        this.useExistingSchema = true;
      } else {
        console.log('📝 Creating new mcp_memories table...');
        await this.createMemoryTable();
        this.useExistingSchema = false;
      }
    } catch (error) {
      console.error('❌ Error checking memory table:', error);
      throw error;
    }
  }

  async createMemoryTable() {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS mcp_memories (
        id SERIAL PRIMARY KEY,
        memory_id VARCHAR(255) UNIQUE NOT NULL,
        content TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        importance FLOAT DEFAULT 1.0,
        tags TEXT[] DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        accessed_count INTEGER DEFAULT 0,
        last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_mcp_memories_memory_id ON mcp_memories(memory_id);
      CREATE INDEX IF NOT EXISTS idx_mcp_memories_importance ON mcp_memories(importance);
      CREATE INDEX IF NOT EXISTS idx_mcp_memories_created_at ON mcp_memories(created_at);
      CREATE INDEX IF NOT EXISTS idx_mcp_memories_tags ON mcp_memories USING GIN(tags);
      CREATE INDEX IF NOT EXISTS idx_mcp_memories_metadata ON mcp_memories USING GIN(metadata);
    `;

    await this.pgClient.query(createTableQuery);
    console.log('📝 Memory tables created');
  }

  async initializeQdrant() {
    // Simplified Qdrant initialization - can be enhanced later
    this.qdrantClient = {
      connected: false,
      search: async (query) => ({ results: [] }),
      upsert: async (data) => ({ success: true })
    };
    
    console.log('🔍 Qdrant client initialized (simplified)');
  }

  createHTTPServer() {
    this.server = http.createServer(async (req, res) => {
      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      try {
        await this.handleRequest(req, res);
      } catch (error) {
        console.error('Request handling error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: 'Internal server error', 
          details: error.message 
        }));
      }
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

    // Memory operations
    if (path === '/memory' && method === 'post') {
      return this.handleAddMemory(req, res);
    }

    if (path === '/memory/search' && method === 'post') {
      return this.handleSearchMemory(req, res);
    }

    if (path === '/memory/list' && method === 'get') {
      return this.handleListMemories(req, res);
    }

    if (path.startsWith('/memory/') && method === 'get') {
      const memoryId = path.split('/')[2];
      return this.handleGetMemory(req, res, memoryId);
    }

    if (path.startsWith('/memory/') && method === 'delete') {
      const memoryId = path.split('/')[2];
      return this.handleDeleteMemory(req, res, memoryId);
    }

    // MCP protocol endpoint
    if (path === '/mcp' && method === 'post') {
      return this.handleMCPRequest(req, res);
    }

    // Default 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  async handleHealth(req, res) {
    const health = {
      status: this.healthStatus,
      timestamp: new Date().toISOString(),
      service: 'memory-mcp',
      version: '1.0.0',
      connections: {
        postgresql: this.pgClient ? 'connected' : 'disconnected',
        qdrant: this.qdrantClient?.connected ? 'connected' : 'simplified'
      },
      metrics: {
        memoriesStored: this.memoryStore.size,
        uptime: process.uptime()
      }
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health));
  }

  async handleAddMemory(req, res) {
    const body = await this.readRequestBody(req);
    const { content, context = {}, importance = 1.0, tags = [] } = JSON.parse(body);

    if (!content) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Content is required' }));
      return;
    }

    try {
      // Generate a UUID-compatible memory ID or use the database default
      const memoryId = null; // Let PostgreSQL generate the UUID
      
      // Store in PostgreSQL (use correct column name based on schema)
      const contextColumn = this.useExistingSchema ? 'metadata' : 'metadata';
      const query = `
        INSERT INTO mcp_memories (content, ${contextColumn}, importance, tags)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;
      
      const result = await this.pgClient.query(query, [
        content,
        JSON.stringify(context),
        importance,
        tags
      ]);

      const memory = result.rows[0];
      const actualMemoryId = memory.memory_id;

      // Also store in local cache
      this.memoryStore.set(actualMemoryId, {
        id: actualMemoryId,
        content,
        context,
        importance,
        tags,
        created_at: new Date(),
        accessed_count: 0
      });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        memory_id: actualMemoryId,
        memory: {
          id: memory.memory_id,
          content: memory.content,
          context: memory.context,
          importance: memory.importance,
          tags: memory.tags,
          created_at: memory.created_at
        }
      }));

    } catch (error) {
      console.error('Error adding memory:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to add memory', details: error.message }));
    }
  }

  async handleSearchMemory(req, res) {
    const body = await this.readRequestBody(req);
    const { query, limit = 10, importance_threshold = 0.1 } = JSON.parse(body);

    if (!query) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Query is required' }));
      return;
    }

    try {
      // Simple text search in PostgreSQL (can be enhanced with vector search)
      const searchQuery = `
        SELECT memory_id, content, context, importance, tags, created_at, accessed_count
        FROM mcp_memories
        WHERE (
          content ILIKE $1 
          OR EXISTS (
            SELECT 1 FROM unnest(tags) AS tag WHERE tag ILIKE $1
          )
        )
        AND importance >= $2
        ORDER BY importance DESC, created_at DESC
        LIMIT $3
      `;

      const searchTerm = `%${query}%`;
      const result = await this.pgClient.query(searchQuery, [searchTerm, importance_threshold, limit]);

      // Update access counts
      if (result.rows.length > 0) {
        const memoryIds = result.rows.map(row => row.memory_id);
        await this.pgClient.query(`
          UPDATE mcp_memories 
          SET accessed_count = accessed_count + 1, last_accessed = CURRENT_TIMESTAMP
          WHERE memory_id = ANY($1)
        `, [memoryIds]);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        query,
        results: result.rows.map(row => ({
          id: row.memory_id,
          content: row.content,
          context: row.context,
          importance: row.importance,
          tags: row.tags,
          created_at: row.created_at,
          accessed_count: row.accessed_count,
          relevance: 0.85 // Simplified relevance score
        }))
      }));

    } catch (error) {
      console.error('Error searching memory:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to search memory', details: error.message }));
    }
  }

  async handleListMemories(req, res) {
    try {
      const listQuery = `
        SELECT memory_id, content, context, importance, tags, created_at, accessed_count
        FROM mcp_memories
        ORDER BY importance DESC, created_at DESC
        LIMIT 50
      `;

      const result = await this.pgClient.query(listQuery);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        total: result.rows.length,
        memories: result.rows.map(row => ({
          id: row.memory_id,
          content: row.content.substring(0, 200) + (row.content.length > 200 ? '...' : ''),
          context: row.context,
          importance: row.importance,
          tags: row.tags,
          created_at: row.created_at,
          accessed_count: row.accessed_count
        }))
      }));

    } catch (error) {
      console.error('Error listing memories:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to list memories', details: error.message }));
    }
  }

  async handleGetMemory(req, res, memoryId) {
    try {
      const query = `
        SELECT memory_id, content, context, importance, tags, created_at, accessed_count, last_accessed
        FROM mcp_memories
        WHERE memory_id = $1
      `;

      const result = await this.pgClient.query(query, [memoryId]);

      if (result.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Memory not found' }));
        return;
      }

      const memory = result.rows[0];

      // Update access count
      await this.pgClient.query(`
        UPDATE mcp_memories 
        SET accessed_count = accessed_count + 1, last_accessed = CURRENT_TIMESTAMP
        WHERE memory_id = $1
      `, [memoryId]);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        memory: {
          id: memory.memory_id,
          content: memory.content,
          context: memory.context,
          importance: memory.importance,
          tags: memory.tags,
          created_at: memory.created_at,
          accessed_count: memory.accessed_count + 1,
          last_accessed: new Date()
        }
      }));

    } catch (error) {
      console.error('Error getting memory:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to get memory', details: error.message }));
    }
  }

  async handleDeleteMemory(req, res, memoryId) {
    try {
      const result = await this.pgClient.query(`
        DELETE FROM mcp_memories WHERE memory_id = $1 RETURNING memory_id
      `, [memoryId]);

      if (result.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Memory not found' }));
        return;
      }

      // Remove from local cache
      this.memoryStore.delete(memoryId);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Memory deleted successfully',
        memory_id: memoryId
      }));

    } catch (error) {
      console.error('Error deleting memory:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to delete memory', details: error.message }));
    }
  }

  async handleMCPRequest(req, res) {
    // Basic MCP protocol handler
    const body = await this.readRequestBody(req);
    const mcpRequest = JSON.parse(body);

    try {
      let response;

      switch (mcpRequest.method) {
        case 'tools/list':
          response = {
            tools: [
              {
                name: 'add_memory',
                description: 'Add a new memory to persistent storage',
                inputSchema: {
                  type: 'object',
                  properties: {
                    content: { type: 'string' },
                    context: { type: 'object' },
                    importance: { type: 'number' },
                    tags: { type: 'array' }
                  },
                  required: ['content']
                }
              },
              {
                name: 'search_memory',
                description: 'Search memories by content or tags',
                inputSchema: {
                  type: 'object',
                  properties: {
                    query: { type: 'string' },
                    limit: { type: 'number' },
                    importance_threshold: { type: 'number' }
                  },
                  required: ['query']
                }
              },
              {
                name: 'list_memories',
                description: 'List recent memories',
                inputSchema: {
                  type: 'object',
                  properties: {}
                }
              }
            ]
          };
          break;

        case 'tools/call':
          const { name, arguments: args } = mcpRequest.params;
          response = await this.handleToolCall(name, args);
          break;

        default:
          throw new Error(`Unknown MCP method: ${mcpRequest.method}`);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        id: mcpRequest.id,
        result: response
      }));

    } catch (error) {
      console.error('MCP request error:', error);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        id: mcpRequest.id,
        error: {
          code: -32603,
          message: error.message
        }
      }));
    }
  }

  async handleToolCall(toolName, args) {
    switch (toolName) {
      case 'add_memory':
        return await this.addMemoryTool(args);
      case 'search_memory':
        return await this.searchMemoryTool(args);
      case 'list_memories':
        return await this.listMemoriesTool(args);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  async addMemoryTool(args) {
    const { content, context = {}, importance = 1.0, tags = [] } = args;
    
    const memoryId = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const query = `
      INSERT INTO mcp_memories (memory_id, content, context, importance, tags)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const result = await this.pgClient.query(query, [
      memoryId,
      content,
      JSON.stringify(context),
      importance,
      tags
    ]);

    return {
      content: [{
        type: 'text',
        text: `Memory added successfully with ID: ${memoryId}`
      }]
    };
  }

  async searchMemoryTool(args) {
    const { query, limit = 10, importance_threshold = 0.1 } = args;
    
    const searchQuery = `
      SELECT memory_id, content, context, importance, tags, created_at
      FROM mcp_memories
      WHERE (
        content ILIKE $1 
        OR EXISTS (
          SELECT 1 FROM unnest(tags) AS tag WHERE tag ILIKE $1
        )
      )
      AND importance >= $2
      ORDER BY importance DESC, created_at DESC
      LIMIT $3
    `;

    const searchTerm = `%${query}%`;
    const result = await this.pgClient.query(searchQuery, [searchTerm, importance_threshold, limit]);

    const memories = result.rows.map(row => 
      `Memory ${row.memory_id}: ${row.content} (Importance: ${row.importance})`
    ).join('\n\n');

    return {
      content: [{
        type: 'text',
        text: `Found ${result.rows.length} memories:\n\n${memories}`
      }]
    };
  }

  async listMemoriesTool(args) {
    const result = await this.pgClient.query(`
      SELECT memory_id, content, importance, created_at
      FROM mcp_memories
      ORDER BY importance DESC, created_at DESC
      LIMIT 20
    `);

    const memories = result.rows.map(row => 
      `${row.memory_id}: ${row.content.substring(0, 100)}... (${row.importance})`
    ).join('\n');

    return {
      content: [{
        type: 'text',
        text: `Recent memories (${result.rows.length} total):\n\n${memories}`
      }]
    };
  }

  async readRequestBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  async start() {
    await this.initialize();
    
    this.server.listen(this.port, '0.0.0.0', () => {
      console.log(`🚀 Memory MCP Server listening on port ${this.port}`);
      console.log(`📊 Health check: http://localhost:${this.port}/health`);
      console.log(`💾 Memory API: http://localhost:${this.port}/memory`);
      console.log(`🔗 MCP Protocol: http://localhost:${this.port}/mcp`);
    });
  }

  async stop() {
    if (this.server) {
      this.server.close();
    }
    if (this.pgClient) {
      await this.pgClient.end();
    }
    console.log('🛑 Memory MCP Server stopped');
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const server = new MemoryMCPServer();
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });

  server.start().catch(error => {
    console.error('❌ Failed to start Memory MCP Server:', error);
    process.exit(1);
  });
}

module.exports = MemoryMCPServer;