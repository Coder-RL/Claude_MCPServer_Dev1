#!/usr/bin/env node

const fs = require('fs').promises;

// Fix servers that need proper StandardMCPServer conversion
async function convertVisualizationServer() {
  const filePath = 'servers/visualization-insights/src/index.ts';
  
  const newContent = `import { StandardMCPServer, MCPTool } from '../../shared/standard-mcp-server';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createLogger } from '../../shared/src/logging.js';
import { HealthChecker } from '../../shared/src/health.js';
import { VisualizationEngine, VisualizationConfig } from './visualization-engine.js';

const logger = createLogger('VisualizationInsightsServer');

export interface VisualizationServerConfig {
  name: string;
  version: string;
  host: string;
  port: number;
  maxConcurrentRenders: number;
  cacheSize: number;
  outputPath: string;
}

export class VisualizationInsightsServer extends StandardMCPServer {
  private visualizationEngine?: VisualizationEngine;
  private healthChecker?: HealthChecker;

  constructor(private config: VisualizationServerConfig) {
    super('visualization-insights', 'Visualization and Insights Server');
  }

  private getVisualizationEngine(): VisualizationEngine {
    if (!this.visualizationEngine) {
      this.visualizationEngine = new VisualizationEngine();
    }
    return this.visualizationEngine;
  }

  async setupTools(): Promise<void> {
    this.registerTool({
      name: 'create_chart',
      description: 'Create a new data visualization chart',
      inputSchema: {
        type: 'object',
        properties: {
          type: { 
            type: 'string', 
            enum: ['bar', 'line', 'scatter', 'pie', 'heatmap', 'histogram', 'box', 'area']
          },
          data: { type: 'array', items: { type: 'object' } },
          config: { type: 'object' }
        },
        required: ['type', 'data']
      }
    });

    this.registerTool({
      name: 'get_chart',
      description: 'Get information about a created chart',
      inputSchema: {
        type: 'object',
        properties: {
          chartId: { type: 'string' }
        },
        required: ['chartId']
      }
    });

    this.registerTool({
      name: 'list_charts',
      description: 'List all created charts with optional status filter',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] }
        }
      }
    });
  }

  async handleToolCall(toolName: string, parameters: any): Promise<CallToolResult> {
    const engine = this.getVisualizationEngine();

    switch (toolName) {
      case 'create_chart':
        const result = await engine.createVisualization(parameters.type, parameters.data, parameters.config);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };

      case 'get_chart':
        const chart = await engine.getVisualization(parameters.chartId);
        return { content: [{ type: 'text', text: JSON.stringify(chart, null, 2) }] };

      case 'list_charts':
        const charts = await engine.listVisualizations(parameters.status);
        return { content: [{ type: 'text', text: JSON.stringify(charts, null, 2) }] };

      default:
        throw new Error(\`Unknown tool: \${toolName}\`);
    }
  }
}

export default VisualizationInsightsServer;`;

  await fs.writeFile(filePath, newContent);
  console.log('✅ Fixed visualization-insights server');
}

async function convertAIIntegrationServer() {
  const filePath = 'servers/ai-integration/src/index.ts';
  
  const newContent = `import { StandardMCPServer, MCPTool } from '../../shared/standard-mcp-server';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createLogger } from '../../shared/src/logging.js';
import { HealthChecker } from '../../shared/src/health.js';

const logger = createLogger('AIIntegrationServer');

export interface AIIntegrationConfig {
  name: string;
  version: string;
  host: string;
  port: number;
  modelStoragePath: string;
  experimentTrackingUrl?: string;
  computeResources: {
    maxCpuCores: number;
    maxMemoryGB: number;
    gpuEnabled: boolean;
  };
}

export class AIIntegrationServer extends StandardMCPServer {
  constructor(private config: AIIntegrationConfig) {
    super('ai-integration', 'AI Integration and Model Orchestration Server');
  }

  async setupTools(): Promise<void> {
    this.registerTool({
      name: 'create_model_pipeline',
      description: 'Create a multi-model pipeline for orchestrated AI workflows',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          models: { type: 'array' },
          workflow: { type: 'object' }
        },
        required: ['name', 'models', 'workflow']
      }
    });

    this.registerTool({
      name: 'execute_orchestration',
      description: 'Execute a model orchestration pipeline',
      inputSchema: {
        type: 'object',
        properties: {
          pipelineId: { type: 'string' },
          input: { type: 'object' }
        },
        required: ['pipelineId', 'input']
      }
    });

    this.registerTool({
      name: 'create_ensemble',
      description: 'Create an ensemble of multiple models',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          method: { type: 'string', enum: ['voting', 'stacking', 'bagging', 'boosting'] },
          models: { type: 'array' }
        },
        required: ['name', 'method', 'models']
      }
    });
  }

  async handleToolCall(toolName: string, parameters: any): Promise<CallToolResult> {
    switch (toolName) {
      case 'create_model_pipeline':
        const pipelineResult = {
          pipelineId: \`pipeline_\${Date.now()}\`,
          name: parameters.name,
          models: parameters.models,
          status: 'created'
        };
        return { content: [{ type: 'text', text: JSON.stringify(pipelineResult, null, 2) }] };

      case 'execute_orchestration':
        const executionResult = {
          pipelineId: parameters.pipelineId,
          status: 'completed',
          result: 'Mock execution result'
        };
        return { content: [{ type: 'text', text: JSON.stringify(executionResult, null, 2) }] };

      case 'create_ensemble':
        const ensembleResult = {
          ensembleId: \`ensemble_\${Date.now()}\`,
          name: parameters.name,
          method: parameters.method,
          status: 'created'
        };
        return { content: [{ type: 'text', text: JSON.stringify(ensembleResult, null, 2) }] };

      default:
        throw new Error(\`Unknown tool: \${toolName}\`);
    }
  }
}

export default AIIntegrationServer;`;

  await fs.writeFile(filePath, newContent);
  console.log('✅ Fixed ai-integration server');
}

async function main() {
  console.log('🔧 Properly converting servers to StandardMCP format...');
  
  await convertVisualizationServer();
  await convertAIIntegrationServer();
  
  console.log('✅ Server conversion completed');
}

main().catch(console.error);