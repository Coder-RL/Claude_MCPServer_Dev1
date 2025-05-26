#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

interface AnalyticsStream {
  id: string;
  name: string;
  description: string;
  source: string;
  metrics: string[];
  windowSize: number; // in seconds
  status: 'active' | 'paused' | 'error';
  createdAt: Date;
  lastUpdate?: Date;
  dataPoints: number;
}

interface Dashboard {
  id: string;
  name: string;
  streamIds: string[];
  widgets: any[];
  layout: any;
  refreshRate: number; // in seconds
}

/**
 * Fixed uLudata ugovernance MCP Server
 * Based on official MCP patterns from Stack Overflow research
 */
class RealtimeAnalyticsServerFixed {
  private server: Server;
  private streams = new Map<string, AnalyticsStream>();
  private dashboards = new Map<string, Dashboard>();

  constructor() {
    this.server = new Server(
      { name: 'data-governance-fixed', version: '1.0.0' },
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
            name: 'create_stream',
            description: 'Create a new realtime analytics stream',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Stream name' },
                description: { type: 'string', description: 'Stream description' },
                source: { type: 'string', description: 'Data source' },
                metrics: { type: 'array', items: { type: 'string' }, description: 'Metrics to track' },
                windowSize: { type: 'number', description: 'Window size in seconds', default: 60 }
              },
              required: ['name', 'source', 'metrics']
            }
          },
          {
            name: 'start_stream',
            description: 'Start a realtime analytics stream',
            inputSchema: {
              type: 'object',
              properties: {
                stream_id: { type: 'string', description: 'Stream ID to start' }
              },
              required: ['stream_id']
            }
          },
          {
            name: 'stop_stream',
            description: 'Stop a realtime analytics stream',
            inputSchema: {
              type: 'object',
              properties: {
                stream_id: { type: 'string', description: 'Stream ID to stop' }
              },
              required: ['stream_id']
            }
          },
          {
            name: 'get_stream_metrics',
            description: 'Get current metrics from a stream',
            inputSchema: {
              type: 'object',
              properties: {
                stream_id: { type: 'string', description: 'Stream ID' },
                timeRange: { type: 'number', description: 'Time range in seconds', default: 300 }
              },
              required: ['stream_id']
            }
          },
          {
            name: 'create_dashboard',
            description: 'Create a new analytics dashboard',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Dashboard name' },
                streamIds: { type: 'array', items: { type: 'string' }, description: 'Stream IDs to include' },
                refreshRate: { type: 'number', description: 'Refresh rate in seconds', default: 5 }
              },
              required: ['name', 'streamIds']
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
          case 'create_stream':
            return await this.createStream(args);
          case 'start_stream':
            return await this.startStream(args);
          case 'stop_stream':
            return await this.stopStream(args);
          case 'get_stream_metrics':
            return await this.getStreamMetrics(args);
          case 'create_dashboard':
            return await this.createDashboard(args);
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

  private async createStream(args: any) {
    const { name, description = '', source, metrics, windowSize = 60 } = args;
    const id = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const stream: AnalyticsStream = {
      id,
      name,
      description,
      source,
      metrics,
      windowSize,
      status: 'paused',
      createdAt: new Date(),
      dataPoints: 0
    };
    
    this.streams.set(id, stream);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: 'Realtime analytics stream created successfully',
          stream_id: id,
          stream: stream
        }, null, 2)
      }]
    };
  }

  private async startStream(args: any) {
    const { stream_id } = args;
    const stream = this.streams.get(stream_id);
    
    if (!stream) {
      throw new Error(`Stream ${stream_id} not found`);
    }
    
    stream.status = 'active';
    stream.lastUpdate = new Date();
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: 'Stream started successfully',
          stream_id,
          status: stream.status,
          metrics: stream.metrics,
          window_size: stream.windowSize
        }, null, 2)
      }]
    };
  }

  private async stopStream(args: any) {
    const { stream_id } = args;
    const stream = this.streams.get(stream_id);
    
    if (!stream) {
      throw new Error(`Stream ${stream_id} not found`);
    }
    
    stream.status = 'paused';
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: 'Stream stopped successfully',
          stream_id,
          status: stream.status
        }, null, 2)
      }]
    };
  }

  private async getStreamMetrics(args: any) {
    const { stream_id, timeRange = 300 } = args;
    const stream = this.streams.get(stream_id);
    
    if (!stream) {
      throw new Error(`Stream ${stream_id} not found`);
    }
    
    // Simulate realtime metrics
    const mockMetrics = stream.metrics.map(metric => ({
      name: metric,
      current_value: Math.random() * 100,
      avg_value: Math.random() * 80,
      min_value: Math.random() * 20,
      max_value: Math.random() * 120 + 80,
      trend: Math.random() > 0.5 ? 'up' : 'down',
      data_points: stream.dataPoints + Math.floor(Math.random() * 100)
    }));
    
    // Update stream data points
    stream.dataPoints += Math.floor(Math.random() * 50);
    stream.lastUpdate = new Date();
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          stream_id,
          stream_name: stream.name,
          status: stream.status,
          time_range_seconds: timeRange,
          window_size: stream.windowSize,
          last_update: stream.lastUpdate,
          metrics: mockMetrics,
          summary: {
            total_data_points: stream.dataPoints,
            active_metrics: stream.metrics.length,
            uptime: stream.status === 'active' ? 'running' : 'stopped'
          }
        }, null, 2)
      }]
    };
  }

  private async createDashboard(args: any) {
    const { name, streamIds, refreshRate = 5 } = args;
    const id = `dashboard_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Validate stream IDs
    for (const streamId of streamIds) {
      if (!this.streams.has(streamId)) {
        throw new Error(`Stream ID ${streamId} not found`);
      }
    }
    
    const dashboard: Dashboard = {
      id,
      name,
      streamIds,
      widgets: streamIds.map(streamId => ({
        type: 'metrics_chart',
        streamId,
        position: { x: 0, y: 0 },
        size: { width: 400, height: 300 }
      })),
      layout: { columns: 2, rows: Math.ceil(streamIds.length / 2) },
      refreshRate
    };
    
    this.dashboards.set(id, dashboard);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: 'Dashboard created successfully',
          dashboard_id: id,
          dashboard: dashboard,
          connected_streams: streamIds.length
        }, null, 2)
      }]
    };
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("uLudata ugovernance MCP Server (Fixed) running on stdio");
  }
}

// Start the server
const server = new RealtimeAnalyticsServerFixed();
server.start().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});