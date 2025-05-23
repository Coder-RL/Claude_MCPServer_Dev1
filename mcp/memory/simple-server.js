#!/usr/bin/env node

/**
 * Simplified Memory MCP Server for testing
 * In-memory storage with MCP protocol support
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

class SimpleMemoryMCP {
  constructor() {
    this.memories = new Map();
    this.startTime = Date.now();
    this.server = new Server(
      {
        name: 'memory-simple',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    
    this.setupHandlers();
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
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
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'store_memory':
          return this.storeMemory(args);
        case 'retrieve_memory':
          return this.retrieveMemory(args);
        case 'list_memories':
          return this.listMemories();
        case 'delete_memory':
          return this.deleteMemory(args);
        case 'health_check':
          return this.healthCheck();
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
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

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Memory Simple MCP server started');
  }
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new SimpleMemoryMCP();
  server.start().catch(console.error);
}

export default SimpleMemoryMCP;