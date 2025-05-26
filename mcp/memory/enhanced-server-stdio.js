#!/usr/bin/env node

/**
 * Enhanced Memory MCP Server - STDIO Version
 * Provides persistent memory capabilities using PostgreSQL + Qdrant vector search
 * STDIO-based implementation for Claude Code compatibility
 */

import { Client } from 'pg';

class EnhancedMemoryMCPServer {
  constructor() {
    this.pgClient = null;
    this.isConnected = false;
    this.memoryStore = new Map();
    this.healthStatus = 'starting';
    this.messageId = 0;
  }

  async initialize() {
    try {
      console.error('🧠 Enhanced Memory MCP Server (STDIO) starting...');
      
      // Initialize PostgreSQL connection
      await this.initializePostgreSQL();
      
      this.healthStatus = 'healthy';
      this.isConnected = true;
      
      console.error('✅ Enhanced Memory MCP Server (STDIO) running on stdio');
      
      // Start listening for MCP messages on stdin
      this.startMCPListener();
      
    } catch (error) {
      console.error('❌ Failed to initialize Enhanced Memory MCP Server:', error);
      this.healthStatus = 'unhealthy';
      process.exit(1);
    }
  }

  async initializePostgreSQL() {
    try {
      this.pgClient = new Client({
        host: process.env.POSTGRES_HOST || 'localhost',
        database: process.env.POSTGRES_DB || 'mcp_enhanced',
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'postgres',
        port: 5432,
      });

      await this.pgClient.connect();
      
      // Test connection
      const result = await this.pgClient.query('SELECT NOW()');
      console.error('📊 PostgreSQL connected:', result.rows[0]);

      // Ensure mcp_memories table exists
      await this.ensureMemoryTable();

    } catch (error) {
      console.error('❌ PostgreSQL connection failed:', error.message);
      // Continue without PostgreSQL for now
      this.pgClient = null;
    }
  }

