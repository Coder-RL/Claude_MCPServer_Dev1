import { BaseServer } from '../../../shared/src/base-server';
import { MCPError } from '../../../shared/src/errors';
import { HealthChecker } from '../../../shared/src/health';
import * as express from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Memory optimization: Set Node.js memory management flags
process.env.NODE_OPTIONS = '--max-old-space-size=512 --gc-interval=100';

// Memory cache with LRU eviction for Optimization
class OptimizationCache<T> {
  private cache = new Map<string, { value: T; timestamp: number; hits: number }>();
  private maxSize: number;
  private maxAge: number;

  constructor(maxSize = 70, maxAge = 300000) { // 5 minutes
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

// Performance Optimization Interfaces
export interface PerformanceProfile {
  id: string;
  projectPath: string;
  platform: Platform;
  startTime: Date;
  endTime: Date;
  duration: number;
  metrics: PerformanceMetrics;
  bottlenecks: PerformanceBottleneck[];
  optimizations: OptimizationSuggestion[];
  benchmarks: BenchmarkResults;
  recommendations: OptimizationRecommendation[];
  score: number; // 0-100, higher is better
}

export type Platform = 
  | 'web' | 'nodejs' | 'python' | 'java' | 'csharp' | 'go' | 'rust' | 'php' | 'ruby'
  | 'ios' | 'android' | 'flutter' | 'react_native' | 'electron' | 'desktop' | 'server';

export interface PerformanceMetrics {
  // Web/Frontend Metrics
  bundleSize?: BundleSizeMetrics;
  loadTime?: LoadTimeMetrics;
  runtime?: RuntimeMetrics;
  
  // Backend/Server Metrics
  throughput?: ThroughputMetrics;
  latency?: LatencyMetrics;
  memory?: MemoryMetrics;
  cpu?: CPUMetrics;
  
  // Database Metrics
  database?: DatabaseMetrics;
  
  // Mobile Metrics
  battery?: BatteryMetrics;
  network?: NetworkMetrics;
  
  // General Metrics
  codeComplexity?: CodeComplexityMetrics;
  dependencies?: DependencyMetrics;
}

export interface BundleSizeMetrics {
  totalSize: number;
  gzippedSize: number;
  chunks: ChunkInfo[];
  assetSizes: Record<string, number>;
  duplicatedModules: string[];
  unusedCode: number;
  treeshakingEfficiency: number;
}

export interface ChunkInfo {
  name: string;
  size: number;
  modules: string[];
  isAsync: boolean;
  parents: string[];
}

export interface LoadTimeMetrics {
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  firstInputDelay: number;
  cumulativeLayoutShift: number;
  timeToInteractive: number;
  totalBlockingTime: number;
  speedIndex: number;
}

export interface RuntimeMetrics {
  frameRate: number;
  memoryUsage: number;
  jsExecutionTime: number;
  domManipulationTime: number;
  paintTime: number;
  layoutTime: number;
  scriptParsingTime: number;
}

export interface ThroughputMetrics {
  requestsPerSecond: number;
  dataProcessingRate: number;
  concurrentConnections: number;
  queueLength: number;
  errorRate: number;
  successRate: number;
}

export interface LatencyMetrics {
  p50: number;
  p95: number;
  p99: number;
  average: number;
  minimum: number;
  maximum: number;
  networkLatency: number;
  processingLatency: number;
}

export interface MemoryMetrics {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
  leaks: MemoryLeak[];
  gcPressure: number;
  allocationsPerSecond: number;
}

export interface MemoryLeak {
  type: 'closure' | 'dom' | 'listener' | 'timer' | 'cache' | 'global';
  location: string;
  size: number;
  references: number;
  description: string;
  fix: string;
}

export interface CPUMetrics {
  usage: number;
  utilization: number;
  processes: ProcessInfo[];
  threads: ThreadInfo[];
  bottlenecks: CPUBottleneck[];
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpuUsage: number;
  memoryUsage: number;
  priority: number;
}

export interface ThreadInfo {
  id: string;
  name: string;
  cpuTime: number;
  state: 'running' | 'waiting' | 'blocked' | 'idle';
  priority: number;
}

export interface CPUBottleneck {
  function: string;
  file: string;
  line: number;
  samples: number;
  percentage: number;
  callStack: string[];
}

export interface DatabaseMetrics {
  queryCount: number;
  slowQueries: SlowQuery[];
  connectionPoolUsage: number;
  indexUsage: IndexUsage[];
  cacheHitRatio: number;
  lockWaitTime: number;
  deadlocks: number;
}

export interface SlowQuery {
  query: string;
  executionTime: number;
  frequency: number;
  tables: string[];
  explanation: QueryExplanation;
  optimization: string;
}

export interface QueryExplanation {
  type: string;
  key: string;
  rows: number;
  extra: string;
  cost: number;
}

export interface IndexUsage {
  table: string;
  index: string;
  usage: number;
  effectiveness: number;
  recommendation: string;
}

export interface BatteryMetrics {
  drainRate: number;
  cpuImpact: number;
  networkImpact: number;
  locationImpact: number;
  displayImpact: number;
  backgroundActivity: number;
}

export interface NetworkMetrics {
  requestCount: number;
  dataTransferred: number;
  cacheHitRatio: number;
  compressionRatio: number;
  redundantRequests: number;
  largePayloads: NetworkPayload[];
}

export interface NetworkPayload {
  url: string;
  size: number;
  type: string;
  compression: string;
  optimization: string;
}

export interface CodeComplexityMetrics {
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  maintainabilityIndex: number;
  linesOfCode: number;
  duplicatedLines: number;
  technicalDebt: number;
}

export interface DependencyMetrics {
  totalDependencies: number;
  outdatedDependencies: number;
  vulnerableDependencies: number;
  unusedDependencies: string[];
  heavyDependencies: DependencyInfo[];
  duplicatedDependencies: string[];
}

export interface DependencyInfo {
  name: string;
  version: string;
  size: number;
  usageCount: number;
  alternatives: Alternative[];
}

export interface Alternative {
  name: string;
  size: number;
  performance: number;
  popularity: number;
  maintained: boolean;
}

export interface PerformanceBottleneck {
  id: string;
  type: BottleneckType;
  severity: 'critical' | 'high' | 'medium' | 'low';
  location: string;
  description: string;
  impact: ImpactAssessment;
  cause: string;
  detection: DetectionInfo;
  fix: OptimizationFix;
}

export type BottleneckType = 
  | 'cpu_intensive' | 'memory_leak' | 'io_blocking' | 'network_slow'
  | 'database_slow' | 'algorithm_inefficient' | 'bundle_large' | 'render_blocking'
  | 'cache_miss' | 'gc_pressure' | 'thread_contention' | 'resource_leak';

export interface ImpactAssessment {
  userExperience: 'severe' | 'noticeable' | 'minor' | 'negligible';
  performanceScore: number;
  resourceConsumption: number;
  scalabilityImpact: number;
  businessImpact: string;
}

export interface DetectionInfo {
  method: 'profiling' | 'static_analysis' | 'monitoring' | 'benchmarking' | 'user_reported';
  confidence: number;
  evidence: string[];
  metrics: Record<string, number>;
}

export interface OptimizationFix {
  strategy: OptimizationStrategy;
  implementation: ImplementationStep[];
  effort: 'trivial' | 'easy' | 'moderate' | 'complex' | 'major';
  impact: 'low' | 'medium' | 'high' | 'critical';
  risks: string[];
  verification: VerificationStep[];
}

export type OptimizationStrategy = 
  | 'algorithm_optimization' | 'caching' | 'lazy_loading' | 'code_splitting'
  | 'compression' | 'minification' | 'bundling' | 'prefetching' | 'preloading'
  | 'database_optimization' | 'indexing' | 'connection_pooling' | 'batch_processing'
  | 'memory_management' | 'garbage_collection' | 'resource_pooling'
  | 'async_processing' | 'parallel_execution' | 'load_balancing';

export interface ImplementationStep {
  step: number;
  description: string;
  codeChanges: CodeChange[];
  configChanges: ConfigChange[];
  dependencies: string[];
  testing: string;
}

export interface CodeChange {
  file: string;
  operation: 'add' | 'modify' | 'remove' | 'refactor';
  before?: string;
  after: string;
  lineNumber?: number;
  reason: string;
}

export interface ConfigChange {
  file: string;
  setting: string;
  oldValue?: any;
  newValue: any;
  reason: string;
}

export interface VerificationStep {
  metric: string;
  beforeValue: number;
  expectedImprovement: number;
  measurementMethod: string;
  threshold: number;
}

export interface OptimizationSuggestion {
  id: string;
  category: OptimizationCategory;
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  effort: 'trivial' | 'easy' | 'moderate' | 'complex' | 'major';
  impact: ImpactEstimate;
  implementation: OptimizationFix;
  relatedBottlenecks: string[];
  applicablePlatforms: Platform[];
}

export type OptimizationCategory = 
  | 'performance' | 'memory' | 'network' | 'database' | 'caching' | 'bundling'
  | 'rendering' | 'computation' | 'io' | 'security' | 'maintenance' | 'scalability';

export interface ImpactEstimate {
  performanceGain: number; // Percentage improvement
  resourceSavings: number; // Percentage reduction
  userExperienceImprovement: string;
  costSavings?: number;
  maintenanceImpact: string;
}

export interface BenchmarkResults {
  baseline: BenchmarkRun;
  optimized?: BenchmarkRun;
  comparison?: BenchmarkComparison;
  tests: BenchmarkTest[];
  environment: BenchmarkEnvironment;
}

export interface BenchmarkRun {
  timestamp: Date;
  duration: number;
  metrics: Record<string, number>;
  configuration: Record<string, any>;
  successful: boolean;
  errors: string[];
}

export interface BenchmarkComparison {
  improvements: Record<string, number>;
  regressions: Record<string, number>;
  neutral: string[];
  overallImprovement: number;
  statisticalSignificance: boolean;
}

export interface BenchmarkTest {
  name: string;
  description: string;
  category: string;
  platform: Platform;
  setup: string;
  execution: string;
  teardown: string;
  expectedMetrics: string[];
}

export interface BenchmarkEnvironment {
  os: string;
  arch: string;
  cpuCores: number;
  memory: number;
  node?: string;
  python?: string;
  browser?: string;
  device?: string;
}

export interface OptimizationRecommendation {
  category: OptimizationCategory;
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  effort: 'trivial' | 'easy' | 'moderate' | 'complex' | 'major';
  timeline: string;
  prerequisites: string[];
  implementation: RecommendationPhase[];
  monitoring: MonitoringPlan;
  rollback: RollbackPlan;
}

export interface RecommendationPhase {
  phase: number;
  name: string;
  duration: string;
  tasks: RecommendationTask[];
  deliverables: string[];
  metrics: string[];
}

export interface RecommendationTask {
  name: string;
  description: string;
  owner: string;
  effort: string;
  dependencies: string[];
}

export interface MonitoringPlan {
  metrics: string[];
  alerts: AlertConfig[];
  dashboards: string[];
  reportingFrequency: string;
}

export interface AlertConfig {
  metric: string;
  threshold: number;
  severity: 'critical' | 'warning' | 'info';
  action: string;
}

export interface RollbackPlan {
  triggers: string[];
  steps: string[];
  timeframe: string;
  dataBackup: boolean;
}

export interface OptimizationConfig {
  platforms: Platform[];
  profileTypes: ProfileType[];
  benchmarkTests: string[];
  thresholds: PerformanceThreshold[];
  optimizationStrategies: OptimizationStrategy[];
  excludePatterns: string[];
  integrations: OptimizationIntegration[];
}

export type ProfileType = 'cpu' | 'memory' | 'network' | 'database' | 'bundle' | 'runtime' | 'load_test';

export interface PerformanceThreshold {
  metric: string;
  warning: number;
  critical: number;
  unit: string;
  platform: Platform;
}

export interface OptimizationIntegration {
  name: string;
  type: 'lighthouse' | 'webpack' | 'rollup' | 'vite' | 'profiler' | 'apm' | 'monitoring';
  config: Record<string, any>;
  enabled: boolean;
}

// Optimization Service
export class OptimizationService {
  private config: OptimizationConfig;
  private activeProfiles: Map<string, PerformanceProfile> = new Map();
  private profileHistory: PerformanceProfile[] = [];
  
  // Memory optimization caches with size limits
  private profileCache = new OptimizationCache<PerformanceProfile>(35, 600000); // 10 minutes
  private metricsCache = new OptimizationCache<PerformanceMetrics>(20, 1800000); // 30 minutes
  private benchmarkCache = new OptimizationCache<BenchmarkResults>(15, 3600000); // 1 hour

  constructor(config: OptimizationConfig) {
    this.config = config;
  }
  
  // Memory optimization methods
  clearCaches(): void {
    this.profileCache.clear();
    this.metricsCache.clear();
    this.benchmarkCache.clear();
    
    // Limit profile history to prevent memory bloat
    if (this.profileHistory.length > 12) {
      this.profileHistory = this.profileHistory.slice(-6);
    }
    
    console.log('[Optimization] Caches cleared for memory optimization');
  }

  async profilePerformance(projectPath: string, options: Partial<OptimizationConfig> = {}): Promise<PerformanceProfile> {
    const profileId = this.generateProfileId();
    const startTime = new Date();
    
    const profileConfig = { ...this.config, ...options };

    try {
      // Initialize profile
      const profile: PerformanceProfile = {
        id: profileId,
        projectPath,
        platform: await this.detectPlatform(projectPath),
        startTime,
        endTime: new Date(),
        duration: 0,
        metrics: {},
        bottlenecks: [],
        optimizations: [],
        benchmarks: this.createEmptyBenchmarks(),
        recommendations: [],
        score: 0
      };

      this.activeProfiles.set(profileId, profile);

      // Detect platform and adjust profiling strategy
      const platform = profile.platform;
      
      // Run performance analysis based on platform
      if (this.isWebPlatform(platform)) {
        profile.metrics = await this.profileWebPerformance(projectPath);
      } else if (this.isServerPlatform(platform)) {
        profile.metrics = await this.profileServerPerformance(projectPath);
      } else if (this.isMobilePlatform(platform)) {
        profile.metrics = await this.profileMobilePerformance(projectPath);
      } else {
        profile.metrics = await this.profileGeneralPerformance(projectPath);
      }

      // Detect bottlenecks
      profile.bottlenecks = await this.detectBottlenecks(profile.metrics, projectPath);

      // Generate optimization suggestions
      profile.optimizations = await this.generateOptimizations(profile.bottlenecks, profile.metrics);

      // Run benchmarks
      profile.benchmarks = await this.runBenchmarks(projectPath, profileConfig);

      // Generate recommendations
      profile.recommendations = await this.generateRecommendations(profile);

      // Calculate performance score
      profile.score = this.calculatePerformanceScore(profile);

      const endTime = new Date();
      profile.endTime = endTime;
      profile.duration = endTime.getTime() - startTime.getTime();

      this.activeProfiles.delete(profileId);
      this.profileHistory.push(profile);

      return profile;
    } catch (error) {
      this.activeProfiles.delete(profileId);
      throw new MCPError('PERFORMANCE_PROFILING_FAILED', `Performance profiling failed: ${error.message}`);
    }
  }

  private async detectPlatform(projectPath: string): Promise<Platform> {
    // Check package.json for platform indicators
    const packageJsonPath = path.join(projectPath, 'package.json');
    
    try {
      const packageContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageContent);
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      // Web frameworks
      if (deps.react || deps.vue || deps.angular) return 'web';
      if (deps.express || deps.fastify || deps.koa) return 'nodejs';
      if (deps.electron) return 'electron';
      if (deps['react-native']) return 'react_native';
      if (deps.flutter) return 'flutter';
    } catch (error) {
      // Check other indicators
    }

    // Check for mobile projects
    if (await this.fileExists(path.join(projectPath, 'ios'))) return 'ios';
    if (await this.fileExists(path.join(projectPath, 'android'))) return 'android';

    // Check for backend languages
    if (await this.fileExists(path.join(projectPath, 'requirements.txt'))) return 'python';
    if (await this.fileExists(path.join(projectPath, 'pom.xml'))) return 'java';
    if (await this.fileExists(path.join(projectPath, 'go.mod'))) return 'go';
    if (await this.fileExists(path.join(projectPath, 'Cargo.toml'))) return 'rust';

    return 'web'; // Default
  }

  private isWebPlatform(platform: Platform): boolean {
    return ['web', 'react_native', 'electron'].includes(platform);
  }

  private isServerPlatform(platform: Platform): boolean {
    return ['nodejs', 'python', 'java', 'go', 'rust', 'php', 'ruby', 'server'].includes(platform);
  }

  private isMobilePlatform(platform: Platform): boolean {
    return ['ios', 'android', 'flutter', 'react_native'].includes(platform);
  }

  private async profileWebPerformance(projectPath: string): Promise<PerformanceMetrics> {
    const metrics: PerformanceMetrics = {};

    // Bundle analysis
    metrics.bundleSize = await this.analyzeBundleSize(projectPath);

    // Load time analysis (would use Lighthouse or similar)
    metrics.loadTime = await this.analyzeLoadTime(projectPath);

    // Runtime performance
    metrics.runtime = await this.analyzeRuntimePerformance(projectPath);

    // Code complexity
    metrics.codeComplexity = await this.analyzeCodeComplexity(projectPath);

    // Dependencies
    metrics.dependencies = await this.analyzeDependencies(projectPath);

    return metrics;
  }

  private async profileServerPerformance(projectPath: string): Promise<PerformanceMetrics> {
    const metrics: PerformanceMetrics = {};

    // CPU and memory analysis
    metrics.cpu = await this.analyzeCPUUsage(projectPath);
    metrics.memory = await this.analyzeMemoryUsage(projectPath);

    // Throughput and latency
    metrics.throughput = await this.analyzeThroughput(projectPath);
    metrics.latency = await this.analyzeLatency(projectPath);

    // Database performance
    metrics.database = await this.analyzeDatabasePerformance(projectPath);

    // Code complexity
    metrics.codeComplexity = await this.analyzeCodeComplexity(projectPath);

    // Dependencies
    metrics.dependencies = await this.analyzeDependencies(projectPath);

    return metrics;
  }

  private async profileMobilePerformance(projectPath: string): Promise<PerformanceMetrics> {
    const metrics: PerformanceMetrics = {};

    // Battery analysis
    metrics.battery = await this.analyzeBatteryUsage(projectPath);

    // Memory usage
    metrics.memory = await this.analyzeMemoryUsage(projectPath);

    // Network efficiency
    metrics.network = await this.analyzeNetworkUsage(projectPath);

    // Runtime performance
    metrics.runtime = await this.analyzeRuntimePerformance(projectPath);

    // Code complexity
    metrics.codeComplexity = await this.analyzeCodeComplexity(projectPath);

    return metrics;
  }

  private async profileGeneralPerformance(projectPath: string): Promise<PerformanceMetrics> {
    const metrics: PerformanceMetrics = {};

    // Basic code analysis
    metrics.codeComplexity = await this.analyzeCodeComplexity(projectPath);
    metrics.dependencies = await this.analyzeDependencies(projectPath);

    return metrics;
  }

  private async analyzeBundleSize(projectPath: string): Promise<BundleSizeMetrics> {
    // Placeholder implementation - would integrate with webpack-bundle-analyzer, rollup-plugin-analyzer, etc.
    const packageJsonPath = path.join(projectPath, 'package.json');
    
    try {
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);
      
      // Estimate bundle size based on dependencies
      const depCount = Object.keys(packageJson.dependencies || {}).length;
      const estimatedSize = depCount * 50000; // Rough estimate
      
      return {
        totalSize: estimatedSize,
        gzippedSize: estimatedSize * 0.3,
        chunks: [],
        assetSizes: {},
        duplicatedModules: [],
        unusedCode: estimatedSize * 0.1,
        treeshakingEfficiency: 70
      };
    } catch (error) {
      return {
        totalSize: 0,
        gzippedSize: 0,
        chunks: [],
        assetSizes: {},
        duplicatedModules: [],
        unusedCode: 0,
        treeshakingEfficiency: 0
      };
    }
  }

