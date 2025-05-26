import { Server } from 'http';
import { StandardMCPServer, MCPTool } from '../../shared/base-server';
import { v4 as uuidv4 } from 'uuid';

// Benchmark types and categories
type BenchmarkType = 'performance' | 'accuracy' | 'cost' | 'fairness' | 'safety' | 'latency' | 'throughput' | 'quality';
type ModelType = 'llm' | 'embedding' | 'image' | 'audio' | 'multimodal' | 'code' | 'reasoning';
type MetricType = 'exact_match' | 'bleu' | 'rouge' | 'bertscore' | 'perplexity' | 'accuracy' | 'f1' | 'precision' | 'recall' | 'latency' | 'throughput' | 'cost_per_token';

// Benchmark definition and configuration
interface BenchmarkDefinition {
  id: string;
  name: string;
  description: string;
  category: BenchmarkType;
  modelType: ModelType;
  version: string;
  dataset: DatasetConfig;
  tasks: BenchmarkTask[];
  metrics: MetricDefinition[];
  configuration: {
    sampleSize?: number;
    randomSeed?: number;
    iterations: number;
    timeoutPerTask: number;
    parallelism: number;
    warmupRuns: number;
    failureThreshold: number;
  };
  requirements: {
    minimumModelCapabilities: string[];
    requiredInputTypes: string[];
    outputFormats: string[];
  };
  tags: string[];
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

// Dataset configuration
interface DatasetConfig {
  id: string;
  name: string;
  source: 'builtin' | 'url' | 'file' | 'generated' | 'custom';
  location?: string;
  format: 'json' | 'csv' | 'jsonl' | 'parquet' | 'text';
  schema: DatasetSchema;
  preprocessing?: PreprocessingStep[];
  sampling?: {
    strategy: 'random' | 'stratified' | 'systematic' | 'balanced';
    size: number;
    randomSeed?: number;
  };
  validation?: ValidationRule[];
}

interface DatasetSchema {
  fields: DatasetField[];
  relationships?: FieldRelationship[];
}

interface DatasetField {
  name: string;
  type: 'text' | 'number' | 'boolean' | 'array' | 'object' | 'image' | 'audio';
  required: boolean;
  description?: string;
  constraints?: any[];
}

interface FieldRelationship {
  type: 'input-output' | 'reference' | 'dependency';
  fields: string[];
  description?: string;
}

interface PreprocessingStep {
  id: string;
  name: string;
  operation: string;
  parameters: Record<string, any>;
  appliesTo: string[];
}

// Benchmark task definition
interface BenchmarkTask {
  id: string;
  name: string;
  description: string;
  type: 'single-turn' | 'multi-turn' | 'batch' | 'streaming' | 'interactive';
  inputTemplate: string;
  expectedOutputFormat: string;
  evaluationCriteria: EvaluationCriteria[];
  timeout: number;
  retries: number;
  metadata?: Record<string, any>;
}

interface EvaluationCriteria {
  metric: MetricType;
  weight: number;
  threshold?: number;
  direction: 'higher-better' | 'lower-better';
  parameters?: Record<string, any>;
}

// Metric definitions
interface MetricDefinition {
  id: string;
  name: string;
  type: MetricType;
  description: string;
  calculation: 'automatic' | 'manual' | 'model-based' | 'rule-based';
  parameters: Record<string, any>;
  aggregation: 'mean' | 'median' | 'sum' | 'max' | 'min' | 'custom';
  range?: { min: number; max: number };
  higherIsBetter: boolean;
}

// Benchmark execution and results
interface BenchmarkRun {
  id: string;
  benchmarkId: string;
  modelIds: string[];
  configuration: RunConfiguration;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    currentTask?: string;
    percentage: number;
  };
  results: ModelResult[];
  comparison?: ComparisonResult;
  timeline: RunEvent[];
  startTime: Date;
  endTime?: Date;
  duration?: number;
  metadata?: Record<string, any>;
  createdBy?: string;
}

interface RunConfiguration {
  evaluationMode: 'standard' | 'comprehensive' | 'quick' | 'custom';
  outputDetail: 'minimal' | 'standard' | 'verbose';
  costTracking: boolean;
  saveIntermediateResults: boolean;
  enableCaching: boolean;
  customParameters?: Record<string, any>;
}

interface ModelResult {
  modelId: string;
  modelName: string;
  overallScore: number;
  taskResults: TaskResult[];
  metrics: Record<string, number>;
  statistics: ResultStatistics;
  errors: BenchmarkError[];
  metadata: {
    totalTokens: number;
    totalCost: number;
    averageLatency: number;
    successRate: number;
  };
}

