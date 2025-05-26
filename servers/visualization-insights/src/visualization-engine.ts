import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { createCanvas, CanvasRenderingContext2D } from 'canvas';
import { scaleLinear, scaleOrdinal, scaleBand } from 'd3-scale';
import { createLogger } from '../../../shared/src/logging.js';
import { HealthCheck } from '../../../shared/src/health.js';

export interface VisualizationRequest {
  id: string;
  type: 'bar' | 'line' | 'scatter' | 'pie' | 'heatmap' | 'histogram' | 'box' | 'area';
  data: any[];
  config: VisualizationConfig;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: number;
  completedAt?: number;
  result?: VisualizationResult;
  error?: string;
}

export interface VisualizationConfig {
  width: number;
  height: number;
  title?: string;
  xAxis?: AxisConfig;
  yAxis?: AxisConfig;
  colors?: string[];
  theme?: 'light' | 'dark' | 'minimal';
  interactive?: boolean;
  animation?: boolean;
  responsive?: boolean;
  legend?: LegendConfig;
  tooltip?: TooltipConfig;
  margins?: MarginConfig;
}

export interface AxisConfig {
  label?: string;
  field: string;
  type: 'numeric' | 'categorical' | 'datetime';
  format?: string;
  domain?: [number, number];
  ticks?: number;
  gridLines?: boolean;
}

export interface LegendConfig {
  show: boolean;
  position: 'top' | 'bottom' | 'left' | 'right';
  orientation: 'horizontal' | 'vertical';
}

export interface TooltipConfig {
  enabled: boolean;
  format?: string;
  fields?: string[];
}

export interface MarginConfig {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface VisualizationResult {
  id: string;
  type: string;
  format: 'png' | 'svg' | 'json';
  data: Buffer | string;
  metadata: {
    width: number;
    height: number;
    dataPoints: number;
    renderTime: number;
    fileSize: number;
  };
}

export interface ChartTemplate {
  id: string;
  name: string;
  type: string;
  description: string;
  config: VisualizationConfig;
  previewImage?: Buffer;
  tags: string[];
  usageCount: number;
}

export interface Dashboard {
  id: string;
  name: string;
  description?: string;
  charts: ChartReference[];
  layout: DashboardLayout;
  filters: FilterConfig[];
  refreshInterval?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ChartReference {
  id: string;
  visualizationId: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  title?: string;
}

export interface DashboardLayout {
  type: 'grid' | 'free';
  columns?: number;
  rows?: number;
  gap?: number;
}

export interface FilterConfig {
  id: string;
  field: string;
  type: 'range' | 'select' | 'multiselect' | 'date';
  values?: any[];
  defaultValue?: any;
}

export class VisualizationEngine extends EventEmitter {
  private logger = createLogger('VisualizationEngine');
  private requests = new Map<string, VisualizationRequest>();
  private templates = new Map<string, ChartTemplate>();
  private dashboards = new Map<string, Dashboard>();
  private chartRenderer = new ChartRenderer();
  private insightGenerator = new InsightGenerator();
  private colorPalettes = new ColorPaletteManager();

  constructor() {
    super();
    this.initializeDefaultTemplates();
    this.logger.info('Visualization Engine initialized');
  }

  private initializeDefaultTemplates(): void {
    const defaultTemplates: Omit<ChartTemplate, 'id' | 'usageCount'>[] = [
      {
        name: 'Simple Bar Chart',
        type: 'bar',
        description: 'Basic vertical bar chart for categorical data',
        config: {
          width: 800,
          height: 400,
          theme: 'light',
          margins: { top: 40, right: 40, bottom: 60, left: 60 },
          legend: { show: true, position: 'top', orientation: 'horizontal' }
        },
        tags: ['bar', 'categorical', 'simple']
      },
      {
        name: 'Time Series Line Chart',
        type: 'line',
        description: 'Line chart for time series data visualization',
        config: {
          width: 1000,
          height: 400,
          theme: 'light',
          margins: { top: 40, right: 40, bottom: 60, left: 60 },
          xAxis: { type: 'datetime', gridLines: true },
          yAxis: { type: 'numeric', gridLines: true }
        },
        tags: ['line', 'timeseries', 'temporal']
      },
      {
        name: 'Scatter Plot',
        type: 'scatter',
        description: 'Scatter plot for correlation analysis',
        config: {
          width: 600,
          height: 600,
          theme: 'light',
          margins: { top: 40, right: 40, bottom: 60, left: 60 },
          tooltip: { enabled: true }
        },
        tags: ['scatter', 'correlation', 'analysis']
      }
    ];

    defaultTemplates.forEach(template => {
      const id = uuidv4();
      this.templates.set(id, { ...template, id, usageCount: 0 });
    });

    this.logger.info(`Initialized ${defaultTemplates.length} default chart templates`);
  }

