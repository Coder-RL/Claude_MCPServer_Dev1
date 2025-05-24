import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import * as http from 'http';

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
  protected httpServer!: http.Server;
  protected port: number;

  constructor(nameOrConfig: string | {name: string, port?: number, host?: string}, description?: string) {
    if (typeof nameOrConfig === 'string') {
      // Old style constructor: (name, description)
      this.name = nameOrConfig;
      this.description = description || '';
      this.port = this.getPortFromEnvironment();
    } else {
      // New style constructor: ({name, port, host})
      this.name = nameOrConfig.name;
      this.description = ''; // Description not provided in config style
      this.port = nameOrConfig.port || this.getPortFromEnvironment();
    }
    
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
    this.setupHttpServer();
  }

  private getPortFromEnvironment(): number {
    // Try to get port from specific environment variable first
    const envPort = process.env.PORT;
    if (envPort && !isNaN(parseInt(envPort))) {
      return parseInt(envPort);
    }

    // Map server names to their expected environment variables and default ports
    const portMappings: Record<string, { env: string; default: number }> = {
      'data-pipeline-server': { env: 'DATA_PIPELINE_PORT', default: 3011 },
      'realtime-analytics-server': { env: 'REALTIME_ANALYTICS_PORT', default: 3012 },
      'data-warehouse-server': { env: 'DATA_WAREHOUSE_PORT', default: 3013 },
      'ml-deployment-server': { env: 'ML_DEPLOYMENT_PORT', default: 3014 },
      'data-governance-server': { env: 'DATA_GOVERNANCE_PORT', default: 3015 },
      'security-vulnerability-server': { env: 'SECURITY_VULNERABILITY_PORT', default: 3016 },
      'ui-design-server': { env: 'UI_DESIGN_PORT', default: 3017 },
      'optimization-server': { env: 'OPTIMIZATION_PORT', default: 3018 }
    };

    const mapping = portMappings[this.name];
    if (mapping) {
      const envValue = process.env[mapping.env];
      if (envValue && !isNaN(parseInt(envValue))) {
        return parseInt(envValue);
      }
      return mapping.default;
    }

    // Default fallback
    return 8000;
  }

  private setupHttpServer(): void {
    this.httpServer = http.createServer(async (req, res) => {
      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Parse URL
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      const path = url.pathname;

      try {
        // Health check endpoint
        if (path === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'healthy', name: this.name }));
          return;
        }

        // List tools endpoint
        if (path === '/tools') {
          const tools = Array.from(this.tools.values()).map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema
          }));

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ tools }));
          return;
        }

        // Call tool endpoint
        if (path.startsWith('/tools/') && req.method === 'POST') {
          const toolName = path.substring('/tools/'.length);

          if (!this.tools.has(toolName)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: `Tool ${toolName} not found`
            }));
            return;
          }

          // Parse request body
          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });

          req.on('end', async () => {
            try {
              const params = body ? JSON.parse(body) : {};
              const result = await this.handleRequest(toolName, params);

              // Ensure result has success field
              if (result && typeof result === 'object' && !('success' in result)) {
                result.success = true;
              }

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(result));
            } catch (error) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: false,
                error: `Error executing ${toolName}: ${error instanceof Error ? error.message : String(error)}`
              }));
            }
          });

          return;
        }

        // Not found
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'Not found'
        }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: `Server error: ${error instanceof Error ? error.message : String(error)}`
        }));
      }
    });
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
    // Get port from environment variable or use default
    this.port = parseInt(process.env.PORT || '8000', 10);

    // Start HTTP server
    this.httpServer.listen(this.port, () => {
      console.error(`${this.name} HTTP server listening on port ${this.port}`);
    });

    // Start MCP server
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`${this.name} MCP server started`);
  }

  // Utility methods for common operations
  protected generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
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