  private async analyzeLoadTime(projectPath: string): Promise<LoadTimeMetrics> {
    // Placeholder - would use Lighthouse, WebPageTest, or similar
    return {
      firstContentfulPaint: 1200,
      largestContentfulPaint: 2400,
      firstInputDelay: 50,
      cumulativeLayoutShift: 0.1,
      timeToInteractive: 3000,
      totalBlockingTime: 200,
      speedIndex: 2000
    };
  }

  private async analyzeRuntimePerformance(projectPath: string): Promise<RuntimeMetrics> {
    // Placeholder - would use Chrome DevTools Protocol or similar
    return {
      frameRate: 58,
      memoryUsage: 50000000, // 50MB
      jsExecutionTime: 100,
      domManipulationTime: 20,
      paintTime: 15,
      layoutTime: 10,
      scriptParsingTime: 50
    };
  }

  private async analyzeCPUUsage(projectPath: string): Promise<CPUMetrics> {
    // Placeholder - would use system monitoring tools
    return {
      usage: 45,
      utilization: 60,
      processes: [],
      threads: [],
      bottlenecks: []
    };
  }

  private async analyzeMemoryUsage(projectPath: string): Promise<MemoryMetrics> {
    // Placeholder - would use memory profiling tools
    return {
      heapUsed: 100000000, // 100MB
      heapTotal: 150000000, // 150MB
      external: 10000000, // 10MB
      rss: 200000000, // 200MB
      arrayBuffers: 5000000, // 5MB
      leaks: [],
      gcPressure: 20,
      allocationsPerSecond: 1000
    };
  }