interface TaskResult {
  taskId: string;
  status: 'completed' | 'failed' | 'timeout' | 'skipped';
  input: any;
  output?: any;
  expectedOutput?: any;
  scores: Record<string, number>;
  latency: number;
  tokens?: {
    input: number;
    output: number;
    total: number;
  };
  cost?: number;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

interface ResultStatistics {
  mean: number;
  median: number;
  standardDeviation: number;
  min: number;
  max: number;
  percentiles: Record<string, number>;
  confidence: {
    level: number;
    interval: [number, number];
  };
}

interface ComparisonResult {
  baselineModel?: string;
  rankings: ModelRanking[];
  significanceTests: SignificanceTest[];
  improvements: ModelImprovement[];
  analysis: ComparisonAnalysis;
}

interface ModelRanking {
  rank: number;
  modelId: string;
  modelName: string;
  overallScore: number;
  relativePerformance: number;
  strengths: string[];
  weaknesses: string[];
}

interface SignificanceTest {
  metric: string;
  models: string[];
  testType: 'ttest' | 'wilcoxon' | 'friedman' | 'bootstrap';
  pValue: number;
  isSignificant: boolean;
  effectSize?: number;
}

interface ModelImprovement {
  modelId: string;
  comparedTo: string;
  improvements: {
    metric: string;
    improvement: number;
    significance: number;
  }[];
}

interface ComparisonAnalysis {
  bestOverall: string;
  bestPerTask: Record<string, string>;
  mostCostEffective: string;
  fastest: string;
  mostReliable: string;
  recommendations: string[];
}

interface BenchmarkError {
  id: string;
  taskId?: string;
  timestamp: Date;
  type: 'timeout' | 'api_error' | 'validation_error' | 'system_error';
  message: string;
  details?: any;
  retry?: number;
}

interface RunEvent {
  id: string;
  timestamp: Date;
  type: 'start' | 'progress' | 'task_complete' | 'model_complete' | 'error' | 'warning' | 'complete';
  message: string;
  data?: any;
}

// Leaderboard and rankings
interface Leaderboard {
  id: string;
  benchmarkId: string;
  name: string;
  description?: string;
  entries: LeaderboardEntry[];
  filters: LeaderboardFilter[];
  sortBy: string;
  lastUpdated: Date;
  metadata?: Record<string, any>;
}

interface LeaderboardEntry {
  rank: number;
  modelId: string;
  modelName: string;
  organization?: string;
  score: number;
  runId: string;
  submissionDate: Date;
  metadata: {
    parameters?: Record<string, any>;
    version?: string;
    description?: string;
  };
}

interface LeaderboardFilter {
  field: string;
  operator: 'equals' | 'greater_than' | 'less_than' | 'contains' | 'in';
  value: any;
}

// Performance analysis
interface PerformanceAnalysis {
  modelId: string;
  timeRange: {
    start: Date;
    end: Date;
  };
  trends: PerformanceTrend[];
  regressions: PerformanceRegression[];
  improvements: PerformanceImprovement[];
  recommendations: AnalysisRecommendation[];
}

interface PerformanceTrend {
  metric: string;
  trend: 'improving' | 'declining' | 'stable' | 'volatile';
  changeRate: number;
  confidence: number;
  significance: number;
}

interface PerformanceRegression {
  metric: string;
  timepoint: Date;
  severity: 'minor' | 'moderate' | 'major' | 'critical';
  impact: number;
  possibleCauses: string[];
}

interface PerformanceImprovement {
  metric: string;
  timepoint: Date;
  improvement: number;
  likelyCause?: string;
}

interface AnalysisRecommendation {
  type: 'optimization' | 'configuration' | 'monitoring' | 'investigation';
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  expectedImpact: string;
  effort: 'low' | 'medium' | 'high';
}

// Main Model Benchmarking Suite class
export class ModelBenchmarkingSuite extends StandardMCPServer {
  private benchmarks: Map<string, BenchmarkDefinition> = new Map();
  private runs: Map<string, BenchmarkRun> = new Map();
  private leaderboards: Map<string, Leaderboard> = new Map();
  private analyses: Map<string, PerformanceAnalysis> = new Map();
  
  // Built-in datasets and benchmarks
  private builtinDatasets: Map<string, DatasetConfig> = new Map();
  private standardBenchmarks: Map<string, BenchmarkDefinition> = new Map();
  
  // Result cache and processing
  private resultCache: Map<string, any> = new Map();
  private activeRuns: Set<string> = new Set();
  
