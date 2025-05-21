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

export abstract class BaseMCPServer {
  protected server: Server;
  protected tools: Map<string, MCPTool> = new Map();
  protected name: string;
  protected description: string;

  constructor(name: string, description: string) {
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

  protected addTool(tool: MCPTool): void {
    this.tools.set(tool.name, tool);
  }

  private setupBaseHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = Array.from(this.tools.values()).map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));

      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (!this.tools.has(name)) {
        throw new Error(`Tool ${name} not found`);
      }

      try {
        const result = await this.handleRequest(name, args);
        
        return {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
            },
          ],
        } as CallToolResult;
      } catch (error) {
        throw new Error(`Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  abstract handleRequest(method: string, params: any): Promise<any>;

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`${this.name} MCP server started`);
  }

  // Utility methods for common operations
  protected generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  protected validateRequired(params: any, required: string[]): void {
    for (const field of required) {
      if (!(field in params) || params[field] === undefined || params[field] === null) {
        throw new Error(`Required parameter '${field}' is missing`);
      }
    }
  }

  protected logOperation(operation: string, params: any, result?: any): void {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ${this.name}: ${operation}`, {
      params: Object.keys(params),
      success: result !== undefined
    });
  }

  protected calculateMetrics(data: number[]): { mean: number; std: number; min: number; max: number } {
    if (data.length === 0) return { mean: 0, std: 0, min: 0, max: 0 };
    
    const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
    const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
    const std = Math.sqrt(variance);
    
    return {
      mean,
      std,
      min: Math.min(...data),
      max: Math.max(...data)
    };
  }

  protected formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  protected formatDuration(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}