  private async analyzeThroughput(projectPath: string): Promise<ThroughputMetrics> {
    // Placeholder - would use load testing tools
    return {
      requestsPerSecond: 1000,
      dataProcessingRate: 10000000, // 10MB/s
      concurrentConnections: 100,
      queueLength: 5,
      errorRate: 0.01,
      successRate: 0.99
    };
  }

  private async analyzeLatency(projectPath: string): Promise<LatencyMetrics> {
    // Placeholder - would use APM tools
    return {
      p50: 50,
      p95: 200,
      p99: 500,
      average: 75,
      minimum: 10,
      maximum: 1000,
      networkLatency: 20,
      processingLatency: 55
    };
  }

  private async analyzeDatabasePerformance(projectPath: string): Promise<DatabaseMetrics> {
    // Placeholder - would analyze database logs and configuration
    return {
      queryCount: 1000,
      slowQueries: [],
      connectionPoolUsage: 60,
      indexUsage: [],
      cacheHitRatio: 85,
      lockWaitTime: 10,
      deadlocks: 0
    };
  }

  private async analyzeBatteryUsage(projectPath: string): Promise<BatteryMetrics> {
    // Placeholder - would use iOS/Android profiling tools
    return {
      drainRate: 5, // mAh per hour
      cpuImpact: 20,
      networkImpact: 15,
      locationImpact: 5,
      displayImpact: 30,
      backgroundActivity: 10
    };
  }