  // Default benchmark configurations
  private defaultBenchmarks: Record<string, Partial<BenchmarkDefinition>> = {
    'text-classification': {
      name: 'Text Classification Benchmark',
      description: 'Evaluates model performance on text classification tasks',
      category: 'accuracy',
      modelType: 'llm',
      tasks: [
        {
          id: 'sentiment-analysis',
          name: 'Sentiment Analysis',
          description: 'Classify text sentiment as positive, negative, or neutral',
          type: 'single-turn',
          inputTemplate: 'Classify the sentiment of the following text: "{text}"',
          expectedOutputFormat: 'One of: positive, negative, neutral',
          evaluationCriteria: [
            { metric: 'accuracy', weight: 1.0, direction: 'higher-better' }
          ],
          timeout: 30000,
          retries: 2
        }
      ],
      metrics: [
        {
          id: 'accuracy',
          name: 'Accuracy',
          type: 'accuracy',
          description: 'Percentage of correct classifications',
          calculation: 'automatic',
          parameters: {},
          aggregation: 'mean',
          range: { min: 0, max: 1 },
          higherIsBetter: true
        }
      ]
    },
    'reasoning': {
      name: 'Reasoning Capability Benchmark',
      description: 'Evaluates logical reasoning and problem-solving abilities',
      category: 'accuracy',
      modelType: 'llm',
      tasks: [
        {
          id: 'logical-reasoning',
          name: 'Logical Reasoning',
          description: 'Solve logical reasoning problems',
          type: 'single-turn',
          inputTemplate: 'Solve this logical reasoning problem: {problem}',
          expectedOutputFormat: 'Step-by-step solution with final answer',
          evaluationCriteria: [
            { metric: 'exact_match', weight: 0.7, direction: 'higher-better' },
            { metric: 'reasoning_quality', weight: 0.3, direction: 'higher-better' }
          ],
          timeout: 60000,
          retries: 1
        }
      ]
    },
    'performance': {
      name: 'Performance Benchmark',
      description: 'Measures latency, throughput, and efficiency',
      category: 'performance',
      modelType: 'llm',
      tasks: [
        {
          id: 'latency-test',
          name: 'Latency Test',
          description: 'Measure response latency for various input sizes',
          type: 'batch',
          inputTemplate: '{text}',
          expectedOutputFormat: 'Any valid response',
          evaluationCriteria: [
            { metric: 'latency', weight: 1.0, direction: 'lower-better' }
          ],
          timeout: 10000,
          retries: 0
        }
      ]
    },
    'cost-efficiency': {
      name: 'Cost Efficiency Benchmark',
      description: 'Evaluates cost-effectiveness across different model sizes',
      category: 'cost',
      modelType: 'llm',
      tasks: [
        {
          id: 'cost-per-quality',
          name: 'Cost per Quality Unit',
          description: 'Measure cost efficiency relative to output quality',
          type: 'batch',
          inputTemplate: '{prompt}',
          expectedOutputFormat: 'High-quality response',
          evaluationCriteria: [
            { metric: 'cost_per_token', weight: 0.5, direction: 'lower-better' },
            { metric: 'quality_score', weight: 0.5, direction: 'higher-better' }
          ],
          timeout: 30000,
          retries: 0
        }
      ]
    }
  };

  constructor(server: Server) {
    super(server);
    this.registerTools();
    this.initializeBuiltinBenchmarks();
    this.startBackgroundTasks();
  }

  private registerTools(): void {
    // Benchmark definition management
    this.tools.set('createBenchmark', this.createBenchmark.bind(this));
    this.tools.set('getBenchmark', this.getBenchmark.bind(this));
    this.tools.set('updateBenchmark', this.updateBenchmark.bind(this));
    this.tools.set('deleteBenchmark', this.deleteBenchmark.bind(this));
    this.tools.set('listBenchmarks', this.listBenchmarks.bind(this));
    this.tools.set('cloneBenchmark', this.cloneBenchmark.bind(this));
    
    // Benchmark execution
    this.tools.set('runBenchmark', this.runBenchmark.bind(this));
    this.tools.set('getBenchmarkRun', this.getBenchmarkRun.bind(this));
    this.tools.set('listBenchmarkRuns', this.listBenchmarkRuns.bind(this));
    this.tools.set('cancelBenchmarkRun', this.cancelBenchmarkRun.bind(this));
    this.tools.set('retryBenchmarkRun', this.retryBenchmarkRun.bind(this));
    
    // Results and analysis
    this.tools.set('getResults', this.getResults.bind(this));
    this.tools.set('compareModels', this.compareModels.bind(this));
    this.tools.set('analyzePerformance', this.analyzePerformance.bind(this));
    this.tools.set('generateReport', this.generateReport.bind(this));
    this.tools.set('exportResults', this.exportResults.bind(this));
    
    // Leaderboards
    this.tools.set('createLeaderboard', this.createLeaderboard.bind(this));
    this.tools.set('getLeaderboard', this.getLeaderboard.bind(this));
    this.tools.set('updateLeaderboard', this.updateLeaderboard.bind(this));
    this.tools.set('submitToLeaderboard', this.submitToLeaderboard.bind(this));
    
    // Datasets
    this.tools.set('uploadDataset', this.uploadDataset.bind(this));
    this.tools.set('getDataset', this.getDataset.bind(this));
    this.tools.set('listDatasets', this.listDatasets.bind(this));
    this.tools.set('validateDataset', this.validateDataset.bind(this));
    
    // Metrics and evaluation
    this.tools.set('evaluateTask', this.evaluateTask.bind(this));
    this.tools.set('calculateMetric', this.calculateMetric.bind(this));
    this.tools.set('addCustomMetric', this.addCustomMetric.bind(this));
    
    // Utilities
    this.tools.set('getSystemStatus', this.getSystemStatus.bind(this));
    this.tools.set('clearCache', this.clearCache.bind(this));
  }

