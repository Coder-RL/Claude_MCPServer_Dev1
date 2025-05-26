#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from 'fs/promises';
import * as path from 'path';

interface DataSource {
  id: string;
  name: string;
  type: 'file' | 'database' | 'api' | 'stream' | 'queue' | 'webhook';
  format: 'json' | 'csv' | 'parquet' | 'avro' | 'xml' | 'binary';
  status: 'active' | 'inactive' | 'error' | 'maintenance';
  lastAccessed?: Date;
}

interface DataPipeline {
  id: string;
  name: string;
  description: string;
  sourceIds: string[];
  transformations: any[];
  targetId: string;
  schedule?: string;
  status: 'draft' | 'active' | 'paused' | 'error';
  lastRun?: Date;
  nextRun?: Date;
  metrics: {
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    avgDuration: number;
  };
}

/**
 * Fixed Data Pipeline MCP Server
 * Based on official MCP patterns from Stack Overflow research
 */
class DataPipelineServerFixed {
  private server: Server;
  private sources = new Map<string, DataSource>();
  private pipelines = new Map<string, DataPipeline>();
  private configPath = path.join(process.cwd(), 'data', 'data-pipeline');

  constructor() {
    this.server = new Server(
      { name: 'data-pipeline-fixed', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );
    this.setupHandlers();
  }

  private setupHandlers() {
    // List tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'register_data_source',
            description: 'Register a new data source for pipeline processing',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Source name' },
                type: { type: 'string', enum: ['file', 'database', 'api', 'stream', 'queue', 'webhook'] },
                format: { type: 'string', enum: ['json', 'csv', 'parquet', 'avro', 'xml', 'binary'] },
                config: { type: 'object', description: 'Source configuration' }
              },
              required: ['name', 'type', 'format']
            }
          },
          {
            name: 'create_pipeline',
            description: 'Create a new data processing pipeline',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Pipeline name' },
                description: { type: 'string', description: 'Pipeline description' },
                sourceIds: { type: 'array', items: { type: 'string' }, description: 'Source IDs' },
                transformations: { type: 'array', description: 'Transformation steps' }
              },
              required: ['name', 'sourceIds']
            }
          },
          {
            name: 'execute_pipeline',
            description: 'Execute a data pipeline',
            inputSchema: {
              type: 'object',
              properties: {
                pipeline_id: { type: 'string', description: 'Pipeline ID to execute' }
              },
              required: ['pipeline_id']
            }
          },
          {
            name: 'get_pipeline_status',
            description: 'Get status and metrics for pipelines',
            inputSchema: {
              type: 'object',
              properties: {
                pipeline_id: { type: 'string', description: 'Pipeline ID (optional)' }
              }
            }
          }
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'register_data_source':
            return await this.registerDataSource(args);
          case 'create_pipeline':
            return await this.createPipeline(args);
          case 'execute_pipeline':
            return await this.executePipeline(args);
          case 'get_pipeline_status':
            return await this.getPipelineStatus(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    });
  }

  private async registerDataSource(args: any) {
    const { name, type, format, config = {} } = args;
    const id = `source_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const source: DataSource = {
      id,
      name,
      type,
      format,
      status: 'active',
      lastAccessed: new Date()
    };
    
    this.sources.set(id, source);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: 'Data source registered successfully',
          source_id: id,
          source: source
        }, null, 2)
      }]
    };
  }

  private async createPipeline(args: any) {
    const { name, description = '', sourceIds, transformations = [] } = args;
    const id = `pipeline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Validate source IDs exist
    for (const sourceId of sourceIds) {
      if (!this.sources.has(sourceId)) {
        throw new Error(`Source ID ${sourceId} not found`);
      }
    }
    
    const pipeline: DataPipeline = {
      id,
      name,
      description,
      sourceIds,
      transformations,
      targetId: `target_${id}`,
      status: 'draft',
      metrics: {
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        avgDuration: 0
      }
    };
    
    this.pipelines.set(id, pipeline);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: 'Pipeline created successfully',
          pipeline_id: id,
          pipeline: pipeline
        }, null, 2)
      }]
    };
  }

  private async executePipeline(args: any) {
    const { pipeline_id } = args;
    const pipeline = this.pipelines.get(pipeline_id);
    
    if (!pipeline) {
      throw new Error(`Pipeline ${pipeline_id} not found`);
    }
    
    // Simulate pipeline execution
    const startTime = Date.now();
    const success = Math.random() > 0.1; // 90% success rate
    const duration = Math.random() * 5000 + 1000; // 1-6 seconds
    
    // Update pipeline metrics
    pipeline.metrics.totalRuns++;
    if (success) {
      pipeline.metrics.successfulRuns++;
    } else {
      pipeline.metrics.failedRuns++;
    }
    pipeline.metrics.avgDuration = 
      (pipeline.metrics.avgDuration * (pipeline.metrics.totalRuns - 1) + duration) / pipeline.metrics.totalRuns;
    pipeline.lastRun = new Date();
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success,
          message: success ? 'Pipeline executed successfully' : 'Pipeline execution failed',
          pipeline_id,
          execution: {
            duration_ms: Math.round(duration),
            status: success ? 'completed' : 'failed',
            timestamp: new Date().toISOString(),
            metrics: pipeline.metrics
          }
        }, null, 2)
      }]
    };
  }

  private async getPipelineStatus(args: any) {
    const { pipeline_id } = args;
    
    if (pipeline_id) {
      const pipeline = this.pipelines.get(pipeline_id);
      if (!pipeline) {
        throw new Error(`Pipeline ${pipeline_id} not found`);
      }
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            pipeline_id,
            pipeline,
            sources: pipeline.sourceIds.map(id => this.sources.get(id)).filter(Boolean)
          }, null, 2)
        }]
      };
    } else {
      // Return all pipelines
      const allPipelines = Array.from(this.pipelines.values());
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            total_pipelines: allPipelines.length,
            total_sources: this.sources.size,
            pipelines: allPipelines,
            summary: {
              active: allPipelines.filter(p => p.status === 'active').length,
              draft: allPipelines.filter(p => p.status === 'draft').length,
              paused: allPipelines.filter(p => p.status === 'paused').length,
              error: allPipelines.filter(p => p.status === 'error').length
            }
          }, null, 2)
        }]
      };
    }
  }

  async start() {
    // Initialize (ensure directory exists, load data)
    await this.initialize();
    
    // Start MCP server
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Data Pipeline MCP Server (Fixed) running on stdio");
  }

  private async initialize() {
    try {
      await fs.mkdir(this.configPath, { recursive: true });
    } catch {
      // Directory already exists
    }
  }
}

// Start the server
const server = new DataPipelineServerFixed();
server.start().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});