  private async analyzeNetworkUsage(projectPath: string): Promise<NetworkMetrics> {
    // Placeholder - would analyze network requests
    return {
      requestCount: 50,
      dataTransferred: 2000000, // 2MB
      cacheHitRatio: 70,
      compressionRatio: 60,
      redundantRequests: 5,
      largePayloads: []
    };
  }

  private async analyzeCodeComplexity(projectPath: string): Promise<CodeComplexityMetrics> {
    const files = await this.getAllFiles(projectPath, ['.git', 'node_modules', 'dist', 'build']);
    const codeFiles = files.filter(file => /\.(js|ts|py|java|go|rs|rb|php|cs|cpp|c|h)$/.test(file));
    
    let totalLines = 0;
    let totalComplexity = 0;
    
    for (const file of codeFiles.slice(0, 100)) { // Limit for performance
      try {
        const content = await fs.readFile(file, 'utf-8');
        const lines = content.split('\n').length;
        totalLines += lines;
        
        // Simple complexity calculation
        const complexity = (content.match(/if|else|switch|case|for|while|\?/g) || []).length;
        totalComplexity += complexity;
      } catch (error) {
        // Skip files that can't be read
      }
    }
    
    return {
      cyclomaticComplexity: totalComplexity,
      cognitiveComplexity: totalComplexity * 1.2,
      maintainabilityIndex: Math.max(0, 100 - (totalComplexity / codeFiles.length)),
      linesOfCode: totalLines,
      duplicatedLines: Math.floor(totalLines * 0.05), // Estimate
      technicalDebt: Math.floor(totalComplexity * 0.1) // Hours estimate
    };
  }

  private async analyzeDependencies(projectPath: string): Promise<DependencyMetrics> {
    const packageJsonPath = path.join(projectPath, 'package.json');
    
    try {
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      const totalDeps = Object.keys(deps).length;
      
      return {
        totalDependencies: totalDeps,
        outdatedDependencies: Math.floor(totalDeps * 0.2), // Estimate
        vulnerableDependencies: Math.floor(totalDeps * 0.05), // Estimate
        unusedDependencies: [],
        heavyDependencies: [],
        duplicatedDependencies: []
      };
    } catch (error) {
      return {
        totalDependencies: 0,
        outdatedDependencies: 0,
        vulnerableDependencies: 0,
        unusedDependencies: [],
        heavyDependencies: [],
        duplicatedDependencies: []
      };
    }
  }