  private initializeBuiltinBenchmarks(): void {
    for (const [benchmarkId, benchmark] of Object.entries(this.defaultBenchmarks)) {
      const fullBenchmark: BenchmarkDefinition = {
        id: uuidv4(),
        name: benchmark.name!,
        description: benchmark.description!,
        category: benchmark.category!,
        modelType: benchmark.modelType!,
        version: '1.0.0',
        dataset: {
          id: `${benchmarkId}-dataset`,
          name: `${benchmark.name} Dataset`,
          source: 'builtin',
          format: 'json',
          schema: {
            fields: [
              { name: 'input', type: 'text', required: true },
              { name: 'expected_output', type: 'text', required: true }
            ]
          }
        },
        tasks: benchmark.tasks!,
        metrics: benchmark.metrics || [],
        configuration: {
          iterations: 1,
          timeoutPerTask: 30000,
          parallelism: 3,
          warmupRuns: 1,
          failureThreshold: 0.1
        },
        requirements: {
          minimumModelCapabilities: ['text-generation'],
          requiredInputTypes: ['text'],
          outputFormats: ['text']
        },
        tags: [benchmark.category!],
        metadata: { builtin: true },
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      this.standardBenchmarks.set(fullBenchmark.id, fullBenchmark);
      this.benchmarks.set(fullBenchmark.id, fullBenchmark);
    }
  }

  private startBackgroundTasks(): void {
    // Process benchmark runs
    setInterval(() => {
      this.processBenchmarkQueue();
    }, 5000);
    
    // Update leaderboards
    setInterval(() => {
      this.updateLeaderboards();
    }, 300000); // Every 5 minutes
    
    // Cleanup old data
    setInterval(() => {
      this.cleanupOldData();
    }, 3600000); // Every hour
  }

  // Benchmark definition management
  async createBenchmark(params: any): Promise<{ content: { type: string; text: string }[] }> {
    this.validateRequired(params, ['name', 'category', 'modelType', 'tasks']);
    
    const id = params.id || uuidv4();
    const now = new Date();
    
    // Validate benchmark structure
    const validation = this.validateBenchmarkStructure(params);
    if (!validation.isValid) {
      return {
        success: false,
        message: 'Benchmark validation failed',
        errors: validation.errors
      };
    }
    
    const benchmark: BenchmarkDefinition = {
      id,
      name: params.name,
      description: params.description || '',
      category: params.category,
      modelType: params.modelType,
      version: params.version || '1.0.0',
      dataset: params.dataset,
      tasks: params.tasks,
      metrics: params.metrics || [],
      configuration: {
        sampleSize: params.sampleSize,
        randomSeed: params.randomSeed,
        iterations: params.iterations || 1,
        timeoutPerTask: params.timeoutPerTask || 30000,
        parallelism: params.parallelism || 3,
        warmupRuns: params.warmupRuns || 0,
        failureThreshold: params.failureThreshold || 0.1
      },
      requirements: params.requirements || {
        minimumModelCapabilities: [],
        requiredInputTypes: ['text'],
        outputFormats: ['text']
      },
      tags: params.tags || [],
      metadata: params.metadata || {},
      createdAt: now,
      updatedAt: now,
      createdBy: params.createdBy
    };
    
    this.benchmarks.set(id, benchmark);
    
    return {
      success: true,
      id,
      message: `Benchmark '${params.name}' created successfully`,
      benchmark
    };
  }
  
  private validateBenchmarkStructure(params: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Validate tasks
    if (!Array.isArray(params.tasks) || params.tasks.length === 0) {
      errors.push('Benchmark must have at least one task');
    }
    
    // Check task IDs are unique
    const taskIds = new Set();
    for (const task of params.tasks || []) {
      if (!task.id) {
        errors.push('All tasks must have an ID');
      } else if (taskIds.has(task.id)) {
        errors.push(`Duplicate task ID: ${task.id}`);
      } else {
        taskIds.add(task.id);
      }
      
      // Validate task structure
      if (!task.name || !task.inputTemplate || !task.evaluationCriteria) {
        errors.push(`Task '${task.id}' missing required fields`);
      }
    }
    
    // Validate dataset if provided
    if (params.dataset) {
      if (!params.dataset.schema || !params.dataset.schema.fields) {
        errors.push('Dataset must have a schema with fields defined');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  async getBenchmark(params: any): Promise<{ content: { type: string; text: string }[] }> {
    this.validateRequired(params, ['id']);
    const { id } = params;
    
    const benchmark = this.benchmarks.get(id);
    if (!benchmark) {
      return {
        success: false,
        message: `Benchmark with ID ${id} not found`
      };
    }
    
    return {
      success: true,
      benchmark
    };
  }
  
  async listBenchmarks(params: any): Promise<{ content: { type: string; text: string }[] }> {
    const category = params?.category;
    const modelType = params?.modelType;
    const tags = params?.tags as string[];
    
    let benchmarks = Array.from(this.benchmarks.values());
    
    // Apply filters
    if (category) {
      benchmarks = benchmarks.filter(b => b.category === category);
    }
    
    if (modelType) {
      benchmarks = benchmarks.filter(b => b.modelType === modelType);
    }
    
    if (tags && tags.length > 0) {
      benchmarks = benchmarks.filter(b => tags.some(tag => b.tags.includes(tag)));
    }
    
    return {
      success: true,
      count: benchmarks.length,
      benchmarks: benchmarks.map(b => ({
        id: b.id,
        name: b.name,
        description: b.description,
        category: b.category,
        modelType: b.modelType,
        taskCount: b.tasks.length,
        version: b.version,
        isBuiltin: b.metadata.builtin === true,
        createdAt: b.createdAt
      }))
    };
  }

  // Benchmark execution
  async runBenchmark(params: any): Promise<{ content: { type: string; text: string }[] }> {
    this.validateRequired(params, ['benchmarkId', 'modelIds']);
    const { benchmarkId, modelIds } = params;
    
    const benchmark = this.benchmarks.get(benchmarkId);
    if (!benchmark) {
      return {
        success: false,
        message: `Benchmark with ID ${benchmarkId} not found`
      };
    }
    
    // Validate model IDs exist (simplified check)
    if (!Array.isArray(modelIds) || modelIds.length === 0) {
      return {
        success: false,
        message: 'At least one model ID must be provided'
      };
    }
    
    const runId = uuidv4();
    const now = new Date();
    
    const run: BenchmarkRun = {
      id: runId,
      benchmarkId,
      modelIds,
      configuration: {
        evaluationMode: params.evaluationMode || 'standard',
        outputDetail: params.outputDetail || 'standard',
        costTracking: params.costTracking !== false,
        saveIntermediateResults: params.saveIntermediateResults !== false,
        enableCaching: params.enableCaching !== false,
        customParameters: params.customParameters
      },
      status: 'pending',
      progress: {
        totalTasks: benchmark.tasks.length * modelIds.length,
        completedTasks: 0,
        failedTasks: 0,
        percentage: 0
      },
      results: [],
      timeline: [],
      startTime: now,
      createdBy: params.createdBy
    };
    
    this.runs.set(runId, run);
    this.logRunEvent(run, 'start', 'Benchmark run started');
    
    // Start execution asynchronously
    setImmediate(() => {
      this.executeBenchmarkRun(run, benchmark);
    });
    
    return {
      success: true,
      runId,
      message: `Benchmark run started for ${modelIds.length} model(s)`,
      estimatedDuration: this.estimateRunDuration(benchmark, modelIds.length)
    };
  }
  
  private async executeBenchmarkRun(run: BenchmarkRun, benchmark: BenchmarkDefinition): Promise<void> {
    this.activeRuns.add(run.id);
    run.status = 'running';
    
    try {
      for (const modelId of run.modelIds) {
        const modelResult = await this.runBenchmarkForModel(run, benchmark, modelId);
        run.results.push(modelResult);
        
        this.updateRunProgress(run);
        this.logRunEvent(run, 'progress', `Completed model ${modelId}`);
      }
      
      // Generate comparison if multiple models
      if (run.results.length > 1) {
        run.comparison = this.generateComparison(run.results);
      }
      
      run.status = 'completed';
      run.endTime = new Date();
      run.duration = run.endTime.getTime() - run.startTime.getTime();
      
      this.logRunEvent(run, 'complete', 'Benchmark run completed successfully');
      
    } catch (error) {
      run.status = 'failed';
      run.endTime = new Date();
      run.duration = run.endTime!.getTime() - run.startTime.getTime();
      
      this.logRunEvent(run, 'error', `Benchmark run failed: ${(error as Error).message}`);
    } finally {
      this.activeRuns.delete(run.id);
    }
  }
  
  private async runBenchmarkForModel(run: BenchmarkRun, benchmark: BenchmarkDefinition, modelId: string): Promise<ModelResult> {
    const modelResult: ModelResult = {
      modelId,
      modelName: `Model ${modelId}`, // Would be fetched from model registry
      overallScore: 0,
      taskResults: [],
      metrics: {},
      statistics: {
        mean: 0,
        median: 0,
        standardDeviation: 0,
        min: 0,
        max: 0,
        percentiles: {},
        confidence: { level: 0.95, interval: [0, 1] }
      },
      errors: [],
      metadata: {
        totalTokens: 0,
        totalCost: 0,
        averageLatency: 0,
        successRate: 0
      }
    };
    
    // Run each task
    for (const task of benchmark.tasks) {
      try {
        const taskResult = await this.executeTask(task, modelId, run.configuration);
        modelResult.taskResults.push(taskResult);
        
        if (taskResult.status === 'completed') {
          // Aggregate metrics
          for (const [metric, score] of Object.entries(taskResult.scores)) {
            modelResult.metrics[metric] = (modelResult.metrics[metric] || 0) + score;
          }
        }
        
        // Update run progress
        run.progress.completedTasks += 1;
        if (taskResult.status === 'failed') {
          run.progress.failedTasks += 1;
        }
        
      } catch (error) {
        const errorResult: TaskResult = {
          taskId: task.id,
          status: 'failed',
          input: {},
          scores: {},
          latency: 0,
          errorMessage: (error as Error).message
        };
        
        modelResult.taskResults.push(errorResult);
        modelResult.errors.push({
          id: uuidv4(),
          taskId: task.id,
          timestamp: new Date(),
          type: 'system_error',
          message: (error as Error).message
        });
        
        run.progress.failedTasks += 1;
      }
    }
    
    // Calculate overall statistics
    this.calculateModelStatistics(modelResult);
    
    return modelResult;
  }
  
  private async executeTask(task: BenchmarkTask, modelId: string, config: RunConfiguration): Promise<TaskResult> {
    const startTime = Date.now();
    
    // Simulate task execution
    // In a real implementation, this would call the actual model
    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 500));
    
    const latency = Date.now() - startTime;
    
    // Generate simulated results
    const simulatedOutput = `Simulated output for task ${task.id} from model ${modelId}`;
    const inputTokens = Math.floor(Math.random() * 100) + 50;
    const outputTokens = Math.floor(Math.random() * 200) + 100;
    
    // Calculate scores based on evaluation criteria
    const scores: Record<string, number> = {};
    for (const criteria of task.evaluationCriteria) {
      scores[criteria.metric] = this.calculateMetricScore(criteria.metric, simulatedOutput, task);
    }
    
    return {
      taskId: task.id,
      status: 'completed',
      input: `Input for task ${task.id}`,
      output: simulatedOutput,
      expectedOutput: `Expected output for task ${task.id}`,
      scores,
      latency,
      tokens: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens
      },
      cost: (inputTokens * 0.0001) + (outputTokens * 0.0002)
    };
  }
  
  private calculateMetricScore(metric: MetricType, output: string, task: BenchmarkTask): number {
    // Simplified metric calculation
    // In a real implementation, this would use proper evaluation functions
    
    switch (metric) {
      case 'accuracy':
        return Math.random() * 0.3 + 0.7; // 70-100%
      case 'exact_match':
        return Math.random() > 0.3 ? 1 : 0; // 70% match rate
      case 'latency':
        return Math.random() * 1000 + 200; // 200-1200ms
      case 'cost_per_token':
        return Math.random() * 0.0005 + 0.0001; // $0.0001-0.0006
      default:
        return Math.random() * 0.4 + 0.6; // 60-100%
    }
  }
  
  private calculateModelStatistics(result: ModelResult): void {
    const completedTasks = result.taskResults.filter(t => t.status === 'completed');
    
    if (completedTasks.length === 0) {
      return;
    }
    
    // Calculate success rate
    result.metadata.successRate = completedTasks.length / result.taskResults.length;
    
    // Calculate aggregate metrics
    const metricValues = Object.values(result.metrics);
    if (metricValues.length > 0) {
      result.statistics.mean = metricValues.reduce((sum, val) => sum + val, 0) / metricValues.length;
      result.statistics.min = Math.min(...metricValues);
      result.statistics.max = Math.max(...metricValues);
      
      // Standard deviation
      const variance = metricValues.reduce((sum, val) => sum + Math.pow(val - result.statistics.mean, 2), 0) / metricValues.length;
      result.statistics.standardDeviation = Math.sqrt(variance);
      
      // Median
      const sorted = [...metricValues].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      result.statistics.median = sorted.length % 2 === 0 
        ? (sorted[mid - 1] + sorted[mid]) / 2 
        : sorted[mid];
    }
    
    // Calculate overall score (weighted average of normalized metrics)
    result.overallScore = result.statistics.mean;
    
    // Aggregate token and cost data
    result.metadata.totalTokens = completedTasks.reduce((sum, task) => sum + (task.tokens?.total || 0), 0);
    result.metadata.totalCost = completedTasks.reduce((sum, task) => sum + (task.cost || 0), 0);
    result.metadata.averageLatency = completedTasks.reduce((sum, task) => sum + task.latency, 0) / completedTasks.length;
  }
  
  private generateComparison(results: ModelResult[]): ComparisonResult {
    // Generate rankings
    const rankings: ModelRanking[] = results
      .map((result, index) => ({
        rank: index + 1,
        modelId: result.modelId,
        modelName: result.modelName,
        overallScore: result.overallScore,
        relativePerformance: result.overallScore / Math.max(...results.map(r => r.overallScore)),
        strengths: this.identifyStrengths(result, results),
        weaknesses: this.identifyWeaknesses(result, results)
      }))
      .sort((a, b) => b.overallScore - a.overallScore)
      .map((ranking, index) => ({ ...ranking, rank: index + 1 }));
    
    // Generate analysis
    const analysis: ComparisonAnalysis = {
      bestOverall: rankings[0].modelId,
      bestPerTask: this.findBestPerTask(results),
      mostCostEffective: this.findMostCostEffective(results),
      fastest: this.findFastest(results),
      mostReliable: this.findMostReliable(results),
      recommendations: this.generateRecommendations(results, rankings)
    };
    
    return {
      rankings,
      significanceTests: [],
      improvements: [],
      analysis
    };
  }
  
  private identifyStrengths(result: ModelResult, allResults: ModelResult[]): string[] {
    const strengths: string[] = [];
    
    // Compare each metric against average
    for (const [metric, score] of Object.entries(result.metrics)) {
      const avgScore = allResults.reduce((sum, r) => sum + (r.metrics[metric] || 0), 0) / allResults.length;
      if (score > avgScore * 1.1) { // 10% better than average
        strengths.push(`Excellent ${metric} performance`);
      }
    }
    
    return strengths;
  }
  
  private identifyWeaknesses(result: ModelResult, allResults: ModelResult[]): string[] {
    const weaknesses: string[] = [];
    
    // Compare each metric against average
    for (const [metric, score] of Object.entries(result.metrics)) {
      const avgScore = allResults.reduce((sum, r) => sum + (r.metrics[metric] || 0), 0) / allResults.length;
      if (score < avgScore * 0.9) { // 10% worse than average
        weaknesses.push(`Below average ${metric} performance`);
      }
    }
    
    return weaknesses;
  }
  
  private findBestPerTask(results: ModelResult[]): Record<string, string> {
    const bestPerTask: Record<string, string> = {};
    
    // Get all unique task IDs
    const taskIds = new Set(results.flatMap(r => r.taskResults.map(t => t.taskId)));
    
    for (const taskId of taskIds) {
      let bestScore = -1;
      let bestModel = '';
      
      for (const result of results) {
        const taskResult = result.taskResults.find(t => t.taskId === taskId);
        if (taskResult && taskResult.status === 'completed') {
          const avgScore = Object.values(taskResult.scores).reduce((sum, score) => sum + score, 0) / Object.values(taskResult.scores).length;
          if (avgScore > bestScore) {
            bestScore = avgScore;
            bestModel = result.modelId;
          }
        }
      }
      
      if (bestModel) {
        bestPerTask[taskId] = bestModel;
      }
    }
    
    return bestPerTask;
  }
  
  private findMostCostEffective(results: ModelResult[]): string {
    let bestRatio = 0;
    let bestModel = '';
    
    for (const result of results) {
      if (result.metadata.totalCost > 0) {
        const ratio = result.overallScore / result.metadata.totalCost;
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestModel = result.modelId;
        }
      }
    }
    
    return bestModel || results[0]?.modelId;
  }
  