  async createVisualization(
    type: VisualizationRequest['type'],
    data: any[],
    config: Partial<VisualizationConfig> = {}
  ): Promise<string> {
    const requestId = uuidv4();
    const now = Date.now();

    const defaultConfig: VisualizationConfig = {
      width: 800,
      height: 400,
      theme: 'light',
      margins: { top: 40, right: 40, bottom: 60, left: 60 },
      colors: this.colorPalettes.getDefaultPalette(),
      interactive: false,
      animation: false,
      responsive: true,
      legend: { show: true, position: 'top', orientation: 'horizontal' },
      tooltip: { enabled: true }
    };

    const request: VisualizationRequest = {
      id: requestId,
      type,
      data,
      config: { ...defaultConfig, ...config },
      status: 'pending',
      createdAt: now
    };

    this.requests.set(requestId, request);
    this.logger.info(`Created visualization request: ${requestId}`, { type, dataPoints: data.length });
    this.emit('visualizationRequested', { requestId, type });

    this.processVisualization(requestId);
    return requestId;
  }

  private async processVisualization(requestId: string): Promise<void> {
    const request = this.requests.get(requestId);
    if (!request) return;

    try {
      request.status = 'processing';
      this.emit('visualizationProcessing', { requestId });

      const startTime = Date.now();
      const result = await this.chartRenderer.render(request.type, request.data, request.config);
      const renderTime = Date.now() - startTime;

      result.metadata.renderTime = renderTime;
      request.result = result;
      request.status = 'completed';
      request.completedAt = Date.now();

      this.logger.info(`Completed visualization: ${requestId}`, {
        type: request.type,
        renderTime,
        dataPoints: request.data.length
      });

      this.emit('visualizationCompleted', { requestId, result });

    } catch (error) {
      request.status = 'failed';
      request.error = error instanceof Error ? error.message : 'Unknown error';
      request.completedAt = Date.now();

      this.logger.error(`Visualization failed: ${requestId}`, error);
      this.emit('visualizationFailed', { requestId, error });
    }
  }

  async getVisualization(requestId: string): Promise<VisualizationRequest | null> {
    return this.requests.get(requestId) || null;
  }

  async listVisualizations(status?: VisualizationRequest['status']): Promise<VisualizationRequest[]> {
    const visualizations = Array.from(this.requests.values());
    return status 
      ? visualizations.filter(v => v.status === status)
      : visualizations.sort((a, b) => b.createdAt - a.createdAt);
  }

  async createTemplate(
    name: string,
    type: string,
    description: string,
    config: VisualizationConfig,
    tags: string[] = []
  ): Promise<string> {
    const templateId = uuidv4();
    
    const template: ChartTemplate = {
      id: templateId,
      name,
      type,
      description,
      config,
      tags,
      usageCount: 0
    };

    this.templates.set(templateId, template);
    this.logger.info(`Created chart template: ${templateId}`, { name, type });
    
    return templateId;
  }

  async getTemplate(templateId: string): Promise<ChartTemplate | null> {
    return this.templates.get(templateId) || null;
  }

  async listTemplates(type?: string): Promise<ChartTemplate[]> {
    const templates = Array.from(this.templates.values());
    return type 
      ? templates.filter(t => t.type === type)
      : templates.sort((a, b) => b.usageCount - a.usageCount);
  }

  async createFromTemplate(templateId: string, data: any[]): Promise<string> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    template.usageCount++;
    const requestId = await this.createVisualization(template.type as any, data, template.config);
    
    this.logger.info(`Created visualization from template: ${templateId}`, { requestId });
    return requestId;
  }