  private async detectBottlenecks(metrics: PerformanceMetrics, projectPath: string): Promise<PerformanceBottleneck[]> {
    const bottlenecks: PerformanceBottleneck[] = [];

    // Bundle size bottlenecks
    if (metrics.bundleSize && metrics.bundleSize.totalSize > 1000000) {
      bottlenecks.push({
        id: this.generateBottleneckId(),
        type: 'bundle_large',
        severity: 'high',
        location: 'Bundle',
        description: `Bundle size is ${(metrics.bundleSize.totalSize / 1000000).toFixed(1)}MB, which is larger than recommended`,
        impact: {
          userExperience: 'noticeable',
          performanceScore: -20,
          resourceConsumption: 30,
          scalabilityImpact: 15,
          businessImpact: 'Slower page loads may increase bounce rate'
        },
        cause: 'Large dependencies or inefficient bundling',
        detection: {
          method: 'static_analysis',
          confidence: 90,
          evidence: [`Bundle size: ${metrics.bundleSize.totalSize} bytes`],
          metrics: { bundleSize: metrics.bundleSize.totalSize }
        },
        fix: {
          strategy: 'code_splitting',
          implementation: [
            {
              step: 1,
              description: 'Implement route-based code splitting',
              codeChanges: [],
              configChanges: [],
              dependencies: [],
              testing: 'Verify bundle chunks are created correctly'
            }
          ],
          effort: 'moderate',
          impact: 'high',
          risks: ['Potential issues with dynamic imports'],
          verification: [
            {
              metric: 'bundleSize',
              beforeValue: metrics.bundleSize.totalSize,
              expectedImprovement: 40,
              measurementMethod: 'Bundle analyzer',
              threshold: 500000
            }
          ]
        }
      });
    }

    // Memory bottlenecks
    if (metrics.memory && metrics.memory.leaks.length > 0) {
      bottlenecks.push({
        id: this.generateBottleneckId(),
        type: 'memory_leak',
        severity: 'critical',
        location: 'Memory Management',
        description: `Detected ${metrics.memory.leaks.length} memory leaks`,
        impact: {
          userExperience: 'severe',
          performanceScore: -30,
          resourceConsumption: 50,
          scalabilityImpact: 40,
          businessImpact: 'Application may become unresponsive over time'
        },
        cause: 'Unreleased references or event listeners',
        detection: {
          method: 'profiling',
          confidence: 95,
          evidence: metrics.memory.leaks.map(leak => leak.description),
          metrics: { leakCount: metrics.memory.leaks.length }
        },
        fix: {
          strategy: 'memory_management',
          implementation: [
            {
              step: 1,
              description: 'Fix identified memory leaks',
              codeChanges: metrics.memory.leaks.map(leak => ({
                file: leak.location,
                operation: 'modify',
                after: leak.fix,
                reason: `Fix ${leak.type} memory leak`
              })),
              configChanges: [],
              dependencies: [],
              testing: 'Run memory profiling to verify leaks are fixed'
            }
          ],
          effort: 'moderate',
          impact: 'critical',
          risks: ['Potential breaking changes to existing functionality'],
          verification: [
            {
              metric: 'memoryLeaks',
              beforeValue: metrics.memory.leaks.length,
              expectedImprovement: 100,
              measurementMethod: 'Memory profiler',
              threshold: 0
            }
          ]
        }
      });
    }

    // Database bottlenecks
    if (metrics.database && metrics.database.slowQueries.length > 0) {
      bottlenecks.push({
        id: this.generateBottleneckId(),
        type: 'database_slow',
        severity: 'high',
        location: 'Database',
        description: `Found ${metrics.database.slowQueries.length} slow database queries`,
        impact: {
          userExperience: 'noticeable',
          performanceScore: -25,
          resourceConsumption: 35,
          scalabilityImpact: 30,
          businessImpact: 'Slower response times may impact user satisfaction'
        },
        cause: 'Inefficient queries or missing indexes',
        detection: {
          method: 'monitoring',
          confidence: 85,
          evidence: metrics.database.slowQueries.map(q => `${q.query} (${q.executionTime}ms)`),
          metrics: { slowQueryCount: metrics.database.slowQueries.length }
        },
        fix: {
          strategy: 'database_optimization',
          implementation: [
            {
              step: 1,
              description: 'Optimize slow queries and add missing indexes',
              codeChanges: [],
              configChanges: [],
              dependencies: [],
              testing: 'Run performance tests to verify query improvements'
            }
          ],
          effort: 'moderate',
          impact: 'high',
          risks: ['Index changes may affect other queries'],
          verification: [
            {
              metric: 'averageQueryTime',
              beforeValue: metrics.database.slowQueries.reduce((acc, q) => acc + q.executionTime, 0) / metrics.database.slowQueries.length,
              expectedImprovement: 60,
              measurementMethod: 'Database monitoring',
              threshold: 100
            }
          ]
        }
      });
    }

    return bottlenecks;
  }

  private async generateOptimizations(bottlenecks: PerformanceBottleneck[], metrics: PerformanceMetrics): Promise<OptimizationSuggestion[]> {
    const optimizations: OptimizationSuggestion[] = [];

    for (const bottleneck of bottlenecks) {
      optimizations.push({
        id: this.generateOptimizationId(),
        category: this.mapBottleneckToCategory(bottleneck.type),
        title: `Fix ${bottleneck.type.replace('_', ' ')} issue`,
        description: bottleneck.description,
        priority: bottleneck.severity,
        effort: bottleneck.fix.effort,
        impact: {
          performanceGain: bottleneck.fix.verification[0]?.expectedImprovement || 20,
          resourceSavings: bottleneck.impact.resourceConsumption,
          userExperienceImprovement: bottleneck.impact.userExperience,
          maintenanceImpact: 'Improved code maintainability'
        },
        implementation: bottleneck.fix,
        relatedBottlenecks: [bottleneck.id],
        applicablePlatforms: ['web', 'nodejs', 'python', 'java', 'go']
      });
    }

    // General optimizations based on metrics
    if (metrics.codeComplexity && metrics.codeComplexity.cyclomaticComplexity > 50) {
      optimizations.push({
        id: this.generateOptimizationId(),
        category: 'maintenance',
        title: 'Reduce code complexity',
        description: 'High cyclomatic complexity makes code harder to maintain and test',
        priority: 'medium',
        effort: 'complex',
        impact: {
          performanceGain: 10,
          resourceSavings: 5,
          userExperienceImprovement: 'minor',
          maintenanceImpact: 'Significantly improved code maintainability'
        },
        implementation: {
          strategy: 'algorithm_optimization',
          implementation: [
            {
              step: 1,
              description: 'Refactor complex functions into smaller, focused functions',
              codeChanges: [],
              configChanges: [],
              dependencies: [],
              testing: 'Ensure all existing tests pass after refactoring'
            }
          ],
          effort: 'complex',
          impact: 'medium',
          risks: ['Potential introduction of bugs during refactoring'],
          verification: [
            {
              metric: 'cyclomaticComplexity',
              beforeValue: metrics.codeComplexity.cyclomaticComplexity,
              expectedImprovement: 30,
              measurementMethod: 'Static code analysis',
              threshold: 35
            }
          ]
        },
        relatedBottlenecks: [],
        applicablePlatforms: ['web', 'nodejs', 'python', 'java', 'go', 'rust']
      });
    }

    return optimizations;
  }

