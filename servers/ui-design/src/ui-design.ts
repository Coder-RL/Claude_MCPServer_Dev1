import { BaseMCPServer } from "../../shared/base-server";
import { MCPError } from '../../../shared/src/errors';
import { HealthChecker } from '../../../shared/src/health';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Memory optimization: Set Node.js memory management flags
process.env.NODE_OPTIONS = '--max-old-space-size=512 --gc-interval=100';

// Memory cache with LRU eviction for UI Design
class UIDesignCache<T> {
  private cache = new Map<string, { value: T; timestamp: number; hits: number }>();
  private maxSize: number;
  private maxAge: number;

  constructor(maxSize = 80, maxAge = 300000) { // 5 minutes
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

// UI Design Analysis Interfaces
export interface UIComponent {
  id: string;
  name: string;
  type: ComponentType;
  filePath: string;
  framework: Framework;
  props: ComponentProp[];
  styleProperties: StyleProperty[];
  children: UIComponent[];
  parent?: string;
  designTokens: DesignToken[];
  accessibility: AccessibilityReport;
  usageCount: number;
  lastModified: Date;
  complexity: ComponentComplexity;
  documentation?: ComponentDocumentation;
}

export type ComponentType = 
  | 'atom' | 'molecule' | 'organism' | 'template' | 'page'
  | 'button' | 'input' | 'card' | 'modal' | 'navigation' | 'layout'
  | 'text' | 'icon' | 'image' | 'form' | 'table' | 'chart';

export type Framework = 
  | 'react' | 'vue' | 'angular' | 'svelte' | 'flutter' | 'react_native'
  | 'swift_ui' | 'android_compose' | 'html_css' | 'web_components';

export interface ComponentProp {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'function' | 'enum';
  required: boolean;
  defaultValue?: any;
  description?: string;
  validation?: PropValidation[];
}

export interface PropValidation {
  rule: 'minLength' | 'maxLength' | 'pattern' | 'range' | 'custom';
  value: any;
  message: string;
}

export interface StyleProperty {
  property: string;
  value: string | number;
  unit?: string;
  responsive?: ResponsiveValue[];
  designToken?: string;
  computed: boolean;
  specificity: number;
}

export interface ResponsiveValue {
  breakpoint: string;
  value: string | number;
}

export interface DesignToken {
  name: string;
  category: 'color' | 'typography' | 'spacing' | 'shadow' | 'border' | 'motion' | 'layout';
  value: string | number;
  description?: string;
  aliasOf?: string;
  usageCount: number;
}

export interface AccessibilityReport {
  score: number; // 0-100
  level: 'A' | 'AA' | 'AAA' | 'fail';
  violations: AccessibilityViolation[];
  suggestions: AccessibilitySuggestion[];
  keyboardNavigable: boolean;
  screenReaderFriendly: boolean;
  colorContrastRatio?: number;
}

export interface AccessibilityViolation {
  rule: string;
  severity: 'error' | 'warning' | 'info';
  element: string;
  description: string;
  fix: string;
  wcagLevel: 'A' | 'AA' | 'AAA';
}

export interface AccessibilitySuggestion {
  type: 'aria' | 'semantic' | 'keyboard' | 'color' | 'focus' | 'structure';
  description: string;
  implementation: string;
  impact: 'high' | 'medium' | 'low';
}

export interface ComponentComplexity {
  cyclomatic: number;
  cognitive: number;
  lines: number;
  dependencies: number;
  props: number;
  states: number;
  effects: number;
  score: number; // 0-100, lower is better
  recommendations: string[];
}

export interface ComponentDocumentation {
  description?: string;
  examples: CodeExample[];
  propsDocumented: boolean;
  storybookStory?: string;
  testCoverage?: number;
  designSpecs?: DesignSpecification;
}

export interface CodeExample {
  title: string;
  code: string;
  language: string;
  description?: string;
}

export interface DesignSpecification {
  figmaUrl?: string;
  designSystemUrl?: string;
  spacing: Record<string, string>;
  colors: Record<string, string>;
  typography: Record<string, string>;
  interactions: InteractionSpec[];
}

export interface InteractionSpec {
  trigger: string;
  action: string;
  animation?: string;
  duration?: number;
  easing?: string;
}

export interface DesignSystemAnalysis {
  id: string;
  projectPath: string;
  framework: Framework;
  startTime: Date;
  endTime: Date;
  components: UIComponent[];
  designTokens: DesignToken[];
  designSystemScore: number;
  consistency: ConsistencyReport;
  accessibility: SystemAccessibilityReport;
  performance: PerformanceReport;
  recommendations: DesignRecommendation[];
  coverage: DesignCoverage;
}

export interface ConsistencyReport {
  score: number; // 0-100
  colorConsistency: number;
  typographyConsistency: number;
  spacingConsistency: number;
  componentConsistency: number;
  violations: ConsistencyViolation[];
}

export interface ConsistencyViolation {
  type: 'color' | 'typography' | 'spacing' | 'component' | 'pattern';
  severity: 'high' | 'medium' | 'low';
  description: string;
  affectedComponents: string[];
  suggestedFix: string;
}

export interface SystemAccessibilityReport {
  overallScore: number;
  componentScores: Record<string, number>;
  commonViolations: AccessibilityViolation[];
  wcagCompliance: {
    A: number;
    AA: number;
    AAA: number;
  };
  recommendations: string[];
}

export interface PerformanceReport {
  bundleSize: number;
  renderTime: number;
  unusedStyles: number;
  duplicateStyles: number;
  suggestions: PerformanceSuggestion[];
}

export interface PerformanceSuggestion {
  type: 'bundling' | 'loading' | 'rendering' | 'styling' | 'optimization';
  description: string;
  impact: 'high' | 'medium' | 'low';
  effort: 'easy' | 'moderate' | 'complex';
  implementation: string;
}

export interface DesignRecommendation {
  category: 'consistency' | 'accessibility' | 'performance' | 'maintainability' | 'usability';
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  effort: 'trivial' | 'easy' | 'moderate' | 'complex';
  affectedComponents: string[];
  implementation: RecommendationStep[];
}

export interface RecommendationStep {
  step: number;
  description: string;
  codeChanges?: CodeChange[];
  verification: string;
}

export interface CodeChange {
  file: string;
  operation: 'add' | 'modify' | 'remove';
  content: string;
  lineNumber?: number;
}

export interface DesignCoverage {
  componentsDocumented: number;
  componentsWithTests: number;
  componentsWithStories: number;
  designTokenUsage: number;
  accessibilityCompliant: number;
  responsiveComponents: number;
  totalComponents: number;
  coverageScore: number;
}

export interface UIAnalysisConfig {
  frameworks: Framework[];
  componentTypes: ComponentType[];
  includeAccessibility: boolean;
  includePerformance: boolean;
  includeDesignTokens: boolean;
  excludePatterns: string[];
  figmaIntegration?: FigmaConfig;
  designSystemRules: DesignSystemRule[];
}

export interface FigmaConfig {
  accessToken: string;
  fileId: string;
  teamId?: string;
}

export interface DesignSystemRule {
  name: string;
  type: 'color' | 'typography' | 'spacing' | 'component' | 'pattern';
  rule: string;
  severity: 'error' | 'warning' | 'info';
  autoFix: boolean;
}

// UI Design Service
export class UIDesignService {
  private config: UIAnalysisConfig;
  private activeAnalyses: Map<string, DesignSystemAnalysis> = new Map();
  private analysisHistory: DesignSystemAnalysis[] = [];
  
  // Memory optimization caches with size limits
  private componentCache = new UIDesignCache<UIComponent[]>(40, 600000); // 10 minutes
  private analysisCache = new UIDesignCache<DesignSystemAnalysis>(15, 1800000); // 30 minutes
  private designTokenCache = new UIDesignCache<DesignToken[]>(25, 3600000); // 1 hour

  constructor(config: UIAnalysisConfig) {
    this.config = config;
  }
  
  // Memory optimization methods
  clearCaches(): void {
    this.componentCache.clear();
    this.analysisCache.clear();
    this.designTokenCache.clear();
    
    // Limit analysis history to prevent memory bloat
    if (this.analysisHistory.length > 15) {
      this.analysisHistory = this.analysisHistory.slice(-8);
    }
    
    console.log('[UI Design] Caches cleared for memory optimization');
  }

  async analyzeDesignSystem(projectPath: string, options: Partial<UIAnalysisConfig> = {}): Promise<DesignSystemAnalysis> {
    const analysisId = this.generateAnalysisId();
    const startTime = new Date();
    
    const analysisConfig = { ...this.config, ...options };

    try {
      // Initialize analysis
      const analysis: DesignSystemAnalysis = {
        id: analysisId,
        projectPath,
        framework: await this.detectFramework(projectPath),
        startTime,
        endTime: new Date(),
        components: [],
        designTokens: [],
        designSystemScore: 0,
        consistency: this.createEmptyConsistencyReport(),
        accessibility: this.createEmptyAccessibilityReport(),
        performance: this.createEmptyPerformanceReport(),
        recommendations: [],
        coverage: this.createEmptyCoverage()
      };

      this.activeAnalyses.set(analysisId, analysis);

      // Discover and analyze components
      const components = await this.discoverComponents(projectPath, analysisConfig);
      analysis.components = components;

      // Extract design tokens
      const designTokens = await this.extractDesignTokens(projectPath, components);
      analysis.designTokens = designTokens;

      // Analyze consistency
      analysis.consistency = await this.analyzeConsistency(components, designTokens);

      // Analyze accessibility
      if (analysisConfig.includeAccessibility) {
        analysis.accessibility = await this.analyzeAccessibility(components);
      }

      // Analyze performance
      if (analysisConfig.includePerformance) {
        analysis.performance = await this.analyzePerformance(projectPath, components);
      }

      // Generate recommendations
      analysis.recommendations = await this.generateRecommendations(analysis);

      // Calculate coverage
      analysis.coverage = this.calculateCoverage(components);

      // Calculate overall design system score
      analysis.designSystemScore = this.calculateDesignSystemScore(analysis);

      const endTime = new Date();
      analysis.endTime = endTime;

      this.activeAnalyses.delete(analysisId);
      this.analysisHistory.push(analysis);

      return analysis;
    } catch (error) {
      this.activeAnalyses.delete(analysisId);
      throw new MCPError('UI_ANALYSIS_FAILED', `UI design analysis failed: ${error.message}`);
    }
  }

  private async detectFramework(projectPath: string): Promise<Framework> {
    // Check package.json for framework dependencies
    const packageJsonPath = path.join(projectPath, 'package.json');
    
    try {
      const packageContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageContent);
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      if (deps.react || deps['@types/react']) return 'react';
      if (deps.vue || deps['@vue/cli']) return 'vue';
      if (deps['@angular/core']) return 'angular';
      if (deps.svelte) return 'svelte';
      if (deps.flutter) return 'flutter';
    } catch (error) {
      // Check for other framework indicators
    }

    // Check for iOS project
    if (await this.fileExists(path.join(projectPath, 'ios'))) {
      return 'swift_ui';
    }

    // Check for Android project
    if (await this.fileExists(path.join(projectPath, 'android'))) {
      return 'android_compose';
    }

    return 'html_css'; // Default
  }

  private async discoverComponents(projectPath: string, config: UIAnalysisConfig): Promise<UIComponent[]> {
    const components: UIComponent[] = [];
    const componentFiles = await this.findComponentFiles(projectPath, config.frameworks);

    for (const file of componentFiles) {
      try {
        const component = await this.analyzeComponentFile(file, config);
        if (component) {
          components.push(component);
        }
      } catch (error) {
        console.error(`Error analyzing component file ${file}:`, error);
      }
    }

    // Build component hierarchy
    this.buildComponentHierarchy(components);

    return components;
  }

  private async findComponentFiles(projectPath: string, frameworks: Framework[]): Promise<string[]> {
    const extensions = new Set<string>();
    
    if (frameworks.includes('react')) {
      extensions.add('.jsx');
      extensions.add('.tsx');
    }
    if (frameworks.includes('vue')) {
      extensions.add('.vue');
    }
    if (frameworks.includes('angular')) {
      extensions.add('.component.ts');
      extensions.add('.component.html');
    }
    if (frameworks.includes('svelte')) {
      extensions.add('.svelte');
    }

    const files = await this.getAllFiles(projectPath);
    return files.filter(file => {
      const ext = path.extname(file);
      return Array.from(extensions).some(allowedExt => file.endsWith(allowedExt));
    });
  }

  private async analyzeComponentFile(filePath: string, config: UIAnalysisConfig): Promise<UIComponent | null> {
    const content = await fs.readFile(filePath, 'utf-8');
    const stats = await fs.stat(filePath);

    // Basic component analysis
    const component: UIComponent = {
      id: this.generateComponentId(filePath),
      name: this.extractComponentName(filePath, content),
      type: this.classifyComponentType(content),
      filePath,
      framework: await this.detectFramework(path.dirname(filePath)),
      props: this.extractProps(content),
      styleProperties: await this.extractStyles(filePath, content),
      children: [],
      designTokens: this.extractComponentDesignTokens(content),
      accessibility: await this.analyzeComponentAccessibility(content),
      usageCount: 0, // Would need project-wide analysis
      lastModified: stats.mtime,
      complexity: this.calculateComponentComplexity(content),
      documentation: await this.extractDocumentation(filePath, content)
    };

    return component;
  }

  private extractComponentName(filePath: string, content: string): string {
    const fileName = path.basename(filePath, path.extname(filePath));
    
    // Try to extract from various patterns
    const patterns = [
      /(?:export\s+(?:default\s+)?(?:function|const|class)\s+)([A-Z][a-zA-Z0-9]*)/,
      /(?:function|const|class)\s+([A-Z][a-zA-Z0-9]*)/,
      /export\s+default\s+([A-Z][a-zA-Z0-9]*)/
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) return match[1];
    }

    return fileName;
  }