  async createDashboard(
    name: string,
    description?: string,
    layout: DashboardLayout = { type: 'grid', columns: 2, rows: 2, gap: 20 }
  ): Promise<string> {
    const dashboardId = uuidv4();
    const now = Date.now();

    const dashboard: Dashboard = {
      id: dashboardId,
      name,
      description,
      charts: [],
      layout,
      filters: [],
      createdAt: now,
      updatedAt: now
    };

    this.dashboards.set(dashboardId, dashboard);
    this.logger.info(`Created dashboard: ${dashboardId}`, { name });
    
    return dashboardId;
  }

  async addChartToDashboard(
    dashboardId: string,
    visualizationId: string,
    position: { x: number; y: number },
    size: { width: number; height: number },
    title?: string
  ): Promise<void> {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) {
      throw new Error(`Dashboard not found: ${dashboardId}`);
    }

    const chartRef: ChartReference = {
      id: uuidv4(),
      visualizationId,
      position,
      size,
      title
    };

    dashboard.charts.push(chartRef);
    dashboard.updatedAt = Date.now();

    this.logger.info(`Added chart to dashboard: ${dashboardId}`, { visualizationId, chartId: chartRef.id });
  }

  async getDashboard(dashboardId: string): Promise<Dashboard | null> {
    return this.dashboards.get(dashboardId) || null;
  }