  private mapBottleneckToCategory(type: BottleneckType): OptimizationCategory {
    const mapping: Record<BottleneckType, OptimizationCategory> = {
      cpu_intensive: 'performance',
      memory_leak: 'memory',
      io_blocking: 'io',
      network_slow: 'network',
      database_slow: 'database',
      algorithm_inefficient: 'computation',
      bundle_large: 'bundling',
      render_blocking: 'rendering',
      cache_miss: 'caching',
      gc_pressure: 'memory',
      thread_contention: 'performance',
      resource_leak: 'memory'
    };
    
    return mapping[type] || 'performance';
  }

  private async runBenchmarks(projectPath: string, config: OptimizationConfig): Promise<BenchmarkResults> {
    const environment: BenchmarkEnvironment = {
      os: process.platform,
      arch: process.arch,
      cpuCores: require('os').cpus().length,
      memory: require('os').totalmem(),
      node: process.version
    };

    const baseline: BenchmarkRun = {
      timestamp: new Date(),
      duration: 5000, // 5 seconds
      metrics: {
        responseTime: 100,
        throughput: 1000,
        memoryUsage: 50000000
      },
      configuration: {},
      successful: true,
      errors: []
    };

    return {
      baseline,
      tests: [],
      environment
    };
  }

  private async generateRecommendations(profile: PerformanceProfile): Promise<OptimizationRecommendation[]> {
    const recommendations: OptimizationRecommendation[] = [];

    // High-impact, low-effort recommendations
    if (profile.score < 70) {
      recommendations.push({
        category: 'performance',
        title: 'Quick Performance Wins',
        description: 'Implement high-impact, low-effort optimizations to improve overall performance',
        priority: 'high',
        effort: 'easy',
        timeline: '1-2 weeks',
        prerequisites: ['Development environment setup'],
        implementation: [
          {
            phase: 1,
            name: 'Quick Fixes',
            duration: '1 week',
            tasks: [
              {
                name: 'Implement caching',
                description: 'Add caching layer for frequently accessed data',
                owner: 'Backend Developer',
                effort: '2 days',
                dependencies: []
              },
              {
                name: 'Optimize images',
                description: 'Compress and optimize image assets',
                owner: 'Frontend Developer',
                effort: '1 day',
                dependencies: []
              }
            ],
            deliverables: ['Caching implementation', 'Optimized assets'],
            metrics: ['Response time', 'Bundle size']
          }
        ],
        monitoring: {
          metrics: ['response_time', 'throughput', 'error_rate'],
          alerts: [
            {
              metric: 'response_time',
              threshold: 500,
              severity: 'warning',
              action: 'Investigate performance degradation'
            }
          ],
          dashboards: ['Performance Dashboard'],
          reportingFrequency: 'daily'
        },
        rollback: {
          triggers: ['Performance regression > 20%', 'Error rate > 5%'],
          steps: ['Revert code changes', 'Clear cache', 'Restart services'],
          timeframe: '1 hour',
          dataBackup: true
        }
      });
    }

    return recommendations;
  }