  private classifyComponentType(content: string): ComponentType {
    // Heuristics to classify component types
    if (content.includes('button') || content.includes('Button')) return 'button';
    if (content.includes('input') || content.includes('Input')) return 'input';
    if (content.includes('modal') || content.includes('Modal')) return 'modal';
    if (content.includes('card') || content.includes('Card')) return 'card';
    if (content.includes('nav') || content.includes('Nav')) return 'navigation';
    
    // Count the number of other components it uses
    const componentReferences = (content.match(/<[A-Z][a-zA-Z0-9]*\s*[^>]*>/g) || []).length;
    
    if (componentReferences === 0) return 'atom';
    if (componentReferences <= 3) return 'molecule';
    if (componentReferences <= 10) return 'organism';
    
    return 'template';
  }

  private extractProps(content: string): ComponentProp[] {
    const props: ComponentProp[] = [];
    
    // TypeScript interface pattern
    const interfaceMatch = content.match(/interface\s+\w*Props\s*{([^}]*)}/s);
    if (interfaceMatch) {
      const propsContent = interfaceMatch[1];
      const propPattern = /(\w+)(\?)?\s*:\s*([^;]+);/g;
      let match;
      
      while ((match = propPattern.exec(propsContent)) !== null) {
        props.push({
          name: match[1],
          type: this.parseTypeScript(match[3]),
          required: !match[2], // No ? means required
          description: this.extractPropDescription(content, match[1])
        });
      }
    }