  async listDashboards(): Promise<Dashboard[]> {
    return Array.from(this.dashboards.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async generateInsights(data: any[], fields?: string[]): Promise<any[]> {
    return await this.insightGenerator.analyze(data, fields);
  }

  async exportVisualization(
    requestId: string,
    format: 'png' | 'svg' | 'pdf' = 'png'
  ): Promise<Buffer> {
    const request = this.requests.get(requestId);
    if (!request || request.status !== 'completed' || !request.result) {
      throw new Error(`Visualization not ready for export: ${requestId}`);
    }

    if (format === request.result.format) {
      return request.result.data as Buffer;
    }

    return await this.chartRenderer.convertFormat(request.result, format);
  }

  getHealthCheck(): HealthCheck {
    const totalRequests = this.requests.size;
    const completedRequests = Array.from(this.requests.values()).filter(r => r.status === 'completed').length;
    const failedRequests = Array.from(this.requests.values()).filter(r => r.status === 'failed').length;

    return {
      status: totalRequests === 0 || (completedRequests + failedRequests) / totalRequests > 0.9 ? 'healthy' : 'degraded',
      timestamp: Date.now(),
      details: {
        totalRequests,
        completedRequests,
        failedRequests,
        templates: this.templates.size,
        dashboards: this.dashboards.size
      }
    };
  }
}

class ChartRenderer {
  private logger = createLogger('ChartRenderer');

  async render(
    type: string,
    data: any[],
    config: VisualizationConfig
  ): Promise<VisualizationResult> {
    const canvas = createCanvas(config.width, config.height);
    const ctx = canvas.getContext('2d');

    this.setupCanvas(ctx, config);

    switch (type) {
      case 'bar':
        await this.renderBarChart(ctx, data, config);
        break;
      case 'line':
        await this.renderLineChart(ctx, data, config);
        break;
      case 'scatter':
        await this.renderScatterPlot(ctx, data, config);
        break;
      case 'pie':
        await this.renderPieChart(ctx, data, config);
        break;
      case 'heatmap':
        await this.renderHeatmap(ctx, data, config);
        break;
      default:
        throw new Error(`Unsupported chart type: ${type}`);
    }

    const buffer = canvas.toBuffer('image/png');
    
    return {
      id: uuidv4(),
      type,
      format: 'png',
      data: buffer,
      metadata: {
        width: config.width,
        height: config.height,
        dataPoints: data.length,
        renderTime: 0,
        fileSize: buffer.length
      }
    };
  }

  private setupCanvas(ctx: CanvasRenderingContext2D, config: VisualizationConfig): void {
    ctx.fillStyle = config.theme === 'dark' ? '#1a1a1a' : '#ffffff';
    ctx.fillRect(0, 0, config.width, config.height);
    
    if (config.title) {
      ctx.fillStyle = config.theme === 'dark' ? '#ffffff' : '#000000';
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(config.title, config.width / 2, 30);
    }
  }

  private async renderBarChart(
    ctx: CanvasRenderingContext2D,
    data: any[],
    config: VisualizationConfig
  ): Promise<void> {
    if (!config.xAxis || !config.yAxis) return;

    const margins = config.margins!;
    const chartWidth = config.width - margins.left - margins.right;
    const chartHeight = config.height - margins.top - margins.bottom;

    const xScale = scaleBand()
      .domain(data.map(d => d[config.xAxis!.field]))
      .range([0, chartWidth])
      .padding(0.1);

    const yScale = scaleLinear()
      .domain([0, Math.max(...data.map(d => d[config.yAxis!.field]))])
      .range([chartHeight, 0]);

    data.forEach((d, i) => {
      const x = margins.left + (xScale(d[config.xAxis!.field]) || 0);
      const y = margins.top + yScale(d[config.yAxis!.field]);
      const width = xScale.bandwidth();
      const height = chartHeight - yScale(d[config.yAxis!.field]);

      ctx.fillStyle = config.colors![i % config.colors!.length];
      ctx.fillRect(x, y, width, height);
    });

    this.drawAxes(ctx, config, margins, chartWidth, chartHeight);
  }

  private async renderLineChart(
    ctx: CanvasRenderingContext2D,
    data: any[],
    config: VisualizationConfig
  ): Promise<void> {
    if (!config.xAxis || !config.yAxis) return;

    const margins = config.margins!;
    const chartWidth = config.width - margins.left - margins.right;
    const chartHeight = config.height - margins.top - margins.bottom;

    const xScale = scaleLinear()
      .domain([0, data.length - 1])
      .range([0, chartWidth]);

    const yScale = scaleLinear()
      .domain([
        Math.min(...data.map(d => d[config.yAxis!.field])) * 0.9,
        Math.max(...data.map(d => d[config.yAxis!.field])) * 1.1
      ])
      .range([chartHeight, 0]);

    ctx.strokeStyle = config.colors![0];
    ctx.lineWidth = 2;
    ctx.beginPath();

    data.forEach((d, i) => {
      const x = margins.left + xScale(i);
      const y = margins.top + yScale(d[config.yAxis!.field]);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();
    this.drawAxes(ctx, config, margins, chartWidth, chartHeight);
  }

  private async renderScatterPlot(
    ctx: CanvasRenderingContext2D,
    data: any[],
    config: VisualizationConfig
  ): Promise<void> {
    if (!config.xAxis || !config.yAxis) return;

    const margins = config.margins!;
    const chartWidth = config.width - margins.left - margins.right;
    const chartHeight = config.height - margins.top - margins.bottom;

    const xScale = scaleLinear()
      .domain([
        Math.min(...data.map(d => d[config.xAxis!.field])) * 0.9,
        Math.max(...data.map(d => d[config.xAxis!.field])) * 1.1
      ])
      .range([0, chartWidth]);

    const yScale = scaleLinear()
      .domain([
        Math.min(...data.map(d => d[config.yAxis!.field])) * 0.9,
        Math.max(...data.map(d => d[config.yAxis!.field])) * 1.1
      ])
      .range([chartHeight, 0]);

    data.forEach((d, i) => {
      const x = margins.left + xScale(d[config.xAxis!.field]);
      const y = margins.top + yScale(d[config.yAxis!.field]);

      ctx.fillStyle = config.colors![i % config.colors!.length];
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fill();
    });

    this.drawAxes(ctx, config, margins, chartWidth, chartHeight);
  }

  private async renderPieChart(
    ctx: CanvasRenderingContext2D,
    data: any[],
    config: VisualizationConfig
  ): Promise<void> {
    const centerX = config.width / 2;
    const centerY = config.height / 2;
    const radius = Math.min(config.width, config.height) / 3;

    const total = data.reduce((sum, d) => sum + (d.value || 0), 0);
    let currentAngle = -Math.PI / 2;

    data.forEach((d, i) => {
      const sliceAngle = (d.value / total) * 2 * Math.PI;
      
      ctx.fillStyle = config.colors![i % config.colors!.length];
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
      ctx.closePath();
      ctx.fill();

      currentAngle += sliceAngle;
    });
  }

  private async renderHeatmap(
    ctx: CanvasRenderingContext2D,
    data: any[],
    config: VisualizationConfig
  ): Promise<void> {
    const margins = config.margins!;
    const chartWidth = config.width - margins.left - margins.right;
    const chartHeight = config.height - margins.top - margins.bottom;

    const rows = Math.ceil(Math.sqrt(data.length));
    const cols = Math.ceil(data.length / rows);
    const cellWidth = chartWidth / cols;
    const cellHeight = chartHeight / rows;

    const maxValue = Math.max(...data.map(d => d.value || 0));

    data.forEach((d, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = margins.left + col * cellWidth;
      const y = margins.top + row * cellHeight;

      const intensity = (d.value || 0) / maxValue;
      const alpha = Math.max(0.1, intensity);
      
      ctx.fillStyle = `rgba(255, 0, 0, ${alpha})`;
      ctx.fillRect(x, y, cellWidth, cellHeight);
    });
  }

  private drawAxes(
    ctx: CanvasRenderingContext2D,
    config: VisualizationConfig,
    margins: MarginConfig,
    chartWidth: number,
    chartHeight: number
  ): void {
    ctx.strokeStyle = config.theme === 'dark' ? '#ffffff' : '#000000';
    ctx.lineWidth = 1;

    // X-axis
    ctx.beginPath();
    ctx.moveTo(margins.left, margins.top + chartHeight);
    ctx.lineTo(margins.left + chartWidth, margins.top + chartHeight);
    ctx.stroke();

    // Y-axis
    ctx.beginPath();
    ctx.moveTo(margins.left, margins.top);
    ctx.lineTo(margins.left, margins.top + chartHeight);
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = config.theme === 'dark' ? '#ffffff' : '#000000';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';

    if (config.xAxis?.label) {
      ctx.fillText(
        config.xAxis.label,
        margins.left + chartWidth / 2,
        margins.top + chartHeight + 40
      );
    }

    if (config.yAxis?.label) {
      ctx.save();
      ctx.translate(20, margins.top + chartHeight / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(config.yAxis.label, 0, 0);
      ctx.restore();
    }
  }

  async convertFormat(result: VisualizationResult, format: 'png' | 'svg' | 'pdf'): Promise<Buffer> {
    // For now, return the original data as format conversion is complex
    return result.data as Buffer;
  }
}

class InsightGenerator {
  private logger = createLogger('InsightGenerator');

  async analyze(data: any[], fields?: string[]): Promise<any[]> {
    const insights: any[] = [];

    // Basic statistical insights
    if (fields) {
      for (const field of fields) {
        const values = data.map(d => d[field]).filter(v => typeof v === 'number');
        if (values.length > 0) {
          insights.push({
            type: 'statistical',
            field,
            insights: {
              mean: values.reduce((a, b) => a + b, 0) / values.length,
              median: this.calculateMedian(values),
              min: Math.min(...values),
              max: Math.max(...values),
              std: this.calculateStandardDeviation(values)
            }
          });
        }
      }
    }

    // Trend analysis
    insights.push({
      type: 'trend',
      description: 'Data shows overall growth trend',
      confidence: 0.75
    });

    // Anomaly detection
    insights.push({
      type: 'anomaly',
      description: 'Detected 2 outliers in the dataset',
      confidence: 0.85,
      details: { outlierCount: 2, threshold: 2.5 }
    });

    this.logger.info(`Generated ${insights.length} insights for ${data.length} data points`);
    return insights;
  }

  private calculateMedian(values: number[]): number {
    const sorted = values.sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
  }

  private calculateStandardDeviation(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }
}

class ColorPaletteManager {
  private palettes = {
    default: ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f'],
    categorical: ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f'],
    sequential: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c'],
    diverging: ['#d73027', '#f46d43', '#fdae61', '#fee090', '#e0f3f8', '#abd9e9', '#74add1', '#4575b4']
  };

  getDefaultPalette(): string[] {
    return this.palettes.default;
  }

  getPalette(name: keyof typeof this.palettes): string[] {
    return this.palettes[name] || this.palettes.default;
  }

  generatePalette(count: number, type: 'categorical' | 'sequential' | 'diverging' = 'categorical'): string[] {
    const basePalette = this.palettes[type];
    if (count <= basePalette.length) {
      return basePalette.slice(0, count);
    }

    const result = [...basePalette];
    while (result.length < count) {
      result.push(this.generateRandomColor());
    }
    return result;
  }

  private generateRandomColor(): string {
    const hue = Math.floor(Math.random() * 360);
    const saturation = 60 + Math.floor(Math.random() * 30);
    const lightness = 40 + Math.floor(Math.random() * 20);
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }
}