  private findFastest(results: ModelResult[]): string {
    let fastestLatency = Infinity;
    let fastestModel = '';
    
    for (const result of results) {
      if (result.metadata.averageLatency < fastestLatency) {
        fastestLatency = result.metadata.averageLatency;
        fastestModel = result.modelId;
      }
    }
    
    return fastestModel || results[0]?.modelId;
  }
  
  private findMostReliable(results: ModelResult[]): string {
    let bestReliability = 0;
    let bestModel = '';
    
    for (const result of results) {
      if (result.metadata.successRate > bestReliability) {
        bestReliability = result.metadata.successRate;
        bestModel = result.modelId;
      }
    }
    
    return bestModel || results[0]?.modelId;
  }
  
  private generateRecommendations(results: ModelResult[], rankings: ModelRanking[]): string[] {
    const recommendations: string[] = [];
    
    if (rankings.length >= 2) {
      const top = rankings[0];
      const second = rankings[1];
      
      recommendations.push(`${top.modelName} leads overall with ${(top.overallScore * 100).toFixed(1)}% score`);
      
      if (top.overallScore - second.overallScore < 0.1) {
        recommendations.push('Top models are very close in performance - consider cost and speed factors');
      }
    }
    
    // Cost-effectiveness recommendation
    const costEffective = this.findMostCostEffective(results);
    const costEffectiveResult = results.find(r => r.modelId === costEffective);
    if (costEffectiveResult) {
      recommendations.push(`${costEffectiveResult.modelName} offers the best cost-effectiveness ratio`);
    }
    
    return recommendations;
  }
  