  async ensureMemoryTable() {
    try {
      await this.pgClient.query(`
        CREATE TABLE IF NOT EXISTS mcp_memories (
          id SERIAL PRIMARY KEY,
          memory_id VARCHAR(255) UNIQUE NOT NULL,
          content TEXT NOT NULL,
          metadata JSONB DEFAULT '{}',
          tags TEXT[] DEFAULT '{}',
          importance INTEGER DEFAULT 5,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.error('📝 Memory table ensured');
    } catch (error) {
      console.error('❌ Failed to create memory table:', error);
    }
  }

  startMCPListener() {
    process.stdin.setEncoding('utf8');
    
    let buffer = '';
    
    process.stdin.on('data', (chunk) => {
      buffer += chunk;
      
      // Process complete JSON messages
      let lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer
      
      for (let line of lines) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line);
            this.handleMCPMessage(message);
          } catch (error) {
            console.error('❌ Failed to parse message:', error);
          }
        }
      }
    });

    process.stdin.on('end', () => {
      this.cleanup();
    });
  }

  async handleMCPMessage(message) {
    try {
      const { method, params, id } = message;

      switch (method) {
        case 'initialize':
          this.sendResponse(id, {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: 'enhanced-memory-stdio',
              version: '1.0.0'
            }
          });
          break;

        case 'tools/list':
          this.sendResponse(id, {
            tools: [
              {
                name: 'store_enhanced_memory',
                description: 'Store enhanced memory with metadata and tags',
                inputSchema: {
                  type: 'object',
                  properties: {
                    key: { type: 'string' },
                    value: { type: 'string' },
                    metadata: { type: 'object' },
                    tags: { type: 'array', items: { type: 'string' } },
                    importance: { type: 'number', minimum: 1, maximum: 10 }
                  },
                  required: ['key', 'value']
                }
              },
              {
                name: 'retrieve_enhanced_memory',
                description: 'Retrieve enhanced memory by key',
                inputSchema: {
                  type: 'object',
                  properties: {
                    key: { type: 'string' }
                  },
                  required: ['key']
                }
              },
              {
                name: 'search_enhanced_memory',
                description: 'Search enhanced memories by content, tags, or metadata',
                inputSchema: {
                  type: 'object',
                  properties: {
                    query: { type: 'string' },
                    tags: { type: 'array', items: { type: 'string' } },
                    limit: { type: 'number', default: 10 }
                  }
                }
              },
              {
                name: 'list_enhanced_memories',
                description: 'List all enhanced memories with pagination',
                inputSchema: {
                  type: 'object',
                  properties: {
                    limit: { type: 'number', default: 20 },
                    offset: { type: 'number', default: 0 }
                  }
                }
              },
              {
                name: 'delete_enhanced_memory',
                description: 'Delete enhanced memory by key',
                inputSchema: {
                  type: 'object',
                  properties: {
                    key: { type: 'string' }
                  },
                  required: ['key']
                }
              },
              {
                name: 'enhanced_memory_health',
                description: 'Check enhanced memory server health',
                inputSchema: {
                  type: 'object',
                  properties: {}
                }
              }
            ]
          });
          break;

        case 'tools/call':
          await this.handleToolCall(id, params);
          break;

        default:
          this.sendError(id, -32601, `Method not found: ${method}`);
      }
    } catch (error) {
      console.error('❌ Error handling MCP message:', error);
      this.sendError(message.id, -32603, 'Internal error');
    }
  }

  async handleToolCall(id, params) {
    const { name, arguments: args } = params;

    try {
      switch (name) {
        case 'store_enhanced_memory':
          const result = await this.storeMemory(args.key, args.value, args.metadata, args.tags, args.importance);
          this.sendResponse(id, { content: [{ type: 'text', text: result }] });
          break;

        case 'retrieve_enhanced_memory':
          const memory = await this.retrieveMemory(args.key);
          this.sendResponse(id, { content: [{ type: 'text', text: JSON.stringify(memory, null, 2) }] });
          break;

        case 'search_enhanced_memory':
          const searchResults = await this.searchMemories(args.query, args.tags, args.limit);
          this.sendResponse(id, { content: [{ type: 'text', text: JSON.stringify(searchResults, null, 2) }] });
          break;

        case 'list_enhanced_memories':
          const list = await this.listMemories(args.limit, args.offset);
          this.sendResponse(id, { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] });
          break;

        case 'delete_enhanced_memory':
          const deleteResult = await this.deleteMemory(args.key);
          this.sendResponse(id, { content: [{ type: 'text', text: deleteResult }] });
          break;

        case 'enhanced_memory_health':
          const health = this.getHealth();
          this.sendResponse(id, { content: [{ type: 'text', text: JSON.stringify(health, null, 2) }] });
          break;

        default:
          this.sendError(id, -32601, `Tool not found: ${name}`);
      }
    } catch (error) {
      console.error(`❌ Error in tool ${name}:`, error);
      this.sendError(id, -32603, `Tool execution failed: ${error.message}`);
    }
  }

  async storeMemory(key, value, metadata = {}, tags = [], importance = 5) {
    if (this.pgClient) {
      try {
        await this.pgClient.query(
          `INSERT INTO mcp_memories (memory_id, content, metadata, tags, importance, updated_at) 
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
           ON CONFLICT (memory_id) 
           DO UPDATE SET content = $2, metadata = $3, tags = $4, importance = $5, updated_at = CURRENT_TIMESTAMP`,
          [key, value, JSON.stringify(metadata), tags, importance]
        );
        return `Enhanced memory stored successfully in PostgreSQL: ${key}`;
      } catch (error) {
        console.error('❌ PostgreSQL storage failed:', error);
        // Fallback to in-memory
      }
    }

    // Fallback to in-memory storage
    this.memoryStore.set(key, {
      value,
      metadata,
      tags,
      importance,
      created: new Date().toISOString(),
      updated: new Date().toISOString()
    });
    return `Enhanced memory stored successfully in memory: ${key}`;
  }

  async retrieveMemory(key) {
    if (this.pgClient) {
      try {
        const result = await this.pgClient.query(
          'SELECT * FROM mcp_memories WHERE memory_id = $1',
          [key]
        );
        if (result.rows.length > 0) {
          const row = result.rows[0];
          return {
            key: row.memory_id,
            value: row.content,
            metadata: row.metadata,
            tags: row.tags,
            importance: row.importance,
            created: row.created_at,
            updated: row.updated_at
          };
        }
      } catch (error) {
        console.error('❌ PostgreSQL retrieval failed:', error);
      }
    }

    // Fallback to in-memory
    const memory = this.memoryStore.get(key);
    return memory ? { key, ...memory } : null;
  }

  async searchMemories(query, tags = [], limit = 10) {
    if (this.pgClient) {
      try {
        let sql = 'SELECT * FROM mcp_memories WHERE 1=1';
        const params = [];
        let paramCount = 0;

        if (query) {
          paramCount++;
          sql += ` AND content ILIKE $${paramCount}`;
          params.push(`%${query}%`);
        }

        if (tags && tags.length > 0) {
          paramCount++;
          sql += ` AND tags && $${paramCount}`;
          params.push(tags);
        }

        sql += ` ORDER BY importance DESC, updated_at DESC LIMIT $${paramCount + 1}`;
        params.push(limit);

        const result = await this.pgClient.query(sql, params);
        return result.rows.map(row => ({
          key: row.memory_id,
          value: row.content,
          metadata: row.metadata,
          tags: row.tags,
          importance: row.importance,
          created: row.created_at,
          updated: row.updated_at
        }));
      } catch (error) {
        console.error('❌ PostgreSQL search failed:', error);
      }
    }

    // Fallback to in-memory search
    const results = [];
    for (const [key, memory] of this.memoryStore.entries()) {
      if (query && !memory.value.toLowerCase().includes(query.toLowerCase())) continue;
      if (tags.length > 0 && !tags.some(tag => memory.tags.includes(tag))) continue;
      results.push({ key, ...memory });
    }
    return results.slice(0, limit);
  }

  async listMemories(limit = 20, offset = 0) {
    if (this.pgClient) {
      try {
        const result = await this.pgClient.query(
          'SELECT memory_id, importance, created_at, updated_at FROM mcp_memories ORDER BY updated_at DESC LIMIT $1 OFFSET $2',
          [limit, offset]
        );
        const countResult = await this.pgClient.query('SELECT COUNT(*) FROM mcp_memories');
        return {
          total: parseInt(countResult.rows[0].count),
          limit,
          offset,
          memories: result.rows.map(row => ({
            key: row.memory_id,
            importance: row.importance,
            created: row.created_at,
            updated: row.updated_at
          }))
        };
      } catch (error) {
        console.error('❌ PostgreSQL list failed:', error);
      }
    }

    // Fallback to in-memory
    const memories = Array.from(this.memoryStore.entries()).map(([key, memory]) => ({
      key,
      importance: memory.importance || 5,
      created: memory.created,
      updated: memory.updated
    }));
    
    return {
      total: memories.length,
      limit,
      offset,
      memories: memories.slice(offset, offset + limit)
    };
  }

  async deleteMemory(key) {
    if (this.pgClient) {
      try {
        const result = await this.pgClient.query(
          'DELETE FROM mcp_memories WHERE memory_id = $1',
          [key]
        );
        if (result.rowCount > 0) {
          return `Enhanced memory deleted from PostgreSQL: ${key}`;
        }
      } catch (error) {
        console.error('❌ PostgreSQL deletion failed:', error);
      }
    }

    // Fallback to in-memory
    if (this.memoryStore.delete(key)) {
      return `Enhanced memory deleted from memory: ${key}`;
    }
    return `Enhanced memory not found: ${key}`;
  }

  getHealth() {
    return {
      status: this.healthStatus,
      service: 'enhanced-memory-stdio',
      version: '1.0.0',
      postgresql: this.pgClient ? 'connected' : 'disconnected',
      memoryCount: this.memoryStore.size,
      timestamp: new Date().toISOString()
    };
  }

  sendResponse(id, result) {
    const response = {
      jsonrpc: '2.0',
      id,
      result
    };
    process.stdout.write(JSON.stringify(response) + '\n');
  }

  sendError(id, code, message) {
    const response = {
      jsonrpc: '2.0',
      id,
      error: { code, message }
    };
    process.stdout.write(JSON.stringify(response) + '\n');
  }

  async cleanup() {
    if (this.pgClient) {
      await this.pgClient.end();
    }
    process.exit(0);
  }
}

// Start the server
const server = new EnhancedMemoryMCPServer();
server.initialize().catch(error => {
  console.error('❌ Failed to start Enhanced Memory MCP Server:', error);
  process.exit(1);
});