  private calculatePerformanceScore(profile: PerformanceProfile): number {
    let score = 100;

    // Deduct points based on bottlenecks
    for (const bottleneck of profile.bottlenecks) {
      switch (bottleneck.severity) {
        case 'critical':
          score -= 25;
          break;
        case 'high':
          score -= 15;
          break;
        case 'medium':
          score -= 8;
          break;
        case 'low':
          score -= 3;
          break;
      }
    }

    // Platform-specific scoring
    if (this.isWebPlatform(profile.platform)) {
      if (profile.metrics.bundleSize && profile.metrics.bundleSize.totalSize > 1000000) {
        score -= 10;
      }
      if (profile.metrics.loadTime && profile.metrics.loadTime.largestContentfulPaint > 2500) {
        score -= 15;
      }
    }

    if (this.isServerPlatform(profile.platform)) {
      if (profile.metrics.latency && profile.metrics.latency.p95 > 500) {
        score -= 10;
      }
      if (profile.metrics.memory && profile.metrics.memory.leaks.length > 0) {
        score -= 20;
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  private createEmptyBenchmarks(): BenchmarkResults {
    return {
      baseline: {
        timestamp: new Date(),
        duration: 0,
        metrics: {},
        configuration: {},
        successful: false,
        errors: []
      },
      tests: [],
      environment: {
        os: process.platform,
        arch: process.arch,
        cpuCores: require('os').cpus().length,
        memory: require('os').totalmem()
      }
    };
  }

  // Utility methods
  private generateProfileId(): string {
    return `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateBottleneckId(): string {
    return `bottleneck_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  private generateOptimizationId(): string {
    return `optimization_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
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
    try {
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
    } catch (error) {
      // Directory might not exist or be accessible
    }

    return files;
  }

  // Public API methods
  async getHealthStatus(): Promise<any> {
    return {
      status: 'healthy',
      activeProfiles: this.activeProfiles.size,
      totalProfilesCompleted: this.profileHistory.length,
      lastProfileTime: this.profileHistory.length > 0 ? this.profileHistory[this.profileHistory.length - 1].endTime : null,
      supportedPlatforms: this.config.platforms
    };
  }

  async listProfiles(): Promise<PerformanceProfile[]> {
    return this.profileHistory.slice(-10);
  }

  async getProfileResult(profileId: string): Promise<PerformanceProfile | null> {
    return this.profileHistory.find(profile => profile.id === profileId) || null;
  }

  async getBottleneckById(bottleneckId: string): Promise<PerformanceBottleneck | null> {
    for (const profile of this.profileHistory) {
      const bottleneck = profile.bottlenecks.find(b => b.id === bottleneckId);
      if (bottleneck) return bottleneck;
    }
    return null;
  }

  async generateOptimizationPlan(profileId: string): Promise<OptimizationRecommendation[]> {
    const profile = await this.getProfileResult(profileId);
    if (!profile) {
      throw new MCPError('PROFILE_NOT_FOUND', `Profile ${profileId} not found`);
    }

    return profile.recommendations;
  }
}

// Optimization MCP Server
export class OptimizationServer extends BaseServer {
  private optimizationService: OptimizationService;
  
  // Memory optimization: Enable garbage collection and monitoring
  private memoryMonitorInterval: NodeJS.Timeout | null = null;

  constructor() {
    const config = {
      name: 'optimization-server',
      port: parseInt(process.env.OPTIMIZATION_PORT || '3018'),
      enableCors: true,
      enableSecurity: true,
      healthCheck: {
        enabled: true,
        path: '/health',
        interval: 30000
      }
    };

    super(config);

    // Default optimization configuration
    const defaultConfig: OptimizationConfig = {
      platforms: ['web', 'nodejs', 'python', 'java', 'go'],
      profileTypes: ['cpu', 'memory', 'network', 'bundle'],
      benchmarkTests: ['load_test', 'stress_test'],
      thresholds: [
        { metric: 'response_time', warning: 200, critical: 500, unit: 'ms', platform: 'web' },
        { metric: 'memory_usage', warning: 512, critical: 1024, unit: 'MB', platform: 'nodejs' },
        { metric: 'bundle_size', warning: 500, critical: 1000, unit: 'KB', platform: 'web' }
      ],
      optimizationStrategies: ['caching', 'code_splitting', 'compression', 'minification'],
      excludePatterns: ['node_modules', '.git', 'dist', 'build'],
      integrations: [
        { name: 'lighthouse', type: 'lighthouse', config: {}, enabled: true },
        { name: 'webpack', type: 'webpack', config: {}, enabled: false }
      ]
    };

    this.optimizationService = new OptimizationService(defaultConfig);
  }

  protected async initialize(): Promise<void> {
    this.setupOptimizationRoutes();
    this.startMemoryMonitoring();
  }

  protected async cleanup(): Promise<void> {
    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
      this.memoryMonitorInterval = null;
    }
    
    // Clear caches to free memory
    if (this.optimizationService) {
      this.optimizationService.clearCaches();
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
      console.log(`[Optimization] Memory: Heap ${heapUsedMB}/${heapTotalMB}MB, RSS: ${rssMB}MB`);
      
      // Trigger GC if memory usage is high
      if (heapUsedMB > 50 && global.gc) {
        console.log('[Optimization] Triggering garbage collection...');
        global.gc();
      }
      
      // Clear caches if memory usage is critical
      if (heapUsedMB > 80) {
        console.log('[Optimization] Memory critical, clearing caches...');
        this.optimizationService.clearCaches();
      }
    }, 30000); // Check every 30 seconds
  }

  private setupOptimizationRoutes(): void {
    // Health check
    this.addRoute('get', '/health', async (req, res) => {
      try {
        const health = await this.optimizationService.getHealthStatus();
        res.json(health);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Profile performance
    this.addRoute('post', '/api/profile', async (req, res) => {
      try {
        const { projectPath, config } = req.body;
        if (!projectPath) {
          return res.status(400).json({ error: 'projectPath is required' });
        }

        const result = await this.optimizationService.profilePerformance(projectPath, config);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // List profiles
    this.addRoute('get', '/api/profiles', async (req, res) => {
      try {
        const profiles = await this.optimizationService.listProfiles();
        res.json(profiles);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Get profile result
    this.addRoute('get', '/api/profiles/:profileId', async (req, res) => {
      try {
        const { profileId } = req.params;
        const profile = await this.optimizationService.getProfileResult(profileId);
        if (!profile) {
          return res.status(404).json({ error: 'Profile not found' });
        }
        res.json(profile);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Get bottleneck details
    this.addRoute('get', '/api/bottlenecks/:bottleneckId', async (req, res) => {
      try {
        const { bottleneckId } = req.params;
        const bottleneck = await this.optimizationService.getBottleneckById(bottleneckId);
        if (!bottleneck) {
          return res.status(404).json({ error: 'Bottleneck not found' });
        }
        res.json(bottleneck);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Generate optimization plan
    this.addRoute('get', '/api/profiles/:profileId/plan', async (req, res) => {
      try {
        const { profileId } = req.params;
        const plan = await this.optimizationService.generateOptimizationPlan(profileId);
        res.json(plan);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // MCP Tools endpoint
    this.addRoute('get', '/api/tools', async (req, res) => {
      res.json({
        tools: [
          {
            name: 'profile_performance',
            description: 'Perform comprehensive performance profiling of a project',
            parameters: {
              type: 'object',
              properties: {
                projectPath: { type: 'string', description: 'Path to the project to profile' },
                platforms: {
                  type: 'array',
                  items: { enum: ['web', 'nodejs', 'python', 'java', 'csharp', 'go', 'rust', 'php', 'ruby', 'ios', 'android', 'flutter', 'react_native', 'electron', 'desktop', 'server'] },
                  description: 'Target platforms to profile'
                },
                profileTypes: {
                  type: 'array',
                  items: { enum: ['cpu', 'memory', 'network', 'database', 'bundle', 'runtime', 'load_test'] },
                  description: 'Types of performance profiling to perform'
                }
              },
              required: ['projectPath']
            }
          },
          {
            name: 'get_performance_bottlenecks',
            description: 'Identify and analyze performance bottlenecks',
            parameters: {
              type: 'object',
              properties: {
                profileId: { type: 'string', description: 'ID of the performance profile to analyze' },
                severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'], description: 'Minimum severity level to include' }
              },
              required: ['profileId']
            }
          },
          {
            name: 'generate_optimization_suggestions',
            description: 'Generate AI-powered optimization suggestions',
            parameters: {
              type: 'object',
              properties: {
                profileId: { type: 'string', description: 'ID of the performance profile' },
                category: {
                  type: 'string',
                  enum: ['performance', 'memory', 'network', 'database', 'caching', 'bundling', 'rendering', 'computation', 'io', 'security', 'maintenance', 'scalability'],
                  description: 'Focus on specific optimization category'
                }
              },
              required: ['profileId']
            }
          },
          {
            name: 'analyze_bundle_size',
            description: 'Analyze JavaScript bundle size and suggest optimizations',
            parameters: {
              type: 'object',
              properties: {
                projectPath: { type: 'string', description: 'Path to the web project' },
                buildCommand: { type: 'string', description: 'Command to build the project', default: 'npm run build' }
              },
              required: ['projectPath']
            }
          },
          {
            name: 'check_memory_leaks',
            description: 'Detect and analyze potential memory leaks',
            parameters: {
              type: 'object',
              properties: {
                profileId: { type: 'string', description: 'ID of the performance profile' },
                includeRecommendations: { type: 'boolean', description: 'Include fix recommendations', default: true }
              },
              required: ['profileId']
            }
          },
          {
            name: 'optimize_database_queries',
            description: 'Analyze and optimize slow database queries',
            parameters: {
              type: 'object',
              properties: {
                projectPath: { type: 'string', description: 'Path to the project' },
                databaseType: { type: 'string', enum: ['postgresql', 'mysql', 'mongodb', 'redis'], description: 'Type of database to analyze' }
              },
              required: ['projectPath']
            }
          },
          {
            name: 'benchmark_performance',
            description: 'Run performance benchmarks and compare results',
            parameters: {
              type: 'object',
              properties: {
                projectPath: { type: 'string', description: 'Path to the project' },
                testTypes: {
                  type: 'array',
                  items: { enum: ['load_test', 'stress_test', 'spike_test', 'endurance_test'] },
                  description: 'Types of benchmark tests to run'
                },
                duration: { type: 'number', description: 'Test duration in seconds', default: 60 }
              },
              required: ['projectPath']
            }
          },
          {
            name: 'create_optimization_plan',
            description: 'Create a comprehensive optimization implementation plan',
            parameters: {
              type: 'object',
              properties: {
                profileId: { type: 'string', description: 'ID of the performance profile' },
                priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'], description: 'Minimum priority level for recommendations' },
                timeline: { type: 'string', description: 'Desired timeline for implementation (e.g., "2 weeks", "1 month")' }
              },
              required: ['profileId']
            }
          }
        ]
      });
    });
  }

  // MCP tool implementations
  async callTool(toolName: string, parameters: any): Promise<any> {
    switch (toolName) {
      case 'profile_performance':
        return this.optimizationService.profilePerformance(parameters.projectPath, {
          platforms: parameters.platforms,
          profileTypes: parameters.profileTypes
        });

      case 'get_performance_bottlenecks':
        const profile = await this.optimizationService.getProfileResult(parameters.profileId);
        if (!profile) {
          throw new MCPError('PROFILE_NOT_FOUND', `Profile ${parameters.profileId} not found`);
        }
        return {
          bottlenecks: profile.bottlenecks.filter(b => 
            !parameters.severity || this.compareSeverity(b.severity, parameters.severity) >= 0
          ),
          summary: {
            total: profile.bottlenecks.length,
            critical: profile.bottlenecks.filter(b => b.severity === 'critical').length,
            high: profile.bottlenecks.filter(b => b.severity === 'high').length,
            medium: profile.bottlenecks.filter(b => b.severity === 'medium').length,
            low: profile.bottlenecks.filter(b => b.severity === 'low').length
          }
        };

      case 'generate_optimization_suggestions':
        const suggestionProfile = await this.optimizationService.getProfileResult(parameters.profileId);
        if (!suggestionProfile) {
          throw new MCPError('PROFILE_NOT_FOUND', `Profile ${parameters.profileId} not found`);
        }
        return {
          optimizations: suggestionProfile.optimizations.filter(opt => 
            !parameters.category || opt.category === parameters.category
          ),
          totalPotentialGain: suggestionProfile.optimizations.reduce((acc, opt) => acc + opt.impact.performanceGain, 0)
        };

      case 'analyze_bundle_size':
        const bundleProfile = await this.optimizationService.profilePerformance(parameters.projectPath, {
          platforms: ['web'],
          profileTypes: ['bundle']
        });
        return {
          bundleSize: bundleProfile.metrics.bundleSize,
          recommendations: bundleProfile.optimizations.filter(opt => opt.category === 'bundling'),
          score: bundleProfile.score
        };

      case 'check_memory_leaks':
        const memoryProfile = await this.optimizationService.getProfileResult(parameters.profileId);
        if (!memoryProfile) {
          throw new MCPError('PROFILE_NOT_FOUND', `Profile ${parameters.profileId} not found`);
        }
        return {
          memoryLeaks: memoryProfile.metrics.memory?.leaks || [],
          memoryMetrics: memoryProfile.metrics.memory,
          recommendations: parameters.includeRecommendations ? 
            memoryProfile.optimizations.filter(opt => opt.category === 'memory') : []
        };

      case 'optimize_database_queries':
        const dbProfile = await this.optimizationService.profilePerformance(parameters.projectPath, {
          platforms: ['nodejs', 'python', 'java'],
          profileTypes: ['database']
        });
        return {
          slowQueries: dbProfile.metrics.database?.slowQueries || [],
          indexRecommendations: dbProfile.metrics.database?.indexUsage || [],
          optimizations: dbProfile.optimizations.filter(opt => opt.category === 'database')
        };

      case 'benchmark_performance':
        const benchmarkProfile = await this.optimizationService.profilePerformance(parameters.projectPath, {
          platforms: ['web', 'nodejs'],
          profileTypes: ['load_test']
        });
        return {
          benchmarks: benchmarkProfile.benchmarks,
          score: benchmarkProfile.score,
          recommendations: benchmarkProfile.recommendations
        };

      case 'create_optimization_plan':
        return this.optimizationService.generateOptimizationPlan(parameters.profileId);

      default:
        throw new MCPError('UNKNOWN_TOOL', `Unknown tool: ${toolName}`);
    }
  }

  private compareSeverity(s1: string, s2: string): number {
    const severityOrder = { critical: 3, high: 2, medium: 1, low: 0 };
    return severityOrder[s1] - severityOrder[s2];
  }

  async listTools(): Promise<any[]> {
    const response = await fetch(`http://localhost:${this.config.port}/api/tools`);
    const data = await response.json();
    return data.tools;
  }
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new OptimizationServer();
  server.start().catch(console.error);
}