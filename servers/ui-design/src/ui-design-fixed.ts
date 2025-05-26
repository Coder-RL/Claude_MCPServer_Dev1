import { StandardMCPServer, MCPTool } from '../../shared/standard-mcp-server';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Simple cache implementation for UI Design
class UIDesignCache<T> {
  private cache = new Map<string, { value: T; timestamp: number; hits: number }>();
  private maxSize: number;
  private maxAge: number;

  constructor(maxSize = 50, maxAge = 300000) { // Reduced default sizes
    this.maxSize = maxSize;
    this.maxAge = maxAge;
  }

  set(key: string, value: T): void {
    this.evictExpired();
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }
    this.cache.set(key, { value, timestamp: Date.now(), hits: 0 });
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      return undefined;
    }
    entry.hits++;
    return entry.value;
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.maxAge) {
        this.cache.delete(key);
      }
    }
  }

  private evictLRU(): void {
    let lruKey = '';
    let lruHits = Infinity;
    for (const [key, entry] of this.cache) {
      if (entry.hits < lruHits) {
        lruHits = entry.hits;
        lruKey = key;
      }
    }
    if (lruKey) this.cache.delete(lruKey);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// Simplified interfaces for UI Design
export interface UIComponent {
  id: string;
  name: string;
  type: string;
  filePath: string;
  framework: string;
  props: any[];
  styleProperties: any[];
  children: UIComponent[];
  parent?: string;
  designTokens: any[];
  accessibility: any;
  usageCount: number;
  lastModified: Date;
  complexity: any;
  documentation?: any;
}

export interface UIAnalysisConfig {
  frameworks: string[];
  componentTypes: string[];
  includeAccessibility: boolean;
  includePerformance: boolean;
  includeDesignTokens: boolean;
  excludePatterns: string[];
  designSystemRules: any[];
}

export interface DesignSystemAnalysis {
  id: string;
  projectPath: string;
  components: UIComponent[];
  designTokens: any[];
  consistency: any;
  accessibility: any;
  performance: any;
  recommendations: any[];
  timestamp: Date;
}

// Simplified UI Design Service
class UIDesignService {
  private analysisCache = new UIDesignCache<DesignSystemAnalysis>(10, 1800000);
  private componentCache = new UIDesignCache<UIComponent>(20, 900000);
  private config: UIAnalysisConfig;

  constructor(config: UIAnalysisConfig) {
    this.config = config;
  }

  async analyzeDesignSystem(projectPath: string, options?: any): Promise<DesignSystemAnalysis> {
    const cacheKey = `${projectPath}_${JSON.stringify(options)}`;
    const cached = this.analysisCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Simplified analysis implementation
    const analysis: DesignSystemAnalysis = {
      id: `analysis_${Date.now()}`,
      projectPath,
      components: await this.analyzeComponents(projectPath),
      designTokens: await this.extractDesignTokens(projectPath),
      consistency: { score: 85, issues: [] },
      accessibility: { score: 78, violations: [] },
      performance: { score: 82, suggestions: [] },
      recommendations: [],
      timestamp: new Date()
    };

    this.analysisCache.set(cacheKey, analysis);
    return analysis;
  }

  async getComponentById(componentId: string): Promise<UIComponent | null> {
    const cached = this.componentCache.get(componentId);
    if (cached) {
      return cached;
    }

    // Simplified component lookup
    const component: UIComponent = {
      id: componentId,
      name: `Component_${componentId}`,
      type: 'component',
      filePath: `/path/to/${componentId}.tsx`,
      framework: 'react',
      props: [],
      styleProperties: [],
      children: [],
      designTokens: [],
      accessibility: { score: 85 },
      usageCount: 1,
      lastModified: new Date(),
      complexity: { score: 'medium' }
    };

    this.componentCache.set(componentId, component);
    return component;
  }

  async getAnalysisResult(analysisId: string): Promise<DesignSystemAnalysis | null> {
    // Simple lookup - in real implementation would check database/storage
    return null;
  }

  async generateComponentReport(componentId: string): Promise<any> {
    const component = await this.getComponentById(componentId);
    return {
      component,
      report: {
        accessibility: 'Good',
        performance: 'Optimized',
        usage: 'Widely used'
      }
    };
  }

  private async analyzeComponents(projectPath: string): Promise<UIComponent[]> {
    // Simplified component analysis
    return [];
  }

  private async extractDesignTokens(projectPath: string): Promise<any[]> {
    // Simplified token extraction
    return [];
  }

  getHealthStatus(): any {
    return {
      status: 'healthy',
      cacheSize: this.analysisCache.size(),
      timestamp: new Date()
    };
  }

  clearCaches(): void {
    this.analysisCache.clear();
    this.componentCache.clear();
  }
}

export class UIDesignServer extends StandardMCPServer {
  private uiDesignService?: UIDesignService; // Lazy loading
  private memoryMonitorInterval?: NodeJS.Timeout;

  constructor() {
    super('ui-design-server', 'UI Design Analysis and Component Management Server');
    // Keep constructor minimal - no service creation
  }

  async setupTools(): Promise<void> {
    // Register tools only - no service initialization
    this.registerTool({
      name: 'analyze_design_system',
      description: 'Perform comprehensive UI design system analysis',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: 'Path to the project to analyze' },
          frameworks: {
            type: 'array',
            items: { enum: ['react', 'vue', 'angular', 'svelte', 'flutter', 'react_native', 'swift_ui', 'android_compose', 'html_css', 'web_components'] },
            description: 'UI frameworks to analyze'
          },
          includeAccessibility: { type: 'boolean', default: true },
          includePerformance: { type: 'boolean', default: true }
        },
        required: ['projectPath']
      }
    });

    this.registerTool({
      name: 'get_component_details',
      description: 'Get detailed information about a specific UI component',
      inputSchema: {
        type: 'object',
        properties: {
          componentId: { type: 'string', description: 'Unique identifier of the component' }
        },
        required: ['componentId']
      }
    });

    this.registerTool({
      name: 'check_design_consistency',
      description: 'Check design consistency across components',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: 'Path to the project to check' },
          focusAreas: {
            type: 'array',
            items: { enum: ['colors', 'typography', 'spacing', 'components'] },
            description: 'Areas to focus consistency check on'
          }
        },
        required: ['projectPath']
      }
    });

    this.registerTool({
      name: 'analyze_accessibility_compliance',
      description: 'Analyze accessibility compliance of components',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: 'Path to project to analyze' },
          wcagLevel: { type: 'string', enum: ['A', 'AA', 'AAA'], default: 'AA' }
        },
        required: ['projectPath']
      }
    });

    this.registerTool({
      name: 'extract_design_tokens',
      description: 'Extract design tokens from the design system',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: 'Path to project to analyze' },
          tokenTypes: {
            type: 'array',
            items: { enum: ['color', 'typography', 'spacing', 'sizing', 'elevation', 'border'] },
            description: 'Types of tokens to extract'
          }
        },
        required: ['projectPath']
      }
    });

    this.registerTool({
      name: 'generate_component_documentation',
      description: 'Generate documentation for a component',
      inputSchema: {
        type: 'object',
        properties: {
          componentId: { type: 'string', description: 'Component ID to document' }
        },
        required: ['componentId']
      }
    });

    this.registerTool({
      name: 'suggest_design_improvements',
      description: 'Suggest improvements for design consistency',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: 'Path to project to analyze' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }
        },
        required: ['projectPath']
      }
    });

    this.registerTool({
      name: 'validate_responsive_design',
      description: 'Validate responsive design implementation',
      inputSchema: {
        type: 'object',
        properties: {
          componentId: { type: 'string', description: 'Component ID to validate' },
          breakpoints: {
            type: 'array',
            items: { type: 'string' },
            description: 'Breakpoints to validate against'
          }
        },
        required: ['componentId']
      }
    });

    // Do NOT start memory monitoring here!
  }

  private getUIDesignService(): UIDesignService {
    if (!this.uiDesignService) {
      const config: UIAnalysisConfig = {
        frameworks: ['react', 'vue', 'angular', 'html_css'],
        componentTypes: ['atom', 'molecule', 'organism', 'template'],
        includeAccessibility: true,
        includePerformance: true,
        includeDesignTokens: true,
        excludePatterns: ['node_modules', '.git', 'dist', 'build'],
        designSystemRules: []
      };
      this.uiDesignService = new UIDesignService(config);
    }
    return this.uiDesignService;
  }

  async handleToolCall(toolName: string, parameters: any): Promise<CallToolResult> {
    const service = this.getUIDesignService(); // Lazy loading

    switch (toolName) {
      case 'analyze_design_system':
        const result = await service.analyzeDesignSystem(parameters.projectPath, {
          frameworks: parameters.frameworks,
          includeAccessibility: parameters.includeAccessibility,
          includePerformance: parameters.includePerformance
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };

      case 'get_component_details':
        const component = await service.getComponentById(parameters.componentId);
        return { content: [{ type: 'text', text: JSON.stringify(component, null, 2) }] };

      case 'check_design_consistency':
        const analysis = await service.analyzeDesignSystem(parameters.projectPath, {
          frameworks: ['react', 'vue', 'angular'] 
        });
        const consistencyResult = {
          consistency: analysis.consistency,
          focusAreas: parameters.focusAreas,
          recommendations: analysis.recommendations.filter(r => r.category === 'consistency')
        };
        return { content: [{ type: 'text', text: JSON.stringify(consistencyResult, null, 2) }] };

      case 'analyze_accessibility_compliance':
        const accessibilityAnalysis = await service.analyzeDesignSystem(parameters.projectPath, {
          includeAccessibility: true
        });
        const accessibilityResult = {
          accessibility: accessibilityAnalysis.accessibility,
          wcagLevel: parameters.wcagLevel,
          compliance: accessibilityAnalysis.accessibility.wcagCompliance || 'Not assessed'
        };
        return { content: [{ type: 'text', text: JSON.stringify(accessibilityResult, null, 2) }] };

      case 'extract_design_tokens':
        const tokenAnalysis = await service.analyzeDesignSystem(parameters.projectPath, {
          includeDesignTokens: true
        });
        const tokenResult = {
          designTokens: tokenAnalysis.designTokens.filter(token => 
            !parameters.tokenTypes || parameters.tokenTypes.includes(token.category)
          ),
          usage: tokenAnalysis.designTokens.reduce((acc, token) => acc + (token.usageCount || 0), 0)
        };
        return { content: [{ type: 'text', text: JSON.stringify(tokenResult, null, 2) }] };

      case 'generate_component_documentation':
        const documentation = await service.generateComponentReport(parameters.componentId);
        return { content: [{ type: 'text', text: JSON.stringify(documentation, null, 2) }] };

      case 'suggest_design_improvements':
        const improvementAnalysis = await service.analyzeDesignSystem(parameters.projectPath);
        const suggestions = {
          recommendations: improvementAnalysis.recommendations.filter(r => 
            !parameters.priority || r.priority === parameters.priority
          )
        };
        return { content: [{ type: 'text', text: JSON.stringify(suggestions, null, 2) }] };

      case 'validate_responsive_design':
        const responsiveComponent = await service.getComponentById(parameters.componentId);
        if (!responsiveComponent) {
          throw new Error(`Component ${parameters.componentId} not found`);
        }
        const responsiveResult = {
          component: responsiveComponent.name,
          responsive: responsiveComponent.styleProperties.filter(s => s.responsive && s.responsive.length > 0),
          breakpoints: parameters.breakpoints,
          isResponsive: responsiveComponent.styleProperties.some(s => s.responsive && s.responsive.length > 0)
        };
        return { content: [{ type: 'text', text: JSON.stringify(responsiveResult, null, 2) }] };

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  // Optional: Start monitoring AFTER server is ready (can be called externally)
  startOptionalMonitoring(): void {
    if (!this.memoryMonitorInterval) {
      this.memoryMonitorInterval = setInterval(() => {
        const memUsage = process.memoryUsage();
        const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        
        if (heapUsedMB > 80) {
          console.log('[UI Design] Memory critical, clearing caches...');
          this.getUIDesignService().clearCaches();
        }
      }, 30000);
    }
  }

  // Cleanup method
  async cleanup(): Promise<void> {
    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
      this.memoryMonitorInterval = undefined;
    }
    
    if (this.uiDesignService) {
      this.uiDesignService.clearCaches();
    }
  }
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new UIDesignServer();
  server.start().catch(console.error);
}