  private updateRunProgress(run: BenchmarkRun): void {
    run.progress.percentage = (run.progress.completedTasks / run.progress.totalTasks) * 100;
  }
  
  private logRunEvent(run: BenchmarkRun, type: string, message: string): void {
    const event: RunEvent = {
      id: uuidv4(),
      timestamp: new Date(),
      type: type as any,
      message
    };
    
    run.timeline.push(event);
  }
  
  private estimateRunDuration(benchmark: BenchmarkDefinition, modelCount: number): number {
    // Rough estimation based on task count and complexity
    const avgTaskTime = 30000; // 30 seconds per task
    const setupTime = 10000; // 10 seconds setup
    
    return (benchmark.tasks.length * modelCount * avgTaskTime) + setupTime;
  }

  // Results and analysis methods
  async getBenchmarkRun(params: any): Promise<{ content: { type: string; text: string }[] }> {
    this.validateRequired(params, ['id']);
    const { id } = params;
    
    const run = this.runs.get(id);
    if (!run) {
      return {
        success: false,
        message: `Benchmark run with ID ${id} not found`
      };
    }
    
    return {
      success: true,
      run
    };
  }
  
  async getResults(params: any): Promise<{ content: { type: string; text: string }[] }> {
    this.validateRequired(params, ['runId']);
    const { runId } = params;
    
    const run = this.runs.get(runId);
    if (!run) {
      return {
        success: false,
        message: `Benchmark run with ID ${runId} not found`
      };
    }
    
    const includeDetails = params.includeDetails !== false;
    
    const results = {
      runId,
      status: run.status,
      progress: run.progress,
      results: includeDetails ? run.results : run.results.map(r => ({
        modelId: r.modelId,
        modelName: r.modelName,
        overallScore: r.overallScore,
        metadata: r.metadata
      })),
      comparison: run.comparison,
      summary: {
        totalModels: run.results.length,
        completedModels: run.results.filter(r => r.taskResults.every(t => t.status === 'completed')).length,
        averageScore: run.results.reduce((sum, r) => sum + r.overallScore, 0) / Math.max(run.results.length, 1),
        totalCost: run.results.reduce((sum, r) => sum + r.metadata.totalCost, 0),
        totalTokens: run.results.reduce((sum, r) => sum + r.metadata.totalTokens, 0)
      }
    };
    
    return {
      success: true,
      results
    };
  }

