import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

/**
 * StandardMCPServer - Pure STDIO MCP Server Implementation
 * 
 * This replaces BaseMCPServer to provide MCP protocol compliance.
 * Key differences:
 * - Pure STDIO transport only (no HTTP server)
 * - No port binding or HTTP endpoints
 * - Designed for Claude Desktop/Code integration
 */
export abstract class StandardMCPServer {
  protected server: Server;
  protected tools: Map<string, MCPTool> = new Map();
  protected name: string;
  protected description: string;

  constructor(name: string, description: string = '') {
    this.name = name;
    this.description = description;
    
    this.server = new Server(
      {
        name: this.name,
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupBaseHandlers();
  }

  private setupBaseHandlers(): void {
    // Handle tool listing
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = Array.from(this.tools.values()).map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));
      
      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      if (!this.tools.has(name)) {
        throw new Error(`Tool ${name} not found`);
      }

      try {
        return await this.handleToolCall(name, args || {});
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Tool ${name} failed: ${errorMessage}`);
      }
    });
  }

  protected registerTool(tool: MCPTool): void {
    this.tools.set(tool.name, tool);
  }

  // Abstract methods that concrete servers must implement
  abstract setupTools(): Promise<void>;
  abstract handleToolCall(name: string, args: any): Promise<CallToolResult>;

  /**
   * Start the MCP server with pure STDIO transport
   * This is the only communication method - no HTTP server
   */
  async start(): Promise<void> {
    // Setup tools first
    await this.setupTools();

    // Create STDIO transport - this is how Claude communicates with us
    const transport = new StdioServerTransport();
    
    // Connect to transport - server now communicates via stdin/stdout
    await this.server.connect(transport);
    
    // Server is now running and waiting for STDIO communication
    // No HTTP server, no port binding - pure MCP protocol compliance
  }

  /**
   * Get server information for debugging/logging
   */
  getInfo(): { name: string; description: string; toolCount: number } {
    return {
      name: this.name,
      description: this.description,
      toolCount: this.tools.size
    };
  }
}