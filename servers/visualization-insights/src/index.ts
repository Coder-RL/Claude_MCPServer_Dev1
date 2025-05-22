import { BaseMCPServer } from '../../shared/src/base-server.js';
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

export class VisualizationInsightsServer extends BaseMCPServer {
  private visualizationEngine: VisualizationEngine;
  private healthChecker: HealthChecker;

  constructor(private config: VisualizationServerConfig) {
    super();
    
    this.healthChecker = new HealthChecker('VisualizationInsightsServer');
    this.visualizationEngine = new VisualizationEngine();
    
    this.setupHealthChecks();
    this.registerMCPTools();
    
    logger.info('Visualization & Insights Server initialized', {
      version: config.version,
      port: config.port,
      outputPath: config.outputPath
    });
  }

  private setupHealthChecks(): void {
    this.healthChecker.addCheck('visualization-engine', async () => {
      const health = this.visualizationEngine.getHealthCheck();
      return {
        name: 'visualization-engine',
        status: health.status === 'healthy' ? 'pass' : 'fail',
        timestamp: new Date().toISOString(),
        details: health.details
      };
    });
  }

  private registerMCPTools(): void {
    // Core Visualization Tools
    this.addTool('create_chart', {
      description: 'Create a new data visualization chart',
      inputSchema: {
        type: 'object',
        properties: {
          type: { 
            type: 'string', 
            enum: ['bar', 'line', 'scatter', 'pie', 'heatmap', 'histogram', 'box', 'area']
          },
          data: { type: 'array', items: { type: 'object' } },
          config: {
            type: 'object',
            properties: {
              width: { type: 'number', default: 800 },
              height: { type: 'number', default: 400 },
              title: { type: 'string' },
              theme: { type: 'string', enum: ['light', 'dark', 'minimal'], default: 'light' },
              xAxis: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  field: { type: 'string' },
                  type: { type: 'string', enum: ['numeric', 'categorical', 'datetime'] }
                }
              },
              yAxis: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  field: { type: 'string' },
                  type: { type: 'string', enum: ['numeric', 'categorical', 'datetime'] }
                }
              },
              colors: { type: 'array', items: { type: 'string' } }
            }
          }
        },
        required: ['type', 'data']
      }
    }, async (args) => {
      return await this.visualizationEngine.createVisualization(args.type, args.data, args.config);
    });

    this.addTool('get_chart', {
      description: 'Get information about a created chart',
      inputSchema: {
        type: 'object',
        properties: {
          chartId: { type: 'string' }
        },
        required: ['chartId']
      }
    }, async (args) => {
      return await this.visualizationEngine.getVisualization(args.chartId);
    });

    this.addTool('list_charts', {
      description: 'List all created charts with optional status filter',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] }
        }
      }
    }, async (args) => {
      return await this.visualizationEngine.listVisualizations(args.status);
    });

    this.addTool('export_chart', {
      description: 'Export a chart in specified format',
      inputSchema: {
        type: 'object',
        properties: {
          chartId: { type: 'string' },
          format: { type: 'string', enum: ['png', 'svg', 'pdf'], default: 'png' }
        },
        required: ['chartId']
      }
    }, async (args) => {
      const buffer = await this.visualizationEngine.exportVisualization(args.chartId, args.format);
      return {
        chartId: args.chartId,
        format: args.format || 'png',
        size: buffer.length,
        data: buffer.toString('base64')
      };
    });

    // Template Management Tools
    this.addTool('create_template', {
      description: 'Create a reusable chart template',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string' },
          description: { type: 'string' },
          config: { type: 'object' },
          tags: { type: 'array', items: { type: 'string' } }
        },
        required: ['name', 'type', 'description', 'config']
      }
    }, async (args) => {
      return await this.visualizationEngine.createTemplate(
        args.name,
        args.type,
        args.description,
        args.config,
        args.tags
      );
    });

    this.addTool('get_template', {
      description: 'Get a chart template by ID',
      inputSchema: {
        type: 'object',
        properties: {
          templateId: { type: 'string' }
        },
        required: ['templateId']
      }
    }, async (args) => {
      return await this.visualizationEngine.getTemplate(args.templateId);
    });

    this.addTool('list_templates', {
      description: 'List available chart templates',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string' }
        }
      }
    }, async (args) => {
      return await this.visualizationEngine.listTemplates(args.type);
    });

    this.addTool('create_from_template', {
      description: 'Create a chart using an existing template',
      inputSchema: {
        type: 'object',
        properties: {
          templateId: { type: 'string' },
          data: { type: 'array', items: { type: 'object' } }
        },
        required: ['templateId', 'data']
      }
    }, async (args) => {
      return await this.visualizationEngine.createFromTemplate(args.templateId, args.data);
    });

    // Dashboard Tools
    this.addTool('create_dashboard', {
      description: 'Create a new dashboard for multiple charts',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          layout: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['grid', 'free'], default: 'grid' },
              columns: { type: 'number', default: 2 },
              rows: { type: 'number', default: 2 },
              gap: { type: 'number', default: 20 }
            }
          }
        },
        required: ['name']
      }
    }, async (args) => {
      return await this.visualizationEngine.createDashboard(args.name, args.description, args.layout);
    });

    this.addTool('add_chart_to_dashboard', {
      description: 'Add a chart to an existing dashboard',
      inputSchema: {
        type: 'object',
        properties: {
          dashboardId: { type: 'string' },
          chartId: { type: 'string' },
          position: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' }
            },
            required: ['x', 'y']
          },
          size: {
            type: 'object',
            properties: {
              width: { type: 'number' },
              height: { type: 'number' }
            },
            required: ['width', 'height']
          },
          title: { type: 'string' }
        },
        required: ['dashboardId', 'chartId', 'position', 'size']
      }
    }, async (args) => {
      await this.visualizationEngine.addChartToDashboard(
        args.dashboardId,
        args.chartId,
        args.position,
        args.size,
        args.title
      );
      return { success: true };
    });

    this.addTool('get_dashboard', {
      description: 'Get dashboard information',
      inputSchema: {
        type: 'object',
        properties: {
          dashboardId: { type: 'string' }
        },
        required: ['dashboardId']
      }
    }, async (args) => {
      return await this.visualizationEngine.getDashboard(args.dashboardId);
    });

    this.addTool('list_dashboards', {
      description: 'List all created dashboards',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    }, async (args) => {
      return await this.visualizationEngine.listDashboards();
    });

    // Insights and Analytics Tools
    this.addTool('generate_insights', {
      description: 'Generate AI-powered insights from data',
      inputSchema: {
        type: 'object',
        properties: {
          data: { type: 'array', items: { type: 'object' } },
          fields: { type: 'array', items: { type: 'string' } }
        },
        required: ['data']
      }
    }, async (args) => {
      return await this.visualizationEngine.generateInsights(args.data, args.fields);
    });

    this.addTool('suggest_chart_type', {
      description: 'Get AI suggestions for best chart type based on data',
      inputSchema: {
        type: 'object',
        properties: {
          data: { type: 'array', items: { type: 'object' } },
          analysisType: { 
            type: 'string', 
            enum: ['comparison', 'trend', 'distribution', 'correlation', 'composition'],
            default: 'comparison'
          }
        },
        required: ['data']
      }
    }, async (args) => {
      const suggestions = this.suggestChartTypes(args.data, args.analysisType);
      return { suggestions, data: args.data };
    });

    this.addTool('analyze_data_quality', {
      description: 'Analyze data quality and suggest improvements',
      inputSchema: {
        type: 'object',
        properties: {
          data: { type: 'array', items: { type: 'object' } }
        },
        required: ['data']
      }
    }, async (args) => {
      return this.analyzeDataQuality(args.data);
    });

    this.addTool('create_chart_series', {
      description: 'Create multiple related charts as a series',
      inputSchema: {
        type: 'object',
        properties: {
          data: { type: 'array', items: { type: 'object' } },
          seriesConfig: {
            type: 'object',
            properties: {
              groupBy: { type: 'string' },
              chartType: { type: 'string' },
              commonConfig: { type: 'object' }
            },
            required: ['groupBy', 'chartType']
          }
        },
        required: ['data', 'seriesConfig']
      }
    }, async (args) => {
      return await this.createChartSeries(args.data, args.seriesConfig);
    });

    logger.info('All MCP tools registered for Visualization & Insights Server', { totalTools: 16 });
  }

  private suggestChartTypes(data: any[], analysisType: string): any[] {
    const suggestions = [];
    const fields = Object.keys(data[0] || {});
    const numericFields = fields.filter(field => 
      data.every(row => typeof row[field] === 'number')
    );
    const categoricalFields = fields.filter(field => 
      !numericFields.includes(field)
    );

    switch (analysisType) {
      case 'comparison':
        if (categoricalFields.length > 0 && numericFields.length > 0) {
          suggestions.push({
            type: 'bar',
            confidence: 0.9,
            reason: 'Best for comparing values across categories',
            config: {
              xAxis: { field: categoricalFields[0], type: 'categorical' },
              yAxis: { field: numericFields[0], type: 'numeric' }
            }
          });
        }
        break;
        
      case 'trend':
        if (numericFields.length >= 2) {
          suggestions.push({
            type: 'line',
            confidence: 0.95,
            reason: 'Ideal for showing trends over time or continuous variables',
            config: {
              xAxis: { field: numericFields[0], type: 'numeric' },
              yAxis: { field: numericFields[1], type: 'numeric' }
            }
          });
        }
        break;
        
      case 'correlation':
        if (numericFields.length >= 2) {
          suggestions.push({
            type: 'scatter',
            confidence: 0.85,
            reason: 'Perfect for exploring relationships between variables',
            config: {
              xAxis: { field: numericFields[0], type: 'numeric' },
              yAxis: { field: numericFields[1], type: 'numeric' }
            }
          });
        }
        break;
        
      case 'composition':
        if (numericFields.length > 0) {
          suggestions.push({
            type: 'pie',
            confidence: 0.8,
            reason: 'Shows parts of a whole effectively',
            config: {
              valueField: numericFields[0]
            }
          });
        }
        break;
    }

    return suggestions.length > 0 ? suggestions : [{
      type: 'bar',
      confidence: 0.5,
      reason: 'Default recommendation for mixed data types'
    }];
  }

  private analyzeDataQuality(data: any[]): any {
    const analysis = {
      totalRows: data.length,
      fields: {},
      issues: [],
      recommendations: []
    };

    const fields = Object.keys(data[0] || {});
    
    fields.forEach(field => {
      const values = data.map(row => row[field]);
      const nullCount = values.filter(v => v == null).length;
      const uniqueCount = new Set(values).size;
      
      analysis.fields[field] = {
        type: this.inferDataType(values),
        nullCount,
        nullPercentage: (nullCount / data.length) * 100,
        uniqueCount,
        uniquePercentage: (uniqueCount / data.length) * 100
      };

      if (nullCount > data.length * 0.1) {
        analysis.issues.push(`High null percentage (${Math.round(nullCount/data.length*100)}%) in field '${field}'`);
        analysis.recommendations.push(`Consider data imputation or removal for field '${field}'`);
      }
    });

    if (data.length < 10) {
      analysis.issues.push('Small dataset size may limit statistical significance');
      analysis.recommendations.push('Consider collecting more data for better insights');
    }

    return analysis;
  }

  private inferDataType(values: any[]): string {
    const nonNullValues = values.filter(v => v != null);
    if (nonNullValues.length === 0) return 'unknown';

    const numericCount = nonNullValues.filter(v => typeof v === 'number').length;
    const dateCount = nonNullValues.filter(v => !isNaN(Date.parse(v))).length;
    
    if (numericCount / nonNullValues.length > 0.8) return 'numeric';
    if (dateCount / nonNullValues.length > 0.8) return 'datetime';
    return 'categorical';
  }

  private async createChartSeries(data: any[], seriesConfig: any): Promise<any> {
    const groups = new Map();
    
    data.forEach(row => {
      const groupKey = row[seriesConfig.groupBy];
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey).push(row);
    });

    const chartIds = [];
    
    for (const [groupKey, groupData] of groups) {
      const chartId = await this.visualizationEngine.createVisualization(
        seriesConfig.chartType,
        groupData,
        {
          ...seriesConfig.commonConfig,
          title: `${seriesConfig.chartType} Chart - ${groupKey}`
        }
      );
      chartIds.push({ groupKey, chartId });
    }

    return {
      seriesId: `series_${Date.now()}`,
      totalCharts: chartIds.length,
      charts: chartIds
    };
  }

  async start(): Promise<void> {
    try {
      this.healthChecker.start();
      
      logger.info('Visualization & Insights Server started successfully', {
        port: this.config.port,
        tools: 16
      });
    } catch (error) {
      logger.error('Failed to start Visualization & Insights Server', { error });
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      await this.healthChecker.stop();
      logger.info('Visualization & Insights Server stopped successfully');
    } catch (error) {
      logger.error('Error during server shutdown', { error });
      throw error;
    }
  }

  async getHealthStatus(): Promise<any> {
    return await this.healthChecker.check();
  }

  getMetrics(): any {
    return {
      visualization: this.visualizationEngine.getHealthCheck()
    };
  }
}

export default VisualizationInsightsServer;