  // Utility methods (simplified implementations)
  private processBenchmarkQueue(): void {
    // Process queued benchmark runs
  }
  
  private updateLeaderboards(): void {
    // Update leaderboard rankings
  }
  
  private cleanupOldData(): void {
    // Clean up old benchmark runs and cached data
  }

  // Required method implementations (simplified)
  async updateBenchmark(params: any): Promise<{ content: { type: string; text: string }[] }> {
    return { success: true, message: "Update benchmark not implemented" };
  }
  
  async deleteBenchmark(params: any): Promise<{ content: { type: string; text: string }[] }> {
    return { success: true, message: "Delete benchmark not implemented" };
  }
  
  async cloneBenchmark(params: any): Promise<{ content: { type: string; text: string }[] }> {
    return { success: true, message: "Clone benchmark not implemented" };
  }
  
  async listBenchmarkRuns(params: any): Promise<{ content: { type: string; text: string }[] }> {
    const benchmarkId = params?.benchmarkId;
    let runs = Array.from(this.runs.values());
    
    if (benchmarkId) {
      runs = runs.filter(r => r.benchmarkId === benchmarkId);
    }
    
    return {
      success: true,
      count: runs.length,
      runs: runs.map(r => ({
        id: r.id,
        benchmarkId: r.benchmarkId,
        status: r.status,
        progress: r.progress,
        modelCount: r.modelIds.length,
        startTime: r.startTime,
        duration: r.duration
      }))
    };
  }
  