    // React PropTypes pattern
    const propTypesMatch = content.match(/\.propTypes\s*=\s*{([^}]*)}/s);
    if (propTypesMatch) {
      // Parse PropTypes
    }

    return props;
  }

  private parseTypeScript(typeStr: string): ComponentProp['type'] {
    const cleanType = typeStr.trim().toLowerCase();
    if (cleanType.includes('string')) return 'string';
    if (cleanType.includes('number')) return 'number';
    if (cleanType.includes('boolean')) return 'boolean';
    if (cleanType.includes('function') || cleanType.includes('=>')) return 'function';
    if (cleanType.includes('[]') || cleanType.includes('array')) return 'array';
    return 'object';
  }

  private extractPropDescription(content: string, propName: string): string | undefined {
    // Look for JSDoc comments above prop
    const propPattern = new RegExp(`/\\*\\*([^*]*)\\*/\\s*${propName}`, 'i');
    const match = content.match(propPattern);
    return match ? match[1].trim() : undefined;
  }

  private async extractStyles(filePath: string, content: string): Promise<StyleProperty[]> {
    const styles: StyleProperty[] = [];
    
    // CSS-in-JS patterns
    const styledComponentMatch = content.match(/styled\.\w+`([^`]*)`/gs);
    if (styledComponentMatch) {
      for (const match of styledComponentMatch) {
        const cssContent = match.replace(/styled\.\w+`/, '').replace(/`$/, '');
        styles.push(...this.parseCSSContent(cssContent));
      }
    }

    // CSS modules or external CSS
    const cssImports = content.match(/import\s+.*\.css['"];/g);
    if (cssImports) {
      for (const cssImport of cssImports) {
        const cssPath = this.resolveCSSPath(filePath, cssImport);
        if (await this.fileExists(cssPath)) {
          const cssContent = await fs.readFile(cssPath, 'utf-8');
          styles.push(...this.parseCSSContent(cssContent));
        }
      }
    }

    return styles;
  }

  private parseCSSContent(cssContent: string): StyleProperty[] {
    const styles: StyleProperty[] = [];
    const propertyPattern = /([a-z-]+)\s*:\s*([^;]+);/gi;
    let match;

    while ((match = propertyPattern.exec(cssContent)) !== null) {
      styles.push({
        property: match[1],
        value: match[2].trim(),
        computed: false,
        specificity: 1 // Simplified
      });
    }

    return styles;
  }

  private resolveCSSPath(jsFilePath: string, cssImport: string): string {
    const importPath = cssImport.match(/['"]([^'"]+)['"]/)?.[1];
    if (!importPath) return '';
    
    return path.resolve(path.dirname(jsFilePath), importPath);
  }

  private extractComponentDesignTokens(content: string): DesignToken[] {
    const tokens: DesignToken[] = [];
    
    // Look for design token usage patterns
    const tokenPatterns = [
      /theme\.(\w+)\.(\w+)/g, // theme.colors.primary
      /tokens\.(\w+)\.(\w+)/g, // tokens.spacing.lg
      /var\(--(\w+-\w+)\)/g // CSS custom properties
    ];

    for (const pattern of tokenPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        tokens.push({
          name: match[1] || match[0],
          category: this.categorizeToken(match[0]),
          value: match[0],
          usageCount: 1
        });
      }
    }

    return tokens;
  }

  private categorizeToken(tokenName: string): DesignToken['category'] {
    const name = tokenName.toLowerCase();
    if (name.includes('color') || name.includes('bg') || name.includes('text')) return 'color';
    if (name.includes('font') || name.includes('text') || name.includes('size')) return 'typography';
    if (name.includes('space') || name.includes('margin') || name.includes('padding')) return 'spacing';
    if (name.includes('shadow')) return 'shadow';
    if (name.includes('border') || name.includes('radius')) return 'border';
    if (name.includes('duration') || name.includes('ease')) return 'motion';
    return 'layout';
  }

  private async analyzeComponentAccessibility(content: string): Promise<AccessibilityReport> {
    const violations: AccessibilityViolation[] = [];
    const suggestions: AccessibilitySuggestion[] = [];

    // Check for common accessibility issues
    if (!content.includes('aria-') && content.includes('<button')) {
      violations.push({
        rule: 'button-name',
        severity: 'error',
        element: 'button',
        description: 'Button elements must have accessible names',
        fix: 'Add aria-label or accessible text content',
        wcagLevel: 'A'
      });
    }

    if (content.includes('<img') && !content.includes('alt=')) {
      violations.push({
        rule: 'image-alt',
        severity: 'error',
        element: 'img',
        description: 'Images must have alternative text',
        fix: 'Add alt attribute to img elements',
        wcagLevel: 'A'
      });
    }

    const score = Math.max(0, 100 - (violations.length * 20));
    
    return {
      score,
      level: score >= 90 ? 'AA' : score >= 70 ? 'A' : 'fail',
      violations,
      suggestions,
      keyboardNavigable: content.includes('onKeyDown') || content.includes('tabIndex'),
      screenReaderFriendly: content.includes('aria-') || content.includes('role=')
    };
  }

  private calculateComponentComplexity(content: string): ComponentComplexity {
    const lines = content.split('\n').length;
    const dependencies = (content.match(/import\s+.*from/g) || []).length;
    const props = (content.match(/props\.\w+/g) || []).length;
    const states = (content.match(/useState|this\.state/g) || []).length;
    const effects = (content.match(/useEffect|componentDidMount|componentDidUpdate/g) || []).length;
    
    // Simplified complexity calculation
    const cyclomatic = Math.max(1, (content.match(/if|else|switch|case|for|while|\?/g) || []).length);
    const cognitive = cyclomatic + states + effects;
    
    const score = Math.min(100, (lines / 10) + (dependencies * 2) + (cognitive * 3));

    return {
      cyclomatic,
      cognitive,
      lines,
      dependencies,
      props,
      states,
      effects,
      score,
      recommendations: score > 50 ? ['Consider breaking this component into smaller pieces'] : []
    };
  }

  private async extractDocumentation(filePath: string, content: string): Promise<ComponentDocumentation | undefined> {
    const jsdocMatch = content.match(/\/\*\*(.*?)\*\//s);
    const description = jsdocMatch ? jsdocMatch[1].replace(/\*/g, '').trim() : undefined;

    const examples: CodeExample[] = [];
    const exampleMatches = content.match(/```(\w+)\n(.*?)```/gs);
    if (exampleMatches) {
      exampleMatches.forEach((match, index) => {
        const languageMatch = match.match(/```(\w+)/);
        const codeMatch = match.match(/```\w+\n(.*?)```/s);
        
        examples.push({
          title: `Example ${index + 1}`,
          code: codeMatch?.[1] || '',
          language: languageMatch?.[1] || 'javascript'
        });
      });
    }

    return {
      description,
      examples,
      propsDocumented: content.includes('@param') || content.includes('PropTypes'),
      testCoverage: await this.calculateTestCoverage(filePath)
    };
  }

  private async calculateTestCoverage(filePath: string): Promise<number | undefined> {
    // Look for corresponding test files
    const testPaths = [
      filePath.replace(/\.(jsx?|tsx?)$/, '.test.$1'),
      filePath.replace(/\.(jsx?|tsx?)$/, '.spec.$1'),
      path.join(path.dirname(filePath), '__tests__', path.basename(filePath))
    ];

    for (const testPath of testPaths) {
      if (await this.fileExists(testPath)) {
        return 80; // Simplified - would need actual coverage analysis
      }
    }

    return undefined;
  }

  private buildComponentHierarchy(components: UIComponent[]): void {
    // Build parent-child relationships based on import analysis
    for (const component of components) {
      // This would require more sophisticated import analysis
      // For now, we'll keep it simple
    }
  }

  private async extractDesignTokens(projectPath: string, components: UIComponent[]): Promise<DesignToken[]> {
    const tokens = new Map<string, DesignToken>();

    // Extract from component usage
    for (const component of components) {
      for (const token of component.designTokens) {
        const key = `${token.category}_${token.name}`;
        if (tokens.has(key)) {
          tokens.get(key)!.usageCount++;
        } else {
          tokens.set(key, { ...token });
        }
      }
    }

    // Look for design token files
    const tokenFiles = await this.findDesignTokenFiles(projectPath);
    for (const file of tokenFiles) {
      const fileTokens = await this.parseDesignTokenFile(file);
      for (const token of fileTokens) {
        const key = `${token.category}_${token.name}`;
        if (!tokens.has(key)) {
          tokens.set(key, token);
        }
      }
    }

    return Array.from(tokens.values());
  }

  private async findDesignTokenFiles(projectPath: string): Promise<string[]> {
    const files = await this.getAllFiles(projectPath);
    return files.filter(file => 
      file.includes('token') || 
      file.includes('theme') || 
      file.includes('design-system') ||
      file.endsWith('.tokens.js') ||
      file.endsWith('.theme.js')
    );
  }

  private async parseDesignTokenFile(filePath: string): Promise<DesignToken[]> {
    const tokens: DesignToken[] = [];
    const content = await fs.readFile(filePath, 'utf-8');

    // Parse different token file formats
    try {
      if (filePath.endsWith('.json')) {
        const data = JSON.parse(content);
        tokens.push(...this.parseTokensFromJSON(data));
      } else {
        tokens.push(...this.parseTokensFromJS(content));
      }
    } catch (error) {
      console.error(`Error parsing token file ${filePath}:`, error);
    }

    return tokens;
  }

  private parseTokensFromJSON(data: any, prefix = ''): DesignToken[] {
    const tokens: DesignToken[] = [];

    for (const [key, value] of Object.entries(data)) {
      const name = prefix ? `${prefix}.${key}` : key;
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        if ('value' in value) {
          // Design token format
          tokens.push({
            name,
            category: this.categorizeToken(name),
            value: value.value as string | number,
            description: (value as any).description,
            usageCount: 0
          });
        } else {
          // Nested object
          tokens.push(...this.parseTokensFromJSON(value, name));
        }
      } else if (typeof value === 'string' || typeof value === 'number') {
        tokens.push({
          name,
          category: this.categorizeToken(name),
          value,
          usageCount: 0
        });
      }
    }

    return tokens;
  }

  private parseTokensFromJS(content: string): DesignToken[] {
    const tokens: DesignToken[] = [];
    
    // Extract variable declarations
    const variablePattern = /(?:const|let|var)\s+(\w+)\s*=\s*['"`]([^'"`]+)['"`]/g;
    let match;

    while ((match = variablePattern.exec(content)) !== null) {
      tokens.push({
        name: match[1],
        category: this.categorizeToken(match[1]),
        value: match[2],
        usageCount: 0
      });
    }

    return tokens;
  }

  private async analyzeConsistency(components: UIComponent[], designTokens: DesignToken[]): Promise<ConsistencyReport> {
    const violations: ConsistencyViolation[] = [];
    
    // Analyze color consistency
    const colors = this.extractColorsFromComponents(components);
    const colorConsistency = this.calculateColorConsistency(colors, designTokens);

    // Analyze typography consistency
    const typography = this.extractTypographyFromComponents(components);
    const typographyConsistency = this.calculateTypographyConsistency(typography, designTokens);

    // Analyze spacing consistency
    const spacing = this.extractSpacingFromComponents(components);
    const spacingConsistency = this.calculateSpacingConsistency(spacing, designTokens);

    const score = (colorConsistency + typographyConsistency + spacingConsistency) / 3;

    return {
      score,
      colorConsistency,
      typographyConsistency,
      spacingConsistency,
      componentConsistency: this.calculateComponentConsistency(components),
      violations
    };
  }

  private extractColorsFromComponents(components: UIComponent[]): string[] {
    const colors = new Set<string>();
    
    for (const component of components) {
      for (const style of component.styleProperties) {
        if (style.property.includes('color') || style.property.includes('background')) {
          colors.add(style.value.toString());
        }
      }
    }

    return Array.from(colors);
  }

  private calculateColorConsistency(colors: string[], designTokens: DesignToken[]): number {
    const colorTokens = designTokens.filter(t => t.category === 'color');
    const tokenValues = new Set(colorTokens.map(t => t.value));
    
    const consistentColors = colors.filter(color => tokenValues.has(color));
    return colors.length > 0 ? (consistentColors.length / colors.length) * 100 : 100;
  }

  private extractTypographyFromComponents(components: UIComponent[]): string[] {
    const typography = new Set<string>();
    
    for (const component of components) {
      for (const style of component.styleProperties) {
        if (style.property.includes('font') || style.property.includes('text')) {
          typography.add(style.value.toString());
        }
      }
    }

    return Array.from(typography);
  }

  private calculateTypographyConsistency(typography: string[], designTokens: DesignToken[]): number {
    const typographyTokens = designTokens.filter(t => t.category === 'typography');
    const tokenValues = new Set(typographyTokens.map(t => t.value));
    
    const consistentTypography = typography.filter(typo => tokenValues.has(typo));
    return typography.length > 0 ? (consistentTypography.length / typography.length) * 100 : 100;
  }

  private extractSpacingFromComponents(components: UIComponent[]): string[] {
    const spacing = new Set<string>();
    
    for (const component of components) {
      for (const style of component.styleProperties) {
        if (style.property.includes('margin') || style.property.includes('padding') || style.property.includes('gap')) {
          spacing.add(style.value.toString());
        }
      }
    }

    return Array.from(spacing);
  }

  private calculateSpacingConsistency(spacing: string[], designTokens: DesignToken[]): number {
    const spacingTokens = designTokens.filter(t => t.category === 'spacing');
    const tokenValues = new Set(spacingTokens.map(t => t.value));
    
    const consistentSpacing = spacing.filter(space => tokenValues.has(space));
    return spacing.length > 0 ? (consistentSpacing.length / spacing.length) * 100 : 100;
  }

  private calculateComponentConsistency(components: UIComponent[]): number {
    // Analyze component naming patterns, prop consistency, etc.
    const componentsByType = new Map<ComponentType, UIComponent[]>();
    
    for (const component of components) {
      if (!componentsByType.has(component.type)) {
        componentsByType.set(component.type, []);
      }
      componentsByType.get(component.type)!.push(component);
    }

    let totalConsistency = 0;
    let typeCount = 0;

    for (const [type, comps] of Array.from(componentsByType.entries())) {
      if (comps.length > 1) {
        const consistency = this.calculateSimilarComponentConsistency(comps);
        totalConsistency += consistency;
        typeCount++;
      }
    }

    return typeCount > 0 ? totalConsistency / typeCount : 100;
  }

  private calculateSimilarComponentConsistency(components: UIComponent[]): number {
    // Compare prop patterns, naming conventions, etc.
    const propCounts = components.map(c => c.props.length);
    const avgProps = propCounts.reduce((a, b) => a + b, 0) / propCounts.length;
    const propVariance = propCounts.reduce((acc, count) => acc + Math.abs(count - avgProps), 0) / propCounts.length;
    
    return Math.max(0, 100 - (propVariance * 10)); // Simplified metric
  }

  private async analyzeAccessibility(components: UIComponent[]): Promise<SystemAccessibilityReport> {
    const componentScores: Record<string, number> = {};
    const allViolations: AccessibilityViolation[] = [];

    for (const component of components) {
      componentScores[component.id] = component.accessibility.score;
      allViolations.push(...component.accessibility.violations);
    }

    const scores = Object.values(componentScores);
    const overallScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 100;

    const wcagCompliance = {
      A: scores.filter(s => s >= 70).length,
      AA: scores.filter(s => s >= 90).length,
      AAA: scores.filter(s => s >= 95).length
    };

    return {
      overallScore,
      componentScores,
      commonViolations: this.findCommonViolations(allViolations),
      wcagCompliance,
      recommendations: this.generateAccessibilityRecommendations(allViolations)
    };
  }

  private findCommonViolations(violations: AccessibilityViolation[]): AccessibilityViolation[] {
    const violationCounts = new Map<string, { violation: AccessibilityViolation, count: number }>();

    for (const violation of violations) {
      const key = `${violation.rule}_${violation.severity}`;
      if (violationCounts.has(key)) {
        violationCounts.get(key)!.count++;
      } else {
        violationCounts.set(key, { violation, count: 1 });
      }
    }

    return Array.from(violationCounts.values())
      .filter(item => item.count >= 3)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(item => item.violation);
  }

  private generateAccessibilityRecommendations(violations: AccessibilityViolation[]): string[] {
    const recommendations = new Set<string>();

    for (const violation of violations) {
      switch (violation.rule) {
        case 'button-name':
          recommendations.add('Ensure all interactive elements have accessible names');
          break;
        case 'image-alt':
          recommendations.add('Provide alternative text for all images');
          break;
        case 'color-contrast':
          recommendations.add('Improve color contrast ratios for better readability');
          break;
      }
    }

    return Array.from(recommendations);
  }

  private async analyzePerformance(projectPath: string, components: UIComponent[]): Promise<PerformanceReport> {
    const bundleSize = await this.calculateBundleSize(projectPath);
    const renderTime = this.calculateAverageRenderTime(components);
    const unusedStyles = await this.findUnusedStyles(projectPath, components);
    const duplicateStyles = this.findDuplicateStyles(components);

    return {
      bundleSize,
      renderTime,
      unusedStyles: unusedStyles.length,
      duplicateStyles: duplicateStyles.length,
      suggestions: this.generatePerformanceSuggestions(bundleSize, unusedStyles, duplicateStyles)
    };
  }

  private async calculateBundleSize(projectPath: string): Promise<number> {
    // Would integrate with bundler analysis tools
    return 0; // Placeholder
  }

  private calculateAverageRenderTime(components: UIComponent[]): number {
    // Simplified calculation based on complexity
    const totalComplexity = components.reduce((acc, comp) => acc + comp.complexity.score, 0);
    return totalComplexity / components.length;
  }

  private async findUnusedStyles(projectPath: string, components: UIComponent[]): Promise<string[]> {
    // Would analyze CSS usage across components
    return []; // Placeholder
  }

  private findDuplicateStyles(components: UIComponent[]): string[] {
    const styleMap = new Map<string, number>();
    
    for (const component of components) {
      for (const style of component.styleProperties) {
        const key = `${style.property}:${style.value}`;
        styleMap.set(key, (styleMap.get(key) || 0) + 1);
      }
    }

    return Array.from(styleMap.entries())
      .filter(([, count]) => count > 3)
      .map(([style]) => style);
  }

  private generatePerformanceSuggestions(bundleSize: number, unusedStyles: string[], duplicateStyles: string[]): PerformanceSuggestion[] {
    const suggestions: PerformanceSuggestion[] = [];

    if (bundleSize > 1000000) { // 1MB
      suggestions.push({
        type: 'bundling',
        description: 'Bundle size is large, consider code splitting',
        impact: 'high',
        effort: 'moderate',
        implementation: 'Implement lazy loading and route-based code splitting'
      });
    }

    if (unusedStyles.length > 10) {
      suggestions.push({
        type: 'styling',
        description: 'Remove unused CSS to reduce bundle size',
        impact: 'medium',
        effort: 'easy',
        implementation: 'Use tools like PurgeCSS to remove unused styles'
      });
    }

    if (duplicateStyles.length > 5) {
      suggestions.push({
        type: 'styling',
        description: 'Extract common styles to design tokens',
        impact: 'medium',
        effort: 'moderate',
        implementation: 'Create shared style utilities and design tokens'
      });
    }

    return suggestions;
  }

  private async generateRecommendations(analysis: DesignSystemAnalysis): Promise<DesignRecommendation[]> {
    const recommendations: DesignRecommendation[] = [];

    // Consistency recommendations
    if (analysis.consistency.score < 80) {
      recommendations.push({
        category: 'consistency',
        title: 'Improve Design System Consistency',
        description: 'Standardize colors, typography, and spacing using design tokens',
        priority: 'high',
        effort: 'moderate',
        affectedComponents: analysis.components.map(c => c.id),
        implementation: [
          {
            step: 1,
            description: 'Create comprehensive design token system',
            verification: 'All colors, fonts, and spacing use tokens'
          },
          {
            step: 2,
            description: 'Update components to use design tokens',
            verification: 'Run consistency analysis shows >90% score'
          }
        ]
      });
    }

    // Accessibility recommendations
    if (analysis.accessibility.overallScore < 85) {
      recommendations.push({
        category: 'accessibility',
        title: 'Enhance Accessibility Compliance',
        description: 'Address common accessibility violations across components',
        priority: 'critical',
        effort: 'easy',
        affectedComponents: Object.keys(analysis.accessibility.componentScores).filter(
          id => analysis.accessibility.componentScores[id] < 85
        ),
        implementation: [
          {
            step: 1,
            description: 'Add missing ARIA labels and alt text',
            verification: 'All interactive elements have accessible names'
          },
          {
            step: 2,
            description: 'Improve color contrast ratios',
            verification: 'All text meets WCAG AA contrast requirements'
          }
        ]
      });
    }

    // Performance recommendations
    if (analysis.performance.bundleSize > 500000) {
      recommendations.push({
        category: 'performance',
        title: 'Optimize Bundle Size',
        description: 'Reduce JavaScript bundle size through code splitting and optimization',
        priority: 'medium',
        effort: 'moderate',
        affectedComponents: [],
        implementation: [
          {
            step: 1,
            description: 'Implement route-based code splitting',
            verification: 'Initial bundle size reduced by 30%'
          },
          {
            step: 2,
            description: 'Lazy load non-critical components',
            verification: 'Core interaction time improved'
          }
        ]
      });
    }

    return recommendations;
  }

  private calculateCoverage(components: UIComponent[]): DesignCoverage {
    const totalComponents = components.length;
    
    const componentsDocumented = components.filter(c => c.documentation?.description).length;
    const componentsWithTests = components.filter(c => c.documentation?.testCoverage).length;
    const componentsWithStories = components.filter(c => c.documentation?.storybookStory).length;
    const designTokenUsage = components.filter(c => c.designTokens.length > 0).length;
    const accessibilityCompliant = components.filter(c => c.accessibility.score >= 85).length;
    const responsiveComponents = components.filter(c => 
      c.styleProperties.some(s => s.responsive && s.responsive.length > 0)
    ).length;

    const coverageScore = totalComponents > 0 ? (
      (componentsDocumented + componentsWithTests + designTokenUsage + accessibilityCompliant) / 
      (totalComponents * 4)
    ) * 100 : 100;

    return {
      componentsDocumented,
      componentsWithTests,
      componentsWithStories,
      designTokenUsage,
      accessibilityCompliant,
      responsiveComponents,
      totalComponents,
      coverageScore
    };
  }

  private calculateDesignSystemScore(analysis: DesignSystemAnalysis): number {
    const weights = {
      consistency: 0.3,
      accessibility: 0.3,
      performance: 0.2,
      coverage: 0.2
    };

    const performanceScore = Math.max(0, 100 - (analysis.performance.bundleSize / 10000));

    return (
      analysis.consistency.score * weights.consistency +
      analysis.accessibility.overallScore * weights.accessibility +
      performanceScore * weights.performance +
      analysis.coverage.coverageScore * weights.coverage
    );
  }

  // Utility methods
  private generateAnalysisId(): string {
    return `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateComponentId(filePath: string): string {
    return `comp_${path.basename(filePath, path.extname(filePath))}_${Math.random().toString(36).substr(2, 6)}`;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async getAllFiles(dir: string, exclude: string[] = []): Promise<string[]> {
    const files: string[] = [];
    const items = await fs.readdir(dir, { withFileTypes: true });

    for (const item of items) {
      if (exclude.some(ex => item.name.includes(ex))) continue;

      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        files.push(...await this.getAllFiles(fullPath, exclude));
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  private createEmptyConsistencyReport(): ConsistencyReport {
    return {
      score: 0,
      colorConsistency: 0,
      typographyConsistency: 0,
      spacingConsistency: 0,
      componentConsistency: 0,
      violations: []
    };
  }

  private createEmptyAccessibilityReport(): SystemAccessibilityReport {
    return {
      overallScore: 0,
      componentScores: {},
      commonViolations: [],
      wcagCompliance: { A: 0, AA: 0, AAA: 0 },
      recommendations: []
    };
  }

  private createEmptyPerformanceReport(): PerformanceReport {
    return {
      bundleSize: 0,
      renderTime: 0,
      unusedStyles: 0,
      duplicateStyles: 0,
      suggestions: []
    };
  }

  private createEmptyCoverage(): DesignCoverage {
    return {
      componentsDocumented: 0,
      componentsWithTests: 0,
      componentsWithStories: 0,
      designTokenUsage: 0,
      accessibilityCompliant: 0,
      responsiveComponents: 0,
      totalComponents: 0,
      coverageScore: 0
    };
  }

  // Public API methods
  async getHealthStatus(): Promise<any> {
    return {
      status: 'healthy',
      activeAnalyses: this.activeAnalyses.size,
      totalAnalysesCompleted: this.analysisHistory.length,
      lastAnalysisTime: this.analysisHistory.length > 0 ? this.analysisHistory[this.analysisHistory.length - 1].endTime : null,
      supportedFrameworks: this.config.frameworks
    };
  }

  async listAnalyses(): Promise<DesignSystemAnalysis[]> {
    return this.analysisHistory.slice(-10);
  }

  async getAnalysisResult(analysisId: string): Promise<DesignSystemAnalysis | null> {
    return this.analysisHistory.find(analysis => analysis.id === analysisId) || null;
  }

  async getComponentById(componentId: string): Promise<UIComponent | null> {
    for (const analysis of this.analysisHistory) {
      const component = analysis.components.find(c => c.id === componentId);
      if (component) return component;
    }
    return null;
  }

  async generateComponentReport(componentId: string): Promise<string> {
    const component = await this.getComponentById(componentId);
    if (!component) {
      throw new MCPError('COMPONENT_NOT_FOUND', `Component ${componentId} not found`);
    }

    return JSON.stringify({
      component,
      analysis: {
        complexity: component.complexity,
        accessibility: component.accessibility,
        designTokenUsage: component.designTokens.length,
        recommendations: this.generateComponentRecommendations(component)
      }
    }, null, 2);
  }

  private generateComponentRecommendations(component: UIComponent): string[] {
    const recommendations: string[] = [];

    if (component.complexity.score > 50) {
      recommendations.push('Consider breaking this component into smaller, more focused components');
    }

    if (component.accessibility.score < 85) {
      recommendations.push('Improve accessibility by addressing violations and adding ARIA labels');
    }

    if (component.designTokens.length === 0) {
      recommendations.push('Use design tokens for consistent styling across the design system');
    }

    if (!component.documentation?.description) {
      recommendations.push('Add documentation to help other developers understand this component');
    }

    return recommendations;
  }
}

// UI Design MCP Server
export class UIDesignServer extends BaseMCPServer {
  private uiDesignService: UIDesignService;
  
  // Memory optimization: Enable garbage collection and monitoring
  private memoryMonitorInterval: NodeJS.Timeout | null = null;

  constructor() {
    const config = {
      name: 'ui-design-server',
      port: parseInt(process.env.UI_DESIGN_PORT || '3017'),
      enableCors: true,
      enableSecurity: true,
      healthCheck: {
        enabled: true,
        path: '/health',
        interval: 30000
      }
    };

    super(config);

    // Default UI analysis configuration
    const defaultConfig: UIAnalysisConfig = {
      frameworks: ['react', 'vue', 'angular', 'html_css'],
      componentTypes: ['atom', 'molecule', 'organism', 'template'],
      includeAccessibility: true,
      includePerformance: true,
      includeDesignTokens: true,
      excludePatterns: ['node_modules', '.git', 'dist', 'build'],
      designSystemRules: []
    };

    this.uiDesignService = new UIDesignService(defaultConfig);
  }

  protected async initialize(): Promise<void> {
    this.setupUIDesignRoutes();
    this.startMemoryMonitoring();
  }

  protected async cleanup(): Promise<void> {
    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
      this.memoryMonitorInterval = null;
    }
    
    // Clear caches to free memory
    if (this.uiDesignService) {
      this.uiDesignService.clearCaches();
    }
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }
  
  private startMemoryMonitoring(): void {
    this.memoryMonitorInterval = setInterval(() => {
      const memUsage = process.memoryUsage();
      const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
      const rssMB = Math.round(memUsage.rss / 1024 / 1024);
      
      // Log memory usage
      console.log(`[UI Design] Memory: Heap ${heapUsedMB}/${heapTotalMB}MB, RSS: ${rssMB}MB`);
      
      // Trigger GC if memory usage is high
      if (heapUsedMB > 50 && global.gc) {
        console.log('[UI Design] Triggering garbage collection...');
        global.gc();
      }
      
      // Clear caches if memory usage is critical
      if (heapUsedMB > 80) {
        console.log('[UI Design] Memory critical, clearing caches...');
        this.uiDesignService.clearCaches();
      }
    }, 30000); // Check every 30 seconds
  }

  private setupUIDesignRoutes(): void {
    // Health check
    this.addRoute('get', '/health', async (req, res) => {
      try {
        const health = await this.uiDesignService.getHealthStatus();
        res.json(health);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Analyze design system
    this.addRoute('post', '/api/analyze', async (req, res) => {
      try {
        const { projectPath, config } = req.body;
        if (!projectPath) {
          return res.status(400).json({ error: 'projectPath is required' });
        }

        const result = await this.uiDesignService.analyzeDesignSystem(projectPath, config);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // List analyses
    this.addRoute('get', '/api/analyses', async (req, res) => {
      try {
        const analyses = await this.uiDesignService.listAnalyses();
        res.json(analyses);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Get analysis result
    this.addRoute('get', '/api/analyses/:analysisId', async (req, res) => {
      try {
        const { analysisId } = req.params;
        const analysis = await this.uiDesignService.getAnalysisResult(analysisId);
        if (!analysis) {
          return res.status(404).json({ error: 'Analysis not found' });
        }
        res.json(analysis);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Get component details
    this.addRoute('get', '/api/components/:componentId', async (req, res) => {
      try {
        const { componentId } = req.params;
        const component = await this.uiDesignService.getComponentById(componentId);
        if (!component) {
          return res.status(404).json({ error: 'Component not found' });
        }
        res.json(component);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Generate component report
    this.addRoute('get', '/api/components/:componentId/report', async (req, res) => {
      try {
        const { componentId } = req.params;
        const report = await this.uiDesignService.generateComponentReport(componentId);
        res.set('Content-Type', 'application/json');
        res.send(report);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // MCP Tools endpoint
    this.addRoute('get', '/api/tools', async (req, res) => {
      res.json({
        tools: [
          {
            name: 'analyze_design_system',
            description: 'Perform comprehensive UI design system analysis',
            parameters: {
              type: 'object',
              properties: {
                projectPath: { type: 'string', description: 'Path to the project to analyze' },
                frameworks: {
                  type: 'array',
                  items: { enum: ['react', 'vue', 'angular', 'svelte', 'flutter', 'react_native', 'swift_ui', 'android_compose', 'html_css', 'web_components'] },
                  description: 'UI frameworks to analyze'
                },
                includeAccessibility: { type: 'boolean', description: 'Include accessibility analysis', default: true },
                includePerformance: { type: 'boolean', description: 'Include performance analysis', default: true }
              },
              required: ['projectPath']
            }
          },
          {
            name: 'get_component_details',
            description: 'Get detailed information about a specific UI component',
            parameters: {
              type: 'object',
              properties: {
                componentId: { type: 'string', description: 'ID of the component to analyze' }
              },
              required: ['componentId']
            }
          },
          {
            name: 'check_design_consistency',
            description: 'Check design system consistency across components',
            parameters: {
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
          },
          {
            name: 'analyze_accessibility_compliance',
            description: 'Analyze WCAG accessibility compliance across UI components',
            parameters: {
              type: 'object',
              properties: {
                projectPath: { type: 'string', description: 'Path to the project to analyze' },
                wcagLevel: { type: 'string', enum: ['A', 'AA', 'AAA'], description: 'WCAG compliance level to check', default: 'AA' }
              },
              required: ['projectPath']
            }
          },
          {
            name: 'extract_design_tokens',
            description: 'Extract and catalog design tokens from the project',
            parameters: {
              type: 'object',
              properties: {
                projectPath: { type: 'string', description: 'Path to the project to analyze' },
                tokenTypes: {
                  type: 'array',
                  items: { enum: ['color', 'typography', 'spacing', 'shadow', 'border', 'motion', 'layout'] },
                  description: 'Types of design tokens to extract'
                }
              },
              required: ['projectPath']
            }
          },
          {
            name: 'generate_component_documentation',
            description: 'Generate documentation for UI components',
            parameters: {
              type: 'object',
              properties: {
                componentId: { type: 'string', description: 'ID of the component to document' },
                includeExamples: { type: 'boolean', description: 'Include code examples', default: true },
                includeProps: { type: 'boolean', description: 'Include prop documentation', default: true }
              },
              required: ['componentId']
            }
          },
          {
            name: 'suggest_design_improvements',
            description: 'Generate AI-powered design improvement suggestions',
            parameters: {
              type: 'object',
              properties: {
                analysisId: { type: 'string', description: 'ID of the design system analysis' },
                priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'], description: 'Minimum priority level for suggestions' }
              },
              required: ['analysisId']
            }
          },
          {
            name: 'validate_responsive_design',
            description: 'Validate responsive design implementation across breakpoints',
            parameters: {
              type: 'object',
              properties: {
                componentId: { type: 'string', description: 'ID of the component to validate' },
                breakpoints: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Breakpoints to validate (e.g., mobile, tablet, desktop)'
                }
              },
              required: ['componentId']
            }
          }
        ]
      });
    });
  }

  // MCP tool implementations
  async callTool(toolName: string, parameters: any): Promise<any> {
    switch (toolName) {
      case 'analyze_design_system':
        return this.uiDesignService.analyzeDesignSystem(parameters.projectPath, {
          frameworks: parameters.frameworks,
          includeAccessibility: parameters.includeAccessibility,
          includePerformance: parameters.includePerformance
        });

      case 'get_component_details':
        return this.uiDesignService.getComponentById(parameters.componentId);

      case 'check_design_consistency':
        const analysis = await this.uiDesignService.analyzeDesignSystem(parameters.projectPath, {
          frameworks: ['react', 'vue', 'angular'] // Default frameworks
        });
        return {
          consistency: analysis.consistency,
          focusAreas: parameters.focusAreas,
          recommendations: analysis.recommendations.filter(r => r.category === 'consistency')
        };

      case 'analyze_accessibility_compliance':
        const accessibilityAnalysis = await this.uiDesignService.analyzeDesignSystem(parameters.projectPath, {
          includeAccessibility: true
        });
        return {
          accessibility: accessibilityAnalysis.accessibility,
          wcagLevel: parameters.wcagLevel,
          compliance: accessibilityAnalysis.accessibility.wcagCompliance
        };

      case 'extract_design_tokens':
        const tokenAnalysis = await this.uiDesignService.analyzeDesignSystem(parameters.projectPath, {
          includeDesignTokens: true
        });
        return {
          designTokens: tokenAnalysis.designTokens.filter(token => 
            !parameters.tokenTypes || parameters.tokenTypes.includes(token.category)
          ),
          usage: tokenAnalysis.designTokens.reduce((acc, token) => acc + token.usageCount, 0)
        };

      case 'generate_component_documentation':
        return this.uiDesignService.generateComponentReport(parameters.componentId);

      case 'suggest_design_improvements':
        const suggestionAnalysis = await this.uiDesignService.getAnalysisResult(parameters.analysisId);
        if (!suggestionAnalysis) {
          throw new MCPError('ANALYSIS_NOT_FOUND', `Analysis ${parameters.analysisId} not found`);
        }
        return {
          recommendations: suggestionAnalysis.recommendations.filter(r => 
            !parameters.priority || this.comparePriority(r.priority, parameters.priority) >= 0
          )
        };

      case 'validate_responsive_design':
        const component = await this.uiDesignService.getComponentById(parameters.componentId);
        if (!component) {
          throw new MCPError('COMPONENT_NOT_FOUND', `Component ${parameters.componentId} not found`);
        }
        return {
          component: component.name,
          responsive: component.styleProperties.filter(s => s.responsive && s.responsive.length > 0),
          breakpoints: parameters.breakpoints,
          isResponsive: component.styleProperties.some(s => s.responsive && s.responsive.length > 0)
        };

      default:
        throw new MCPError('UNKNOWN_TOOL', `Unknown tool: ${toolName}`);
    }
  }

  private comparePriority(p1: string, p2: string): number {
    const priorityOrder = { critical: 3, high: 2, medium: 1, low: 0 };
    return priorityOrder[p1] - priorityOrder[p2];
  }

  async listTools(): Promise<any[]> {
    const response = await fetch(`http://localhost:${this.config.port}/api/tools`);
    const data = await response.json();
    return data.tools;
  }
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new UIDesignServer();
  server.start().catch(console.error);
}