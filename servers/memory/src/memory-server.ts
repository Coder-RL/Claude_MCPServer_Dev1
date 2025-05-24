import { StandardMCPServer, MCPTool } from '../../shared/standard-mcp-server';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface Memory {
  id: string;
  content: string;
  timestamp: number;
  importance: number;
  tags: string[];
  metadata: Record<string, any>;
}

export class MemoryServer extends StandardMCPServer {
  private memories: Map<string, Memory> = new Map();
  private nextId = 1;

  constructor() {
    super('memory-server', 'Memory Management and Persistence Server');
  }

  async setupTools(): Promise<void> {
    this.registerTool({
      name: 'store_memory',
      description: 'Store a new memory or update an existing one',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Content to store in memory' },
          importance: { type: 'number', minimum: 1, maximum: 10, default: 5, description: 'Importance level (1-10)' },
          tags: { 
            type: 'array', 
            items: { type: 'string' },
            description: 'Tags to categorize the memory'
          },
          metadata: { 
            type: 'object',
            description: 'Additional metadata for the memory'
          }
        },
        required: ['content']
      }
    });

    this.registerTool({
      name: 'retrieve_memory',
      description: 'Retrieve a specific memory by ID',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Memory ID to retrieve' }
        },
        required: ['id']
      }
    });

    this.registerTool({
      name: 'search_memories',
      description: 'Search memories by content, tags, or metadata',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          tags: { 
            type: 'array', 
            items: { type: 'string' },
            description: 'Filter by tags'
          },
          minImportance: { type: 'number', minimum: 1, maximum: 10, description: 'Minimum importance level' },
          limit: { type: 'number', default: 10, description: 'Maximum number of results' }
        }
      }
    });

    this.registerTool({
      name: 'list_memories',
      description: 'List all memories with optional filtering',
      inputSchema: {
        type: 'object',
        properties: {
          sortBy: { 
            type: 'string', 
            enum: ['timestamp', 'importance', 'id'],
            default: 'timestamp',
            description: 'Sort order'
          },
          limit: { type: 'number', default: 10, description: 'Maximum number of results' }
        }
      }
    });

    this.registerTool({
      name: 'delete_memory',
      description: 'Delete a memory by ID',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Memory ID to delete' }
        },
        required: ['id']
      }
    });
  }

  async handleToolCall(name: string, args: any): Promise<CallToolResult> {
    switch (name) {
      case 'store_memory':
        return this.storeMemory(args);
      
      case 'retrieve_memory':
        return this.retrieveMemory(args);
      
      case 'search_memories':
        return this.searchMemories(args);
      
      case 'list_memories':
        return this.listMemories(args);
      
      case 'delete_memory':
        return this.deleteMemory(args);
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private async storeMemory(args: any): Promise<CallToolResult> {
    const id = `mem_${this.nextId++}`;
    const memory: Memory = {
      id,
      content: args.content,
      timestamp: Date.now(),
      importance: args.importance || 5,
      tags: args.tags || [],
      metadata: args.metadata || {}
    };

    this.memories.set(id, memory);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          memory: memory,
          message: `Memory stored with ID: ${id}`
        }, null, 2)
      }]
    };
  }

  private async retrieveMemory(args: any): Promise<CallToolResult> {
    const memory = this.memories.get(args.id);
    
    if (!memory) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: `Memory with ID ${args.id} not found`
          }, null, 2)
        }]
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          memory: memory
        }, null, 2)
      }]
    };
  }

  private async searchMemories(args: any): Promise<CallToolResult> {
    let results = Array.from(this.memories.values());

    // Filter by content query
    if (args.query) {
      const query = args.query.toLowerCase();
      results = results.filter(memory => 
        memory.content.toLowerCase().includes(query) ||
        memory.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Filter by tags
    if (args.tags && args.tags.length > 0) {
      results = results.filter(memory =>
        args.tags.some(tag => memory.tags.includes(tag))
      );
    }

    // Filter by minimum importance
    if (args.minImportance) {
      results = results.filter(memory => memory.importance >= args.minImportance);
    }

    // Sort by importance (desc) then timestamp (desc)
    results.sort((a, b) => {
      if (a.importance !== b.importance) {
        return b.importance - a.importance;
      }
      return b.timestamp - a.timestamp;
    });

    // Apply limit
    if (args.limit) {
      results = results.slice(0, args.limit);
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          results: results,
          count: results.length,
          query: args.query
        }, null, 2)
      }]
    };
  }

  private async listMemories(args: any): Promise<CallToolResult> {
    let results = Array.from(this.memories.values());

    // Sort
    const sortBy = args.sortBy || 'timestamp';
    switch (sortBy) {
      case 'timestamp':
        results.sort((a, b) => b.timestamp - a.timestamp);
        break;
      case 'importance':
        results.sort((a, b) => b.importance - a.importance);
        break;
      case 'id':
        results.sort((a, b) => a.id.localeCompare(b.id));
        break;
    }

    // Apply limit
    if (args.limit) {
      results = results.slice(0, args.limit);
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          memories: results,
          total: this.memories.size,
          returned: results.length
        }, null, 2)
      }]
    };
  }

  private async deleteMemory(args: any): Promise<CallToolResult> {
    const existed = this.memories.has(args.id);
    this.memories.delete(args.id);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          deleted: existed,
          message: existed 
            ? `Memory ${args.id} deleted successfully`
            : `Memory ${args.id} was not found`
        }, null, 2)
      }]
    };
  }
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new MemoryServer();
  server.start().catch(console.error);
}