  async cancelBenchmarkRun(params: any): Promise<{ content: { type: string; text: string }[] }> {
    this.validateRequired(params, ['id']);
    const { id } = params;
    
    const run = this.runs.get(id);
    if (!run) {
      return {
        success: false,
        message: `Benchmark run with ID ${id} not found`
      };
    }
    
    if (run.status === 'running') {
      run.status = 'cancelled';
      this.activeRuns.delete(id);
      return {
        success: true,
        message: 'Benchmark run cancelled successfully'
      };
    }
    
    return {
      success: false,
      message: `Cannot cancel run in status: ${run.status}`
    };
  }
  
  async retryBenchmarkRun(params: any): Promise<{ content: { type: string; text: string }[] }> {
    return { success: true, message: "Retry benchmark run not implemented" };
  }
  
  async compareModels(params: any): Promise<{ content: { type: string; text: string }[] }> {
    return { success: true, message: "Compare models not implemented" };
  }
  
  async analyzePerformance(params: any): Promise<{ content: { type: string; text: string }[] }> {
    return { success: true, message: "Analyze performance not implemented" };
  }
  
  async generateReport(params: any): Promise<{ content: { type: string; text: string }[] }> {
    return { success: true, message: "Generate report not implemented" };
  }
  
  async exportResults(params: any): Promise<{ content: { type: string; text: string }[] }> {
    return { success: true, message: "Export results not implemented" };
  }
  
  async createLeaderboard(params: any): Promise<{ content: { type: string; text: string }[] }> {
    return { success: true, message: "Create leaderboard not implemented" };
  }
  
  async getLeaderboard(params: any): Promise<{ content: { type: string; text: string }[] }> {
    return { success: true, message: "Get leaderboard not implemented" };
  }
  
  async updateLeaderboard(params: any): Promise<{ content: { type: string; text: string }[] }> {
    return { success: true, message: "Update leaderboard not implemented" };
  }
  
  async submitToLeaderboard(params: any): Promise<{ content: { type: string; text: string }[] }> {
    return { success: true, message: "Submit to leaderboard not implemented" };
  }
  
  async uploadDataset(params: any): Promise<{ content: { type: string; text: string }[] }> {
    return { success: true, message: "Upload dataset not implemented" };
  }
  
  async getDataset(params: any): Promise<{ content: { type: string; text: string }[] }> {
    return { success: true, message: "Get dataset not implemented" };
  }
  
  async listDatasets(params: any): Promise<{ content: { type: string; text: string }[] }> {
    return { success: true, datasets: [] };
  }
  
  async validateDataset(params: any): Promise<{ content: { type: string; text: string }[] }> {
    return { success: true, message: "Validate dataset not implemented" };
  }
  
  async evaluateTask(params: any): Promise<{ content: { type: string; text: string }[] }> {
    return { success: true, message: "Evaluate task not implemented" };
  }
  
  async calculateMetric(params: any): Promise<{ content: { type: string; text: string }[] }> {
    return { success: true, message: "Calculate metric not implemented" };
  }
  
  async addCustomMetric(params: any): Promise<{ content: { type: string; text: string }[] }> {
    return { success: true, message: "Add custom metric not implemented" };
  }
  
  async getSystemStatus(params: any): Promise<{ content: { type: string; text: string }[] }> {
    return {
      success: true,
      status: {
        activeRuns: this.activeRuns.size,
        totalBenchmarks: this.benchmarks.size,
        totalRuns: this.runs.size,
        cacheSize: this.resultCache.size,
        uptime: process.uptime()
      }
    };
  }
  
  async clearCache(params: any): Promise<{ content: { type: string; text: string }[] }> {
    this.resultCache.clear();
    return {
      success: true,
      message: 'Cache cleared successfully'
    };
  }

  // BaseMCPServer abstract method implementation
  async handleRequest(method: string, params: any): Promise<{ content: { type: string; text: string }[] }> {
    const tool = this.tools.get(method);
    
    if (!tool) {
      return {
        success: false,
        message: `Method ${method} not found`
      };
    }
    
    try {
      return await tool(params);
    } catch (error) {
      return {
        success: false,
        message: `Error processing request: ${(error as Error).message}`
      };
    }
  }
}