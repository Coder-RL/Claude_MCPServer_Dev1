import { BaseMCPServer } from '../../shared/base-server.js';

export interface SparseAttentionConfig {
  id: string;
  name: string;
  type: 'strided' | 'fixed' | 'random' | 'learned' | 'local_global' | 'bigbird' | 'longformer' | 'linformer';
  sequenceLength: number;
  numHeads: number;
  headDim: number;

  // Sparsity parameters
  sparsityRatio: number; // fraction of attention weights that are zero
  windowSize?: number; // for local attention
  globalTokens?: number; // number of global attention tokens
  strideSize?: number; // for strided attention
  blockSize?: number; // for block-based attention
  randomSeed?: number; // for reproducible random patterns

  // Performance optimizations
  useTriton?: boolean;
  useCuda?: boolean;
  useFlash?: boolean;
  precision: 'fp16' | 'bf16' | 'fp32';

  // Pattern-specific parameters
  patternParams: Record<string, any>;

  createdAt: Date;
  updatedAt: Date;
}

export interface AttentionPattern {
  patternId: string;
  configId: string;
  type: string;
  shape: [number, number]; // [seq_len, seq_len]
  sparsityRatio: number;
  patternData: boolean[][]; // attention mask
  metadata: {
    totalElements: number;
    nonZeroElements: number;
    memoryReduction: number;
    computeReduction: number;
  };
  createdAt: Date;
}

export interface SparseAttentionExecution {
  executionId: string;
  configId: string;
  patternId: string;
  inputShape: [number, number, number]; // [batch, seq_len, hidden_dim]

  // Performance metrics
  executionTime: number;
  memoryUsage: number;
  flops: number;
  sparsityAchieved: number;

  // Quality metrics
  attentionEntropy: number;
  informationRetention: number;
  gradientSparsity?: number;

  // Comparison with dense attention
  denseComparison?: {
    speedup: number;
    memoryReduction: number;
    qualityLoss: number;
  };

  status: 'success' | 'failed' | 'timeout';
  timestamp: Date;
}

export interface PatternAnalysis {
  patternId: string;
  analysisType: 'connectivity' | 'locality' | 'efficiency' | 'information_flow' | 'comprehensive';
  results: {
    connectivityScore: number;
    localityIndex: number;
    efficiencyRating: number;
    informationFlowMetrics: Record<string, number>;
    bottleneckAnalysis: string[];
    recommendedOptimizations: string[];
  };
  visualizationData?: any;
  timestamp: Date;
}

export class SparseAttentionEngine extends BaseMCPServer {
  static async main() {
    const server = new SparseAttentionEngine();
    await server.start();
  }

  private configs: Map<string, SparseAttentionConfig> = new Map();
  private patterns: Map<string, AttentionPattern> = new Map();
  private executions: Map<string, SparseAttentionExecution> = new Map();
  private analyses: Map<string, PatternAnalysis> = new Map();
  private patternCache: Map<string, boolean[][]> = new Map();

  constructor() {
    super('sparse-attention-engine', 'Advanced sparse attention patterns for efficient transformer processing');
    this.initializeStandardConfigs();
    this.setupTools();
  }

  async handleRequest(method: string, params: any): Promise<any> {
    this.logOperation(method, params);

    switch (method) {
      case 'create_sparse_attention_config':
        return this.createSparseAttentionConfig(params);
      case 'generate_attention_pattern':
        return this.generateAttentionPattern(params);
      case 'execute_sparse_attention':
        return this.executeSparseAttention(params);
      case 'analyze_attention_pattern':
        return this.analyzeAttentionPattern(params);
      case 'optimize_sparsity_pattern':
        return this.optimizeSparsityPattern(params);
      case 'compare_sparsity_patterns':
        return this.compareSparsityPatterns(params);
      case 'adaptive_sparsity_tuning':
        return this.adaptiveSparsityTuning(params);
      default:
        throw new Error(`Method ${method} not implemented`);
    }
  }

  private initializeStandardConfigs() {
    // Longformer-style sliding window + global attention
    this.configs.set('longformer-base', {
      id: 'longformer-base',
      name: 'Longformer Sliding Window',
      type: 'longformer',
      sequenceLength: 4096,
      numHeads: 12,
      headDim: 64,
      sparsityRatio: 0.95,
      windowSize: 512,
      globalTokens: 8,
      precision: 'fp16',
      patternParams: {
        windowSize: 512,
        globalIndices: [0, 1, 2, 3], // CLS, SEP, etc.
        dilatedRatio: 1
      },
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // BigBird random + global + window
    this.configs.set('bigbird-base', {
      id: 'bigbird-base',
      name: 'BigBird Sparse Attention',
      type: 'bigbird',
      sequenceLength: 4096,
      numHeads: 12,
      headDim: 64,
      sparsityRatio: 0.93,
      windowSize: 64,
      globalTokens: 64,
      blockSize: 64,
      randomSeed: 42,
      precision: 'fp16',
      patternParams: {
        numRandomBlocks: 3,
        blockSize: 64,
        windowSize: 64,
        globalTokenRatio: 0.01
      },
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Strided attention for very long sequences
    this.configs.set('strided-efficient', {
      id: 'strided-efficient',
      name: 'Strided Attention Pattern',
      type: 'strided',
      sequenceLength: 8192,
      numHeads: 8,
      headDim: 64,
      sparsityRatio: 0.98,
      strideSize: 128,
      precision: 'fp16',
      patternParams: {
        strideSize: 128,
        offsetPattern: [0, 32, 64, 96]
      },
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Local attention with fixed window
    this.configs.set('local-window', {
      id: 'local-window',
      name: 'Local Window Attention',
      type: 'local_global',
      sequenceLength: 2048,
      numHeads: 16,
      headDim: 64,
      sparsityRatio: 0.90,
      windowSize: 256,
      precision: 'bf16',
      patternParams: {
        leftContext: 128,
        rightContext: 128,
        causalMask: true
      },
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Linformer low-rank approximation
    this.configs.set('linformer-projected', {
      id: 'linformer-projected',
      name: 'Linformer Projection',
      type: 'linformer',
      sequenceLength: 4096,
      numHeads: 12,
      headDim: 64,
      sparsityRatio: 0.85,
      precision: 'fp32',
      patternParams: {
        projectionDim: 256,
        sharedProjection: true,
        layerSharing: false
      },
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  private setupTools() {
    this.addTool({
      name: 'create_sparse_attention_config',
      description: 'Create a sparse attention configuration',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name for the configuration' },
          type: {
            type: 'string',
            enum: ['strided', 'fixed', 'random', 'learned', 'local_global', 'bigbird', 'longformer', 'linformer'],
            description: 'Type of sparse attention pattern'
          },
          sequenceLength: { type: 'number', description: 'Maximum sequence length' },
          numHeads: { type: 'number', description: 'Number of attention heads' },
          sparsityRatio: { type: 'number', description: 'Target sparsity ratio (0-1)' },
          patternParams: { type: 'object', description: 'Pattern-specific parameters' }
        },
        required: ['name', 'type', 'sequenceLength', 'numHeads', 'sparsityRatio']
      }
    });

    this.addTool({
      name: 'generate_attention_pattern',
      description: 'Generate sparse attention pattern from configuration',
      inputSchema: {
        type: 'object',
        properties: {
          configId: { type: 'string', description: 'Configuration to use' },
          sequenceLength: { type: 'number', description: 'Actual sequence length' },
          cachePattern: { type: 'boolean', description: 'Cache the generated pattern' }
        },
        required: ['configId']
      }
    });

    this.addTool({
      name: 'execute_sparse_attention',
      description: 'Execute sparse attention computation',
      inputSchema: {
        type: 'object',
        properties: {
          configId: { type: 'string', description: 'Attention configuration' },
          inputTensor: { type: 'array', description: 'Input tensor data' },
          benchmarkDense: { type: 'boolean', description: 'Compare with dense attention' },
          profileExecution: { type: 'boolean', description: 'Profile performance metrics' }
        },
        required: ['configId', 'inputTensor']
      }
    });

    this.addTool({
      name: 'analyze_attention_pattern',
      description: 'Analyze properties of a sparse attention pattern',
      inputSchema: {
        type: 'object',
        properties: {
          patternId: { type: 'string', description: 'Pattern to analyze' },
          analysisType: {
            type: 'string',
            enum: ['connectivity', 'locality', 'efficiency', 'information_flow', 'comprehensive'],
            description: 'Type of analysis to perform'
          },
          generateVisualization: { type: 'boolean', description: 'Generate visualization data' }
        },
        required: ['patternId', 'analysisType']
      }
    });

    this.addTool({
      name: 'optimize_sparsity_pattern',
      description: 'Optimize sparse attention pattern for specific metrics',
      inputSchema: {
        type: 'object',
        properties: {
          baseConfigId: { type: 'string', description: 'Base configuration to optimize' },
          targetMetrics: {
            type: 'object',
            description: 'Target optimization metrics (speed, memory, quality)'
          },
          constraints: { type: 'object', description: 'Optimization constraints' },
          optimizationSteps: { type: 'number', description: 'Number of optimization iterations' }
        },
        required: ['baseConfigId', 'targetMetrics']
      }
    });

    this.addTool({
      name: 'compare_sparsity_patterns',
      description: 'Compare multiple sparse attention patterns',
      inputSchema: {
        type: 'object',
        properties: {
          configIds: { type: 'array', items: { type: 'string' }, description: 'Configurations to compare' },
          comparisonMetrics: {
            type: 'array',
            items: { type: 'string' },
            description: 'Metrics to compare (speed, memory, quality, sparsity)'
          },
          testSequenceLengths: { type: 'array', items: { type: 'number' }, description: 'Sequence lengths to test' }
        },
        required: ['configIds', 'comparisonMetrics']
      }
    });

    this.addTool({
      name: 'adaptive_sparsity_tuning',
      description: 'Automatically tune sparsity pattern based on input characteristics',
      inputSchema: {
        type: 'object',
        properties: {
          baseConfigId: { type: 'string', description: 'Base configuration' },
          inputCharacteristics: {
            type: 'object',
            description: 'Input data characteristics (length distribution, attention patterns)'
          },
          performanceGoals: { type: 'object', description: 'Performance optimization goals' },
          adaptationStrategy: {
            type: 'string',
            enum: ['conservative', 'aggressive', 'balanced', 'custom'],
            description: 'Adaptation strategy'
          }
        },
        required: ['baseConfigId', 'inputCharacteristics']
      }
    });
  }

  async createSparseAttentionConfig(params: any): Promise<any> {
    const { name, type, sequenceLength, numHeads, sparsityRatio, patternParams = {} } = params;

    this.validateRequired(params, ['name', 'type', 'sequenceLength', 'numHeads', 'sparsityRatio']);

    const configId = this.generateId();
    const headDim = 64; // default head dimension

    const config: SparseAttentionConfig = {
      id: configId,
      name,
      type,
      sequenceLength,
      numHeads,
      headDim,
      sparsityRatio,
      precision: 'fp16',
      patternParams,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Validate and adjust sparsity ratio
    config.sparsityRatio = Math.max(0.1, Math.min(0.99, sparsityRatio));

    // Set type-specific defaults
    this.setTypeSpecificDefaults(config);

    this.configs.set(configId, config);
    this.logOperation('create_sparse_attention_config', params, configId);

    return {
      configId,
      config,
      estimatedMemoryReduction: this.estimateMemoryReduction(config),
      estimatedSpeedup: this.estimateSpeedup(config),
      recommendedUseCases: this.getRecommendedUseCases(config.type)
    };
  }

  async generateAttentionPattern(params: any): Promise<any> {
    const { configId, sequenceLength, cachePattern = true } = params;

    this.validateRequired(params, ['configId']);

    if (!this.configs.has(configId)) {
      throw new Error(`Configuration ${configId} not found`);
    }

    const config = this.configs.get(configId)!;
    const actualSeqLen = sequenceLength || config.sequenceLength;
    const patternId = this.generateId();

    // Check cache first
    const cacheKey = `${configId}_${actualSeqLen}`;
    let patternData: boolean[][];

    if (this.patternCache.has(cacheKey)) {
      patternData = this.patternCache.get(cacheKey)!;
    } else {
      patternData = this.generatePatternData(config, actualSeqLen);

      if (cachePattern) {
        this.patternCache.set(cacheKey, patternData);
      }
    }

    const pattern: AttentionPattern = {
      patternId,
      configId,
      type: config.type,
      shape: [actualSeqLen, actualSeqLen],
      sparsityRatio: this.calculateActualSparsity(patternData),
      patternData,
      metadata: {
        totalElements: actualSeqLen * actualSeqLen,
        nonZeroElements: this.countNonZeroElements(patternData),
        memoryReduction: this.calculateMemoryReduction(patternData),
        computeReduction: this.calculateComputeReduction(patternData)
      },
      createdAt: new Date()
    };

    this.patterns.set(patternId, pattern);
    this.logOperation('generate_attention_pattern', params, patternId);

    return {
      patternId,
      shape: pattern.shape,
      sparsityRatio: pattern.sparsityRatio,
      metadata: pattern.metadata,
      visualizationData: this.generateVisualizationData(pattern)
    };
  }

  async executeSparseAttention(params: any): Promise<any> {
    const { configId, inputTensor, benchmarkDense = false, profileExecution = true } = params;

    this.validateRequired(params, ['configId', 'inputTensor']);

    if (!this.configs.has(configId)) {
      throw new Error(`Configuration ${configId} not found`);
    }

    const config = this.configs.get(configId)!;
    const executionId = this.generateId();

    // Simulate input tensor processing
    const inputShape = this.getInputShape(inputTensor);
    const [batchSize, seqLen, hiddenDim] = inputShape;

    // Generate pattern for this sequence length
    const patternResult = await this.generateAttentionPattern({
      configId,
      sequenceLength: seqLen,
      cachePattern: true
    });

    // Simulate sparse attention execution
    const startTime = Date.now();
    const sparseResults = this.simulateSparseAttentionCompute(config, inputShape, patternResult.patternId);
    const endTime = Date.now();

    const execution: SparseAttentionExecution = {
      executionId,
      configId,
      patternId: patternResult.patternId,
      inputShape,
      executionTime: endTime - startTime,
      memoryUsage: sparseResults.memoryUsage,
      flops: sparseResults.flops,
      sparsityAchieved: sparseResults.sparsityAchieved,
      attentionEntropy: sparseResults.attentionEntropy,
      informationRetention: sparseResults.informationRetention,
      status: 'success',
      timestamp: new Date()
    };

    // Benchmark against dense attention if requested
    if (benchmarkDense) {
      const denseResults = this.simulateDenseAttentionCompute(config, inputShape);
      execution.denseComparison = {
        speedup: denseResults.executionTime / execution.executionTime,
        memoryReduction: (denseResults.memoryUsage - execution.memoryUsage) / denseResults.memoryUsage,
        qualityLoss: 1 - execution.informationRetention
      };
    }

    this.executions.set(executionId, execution);
    this.logOperation('execute_sparse_attention', params, executionId);

    return {
      executionId,
      performance: {
        executionTime: execution.executionTime,
        memoryUsage: this.formatBytes(execution.memoryUsage),
        flops: execution.flops,
        sparsityAchieved: execution.sparsityAchieved
      },
      quality: {
        attentionEntropy: execution.attentionEntropy,
        informationRetention: execution.informationRetention
      },
      denseComparison: execution.denseComparison,
      recommendations: this.generateExecutionRecommendations(execution, config)
    };
  }

  async analyzeAttentionPattern(params: any): Promise<any> {
    const { patternId, analysisType, generateVisualization = false } = params;

    this.validateRequired(params, ['patternId', 'analysisType']);

    if (!this.patterns.has(patternId)) {
      throw new Error(`Pattern ${patternId} not found`);
    }

    const pattern = this.patterns.get(patternId)!;
    const analysisId = this.generateId();

    const analysis: PatternAnalysis = {
      patternId,
      analysisType,
      results: {
        connectivityScore: 0,
        localityIndex: 0,
        efficiencyRating: 0,
        informationFlowMetrics: {},
        bottleneckAnalysis: [],
        recommendedOptimizations: []
      },
      timestamp: new Date()
    };

    // Perform analysis based on type
    switch (analysisType) {
      case 'connectivity':
        analysis.results = { ...analysis.results, ...this.analyzeConnectivity(pattern) };
        break;
      case 'locality':
        analysis.results = { ...analysis.results, ...this.analyzeLocality(pattern) };
        break;
      case 'efficiency':
        analysis.results = { ...analysis.results, ...this.analyzeEfficiency(pattern) };
        break;
      case 'information_flow':
        analysis.results = { ...analysis.results, ...this.analyzeInformationFlow(pattern) };
        break;
      case 'comprehensive':
        analysis.results = {
          ...this.analyzeConnectivity(pattern),
          ...this.analyzeLocality(pattern),
          ...this.analyzeEfficiency(pattern),
          ...this.analyzeInformationFlow(pattern)
        };
        break;
    }

    if (generateVisualization) {
      analysis.visualizationData = this.generateAnalysisVisualization(pattern, analysis);
    }

    this.analyses.set(analysisId, analysis);
    this.logOperation('analyze_attention_pattern', params, analysisId);

    return {
      analysisId,
      patternId,
      analysisType,
      results: analysis.results,
      visualizationData: analysis.visualizationData,
      summary: this.generateAnalysisSummary(analysis)
    };
  }

  private setTypeSpecificDefaults(config: SparseAttentionConfig): void {
    switch (config.type) {
      case 'longformer':
        config.windowSize = config.patternParams.windowSize || 512;
        config.globalTokens = config.patternParams.globalTokens || 8;
        break;
      case 'bigbird':
        config.windowSize = config.patternParams.windowSize || 64;
        config.blockSize = config.patternParams.blockSize || 64;
        config.globalTokens = config.patternParams.globalTokens || 64;
        config.randomSeed = config.patternParams.randomSeed || 42;
        break;
      case 'strided':
        config.strideSize = config.patternParams.strideSize || 128;
        break;
      case 'local_global':
        config.windowSize = config.patternParams.windowSize || 256;
        break;
      case 'linformer':
        config.patternParams.projectionDim = config.patternParams.projectionDim || 256;
        break;
    }
  }

  private generatePatternData(config: SparseAttentionConfig, seqLen: number): boolean[][] {
    const pattern = Array(seqLen).fill(null).map(() => Array(seqLen).fill(false));

    switch (config.type) {
      case 'longformer':
        this.generateLongformerPattern(pattern, config, seqLen);
        break;
      case 'bigbird':
        this.generateBigBirdPattern(pattern, config, seqLen);
        break;
      case 'strided':
        this.generateStridedPattern(pattern, config, seqLen);
        break;
      case 'local_global':
        this.generateLocalGlobalPattern(pattern, config, seqLen);
        break;
      case 'fixed':
        this.generateFixedPattern(pattern, config, seqLen);
        break;
      case 'random':
        this.generateRandomPattern(pattern, config, seqLen);
        break;
      case 'linformer':
        this.generateLinformerPattern(pattern, config, seqLen);
        break;
    }

    return pattern;
  }

  private generateLongformerPattern(pattern: boolean[][], config: SparseAttentionConfig, seqLen: number): void {
    const windowSize = config.windowSize || 512;
    const globalIndices = config.patternParams.globalIndices || [0, 1, 2, 3];

    // Sliding window attention
    for (let i = 0; i < seqLen; i++) {
      const start = Math.max(0, i - Math.floor(windowSize / 2));
      const end = Math.min(seqLen, i + Math.floor(windowSize / 2) + 1);

      for (let j = start; j < end; j++) {
        pattern[i][j] = true;
      }
    }

    // Global attention for special tokens
    for (const globalIdx of globalIndices) {
      if (globalIdx < seqLen) {
        for (let j = 0; j < seqLen; j++) {
          pattern[globalIdx][j] = true;
          pattern[j][globalIdx] = true;
        }
      }
    }
  }

  private generateBigBirdPattern(pattern: boolean[][], config: SparseAttentionConfig, seqLen: number): void {
    const blockSize = config.blockSize || 64;
    const windowSize = config.windowSize || 64;
    const numRandomBlocks = config.patternParams.numRandomBlocks || 3;
    const globalTokenRatio = config.patternParams.globalTokenRatio || 0.01;

    const numBlocks = Math.ceil(seqLen / blockSize);
    const numGlobalTokens = Math.floor(seqLen * globalTokenRatio);

    // Local window attention
    for (let i = 0; i < seqLen; i++) {
      const start = Math.max(0, i - Math.floor(windowSize / 2));
      const end = Math.min(seqLen, i + Math.floor(windowSize / 2) + 1);

      for (let j = start; j < end; j++) {
        pattern[i][j] = true;
      }
    }

    // Random block attention
    for (let blockIdx = 0; blockIdx < numBlocks; blockIdx++) {
      const blockStart = blockIdx * blockSize;
      const blockEnd = Math.min(seqLen, (blockIdx + 1) * blockSize);

      for (let r = 0; r < numRandomBlocks; r++) {
        const randomBlock = Math.floor(Math.random() * numBlocks);
        const randStart = randomBlock * blockSize;
        const randEnd = Math.min(seqLen, (randomBlock + 1) * blockSize);

        for (let i = blockStart; i < blockEnd; i++) {
          for (let j = randStart; j < randEnd; j++) {
            pattern[i][j] = true;
          }
        }
      }
    }

    // Global tokens
    const globalIndices = Array.from({length: numGlobalTokens}, (_, i) => i);
    for (const globalIdx of globalIndices) {
      for (let j = 0; j < seqLen; j++) {
        pattern[globalIdx][j] = true;
        pattern[j][globalIdx] = true;
      }
    }
  }

  private generateStridedPattern(pattern: boolean[][], config: SparseAttentionConfig, seqLen: number): void {
    const strideSize = config.strideSize || 128;
    const offsetPattern = config.patternParams.offsetPattern || [0];

    for (let i = 0; i < seqLen; i++) {
      // Self-attention
      pattern[i][i] = true;

      // Strided attention
      for (const offset of offsetPattern) {
        for (let stride = 1; stride * strideSize + offset < seqLen; stride++) {
          const j = stride * strideSize + offset;
          if (Math.abs(i - j) <= strideSize) {
            pattern[i][j] = true;
          }
        }
      }
    }
  }

  private generateLocalGlobalPattern(pattern: boolean[][], config: SparseAttentionConfig, seqLen: number): void {
    const windowSize = config.windowSize || 256;
    const leftContext = config.patternParams.leftContext || Math.floor(windowSize / 2);
    const rightContext = config.patternParams.rightContext || Math.floor(windowSize / 2);
    const causalMask = config.patternParams.causalMask || false;

    for (let i = 0; i < seqLen; i++) {
      const start = causalMask ? Math.max(0, i - leftContext) : Math.max(0, i - leftContext);
      const end = causalMask ? i + 1 : Math.min(seqLen, i + rightContext + 1);

      for (let j = start; j < end; j++) {
        pattern[i][j] = true;
      }
    }
  }

  private generateFixedPattern(pattern: boolean[][], config: SparseAttentionConfig, seqLen: number): void {
    // Simple diagonal pattern with fixed offsets
    const offsets = [-2, -1, 0, 1, 2]; // attend to nearby positions

    for (let i = 0; i < seqLen; i++) {
      for (const offset of offsets) {
        const j = i + offset;
        if (j >= 0 && j < seqLen) {
          pattern[i][j] = true;
        }
      }
    }
  }

  private generateRandomPattern(pattern: boolean[][], config: SparseAttentionConfig, seqLen: number): void {
    const seed = config.randomSeed || 42;
    Math.seedrandom = Math.seedrandom || ((seed: number) => Math.random); // Pseudo-seeded random

    const targetNonZero = Math.floor(seqLen * seqLen * (1 - config.sparsityRatio));
    let nonZeroCount = 0;

    // Ensure diagonal (self-attention)
    for (let i = 0; i < seqLen; i++) {
      pattern[i][i] = true;
      nonZeroCount++;
    }

    // Add random connections
    while (nonZeroCount < targetNonZero) {
      const i = Math.floor(Math.random() * seqLen);
      const j = Math.floor(Math.random() * seqLen);

      if (!pattern[i][j]) {
        pattern[i][j] = true;
        nonZeroCount++;
      }
    }
  }

  private generateLinformerPattern(pattern: boolean[][], config: SparseAttentionConfig, seqLen: number): void {
    // Linformer uses low-rank projection, so we simulate a dense-like pattern
    // but with reduced effective computation
    const projectionDim = config.patternParams.projectionDim || 256;
    const effectiveAttention = Math.min(projectionDim, seqLen);

    for (let i = 0; i < seqLen; i++) {
      for (let j = 0; j < effectiveAttention; j++) {
        if (j < seqLen) {
          pattern[i][j] = true;
        }
      }
    }
  }

  private calculateActualSparsity(pattern: boolean[][]): number {
    const totalElements = pattern.length * pattern[0].length;
    const nonZeroElements = this.countNonZeroElements(pattern);
    return 1 - (nonZeroElements / totalElements);
  }

  private countNonZeroElements(pattern: boolean[][]): number {
    return pattern.reduce((total, row) =>
      total + row.reduce((rowTotal, val) => rowTotal + (val ? 1 : 0), 0), 0
    );
  }

  private calculateMemoryReduction(pattern: boolean[][]): number {
    const totalElements = pattern.length * pattern[0].length;
    const nonZeroElements = this.countNonZeroElements(pattern);
    return 1 - (nonZeroElements / totalElements);
  }

  private calculateComputeReduction(pattern: boolean[][]): number {
    // Compute reduction is typically higher than memory reduction due to avoided operations
    const memoryReduction = this.calculateMemoryReduction(pattern);
    return Math.min(0.99, memoryReduction * 1.2);
  }

  private getInputShape(inputTensor: any): [number, number, number] {
    // Simulate extracting shape from tensor
    if (Array.isArray(inputTensor) && inputTensor.length > 0) {
      return [1, inputTensor.length, 768]; // default hidden dim
    }
    return [1, 512, 768]; // default shape
  }

  private simulateSparseAttentionCompute(config: SparseAttentionConfig, inputShape: [number, number, number], patternId: string): any {
    const [batchSize, seqLen, hiddenDim] = inputShape;
    const pattern = this.patterns.get(patternId)!;

    const nonZeroElements = pattern.metadata.nonZeroElements;
    const totalElements = seqLen * seqLen;

    // Calculate metrics
    const baseFlops = batchSize * config.numHeads * seqLen * seqLen * hiddenDim * 4; // QKV + output
    const actualFlops = Math.floor(baseFlops * (nonZeroElements / totalElements));

    const baseMemory = batchSize * config.numHeads * seqLen * seqLen * 4; // attention weights
    const actualMemory = Math.floor(baseMemory * (nonZeroElements / totalElements));

    return {
      flops: actualFlops,
      memoryUsage: actualMemory,
      sparsityAchieved: pattern.sparsityRatio,
      attentionEntropy: Math.random() * 2 + 4, // entropy typically 4-6
      informationRetention: Math.max(0.85, 1 - (pattern.sparsityRatio * 0.2)) // quality vs sparsity tradeoff
    };
  }

  private simulateDenseAttentionCompute(config: SparseAttentionConfig, inputShape: [number, number, number]): any {
    const [batchSize, seqLen, hiddenDim] = inputShape;

    const flops = batchSize * config.numHeads * seqLen * seqLen * hiddenDim * 4;
    const memoryUsage = batchSize * config.numHeads * seqLen * seqLen * 4;
    const executionTime = Math.log(seqLen) * 100; // simplified timing model

    return {
      flops,
      memoryUsage,
      executionTime
    };
  }

  private estimateMemoryReduction(config: SparseAttentionConfig): number {
    // Estimate based on sparsity ratio and pattern type
    let baseReduction = config.sparsityRatio;

    // Adjust for pattern overhead
    switch (config.type) {
      case 'longformer':
      case 'bigbird':
        baseReduction *= 0.9; // some overhead for pattern management
        break;
      case 'linformer':
        baseReduction = Math.max(baseReduction, 0.7); // projection overhead
        break;
    }

    return baseReduction;
  }

  private estimateSpeedup(config: SparseAttentionConfig): number {
    const memoryReduction = this.estimateMemoryReduction(config);

    // Speedup is typically less than memory reduction due to overhead
    let speedup = 1 + (memoryReduction * 2);

    // Pattern-specific adjustments
    switch (config.type) {
      case 'strided':
        speedup *= 1.2; // very efficient
        break;
      case 'bigbird':
        speedup *= 0.8; // some overhead
        break;
      case 'linformer':
        speedup = Math.min(speedup, 3.0); // limited by projection
        break;
    }

    return speedup;
  }

  private getRecommendedUseCases(type: string): string[] {
    const useCases: Record<string, string[]> = {
      'longformer': ['document_understanding', 'long_form_qa', 'summarization'],
      'bigbird': ['genomics', 'long_documents', 'scientific_papers'],
      'strided': ['time_series', 'audio_processing', 'very_long_sequences'],
      'local_global': ['code_analysis', 'structured_documents', 'conversations'],
      'linformer': ['general_nlp', 'resource_constrained', 'mobile_deployment'],
      'random': ['research', 'baseline_comparison', 'exploration'],
      'fixed': ['simple_tasks', 'prototyping', 'educational']
    };

    return useCases[type] || ['general_purpose'];
  }

  private generateVisualizationData(pattern: AttentionPattern): any {
    const seqLen = pattern.shape[0];
    const sampleSize = Math.min(100, seqLen); // subsample for visualization

    return {
      type: 'attention_heatmap',
      dimensions: pattern.shape,
      sparsityRatio: pattern.sparsityRatio,
      sampleData: this.samplePattern(pattern.patternData, sampleSize),
      statistics: {
        nonZeroElements: pattern.metadata.nonZeroElements,
        memoryReduction: pattern.metadata.memoryReduction,
        computeReduction: pattern.metadata.computeReduction
      }
    };
  }

  private samplePattern(pattern: boolean[][], sampleSize: number): boolean[][] {
    const seqLen = pattern.length;
    if (seqLen <= sampleSize) return pattern;

    const step = Math.floor(seqLen / sampleSize);
    const sampled: boolean[][] = [];

    for (let i = 0; i < sampleSize; i++) {
      const row: boolean[] = [];
      for (let j = 0; j < sampleSize; j++) {
        row.push(pattern[i * step][j * step]);
      }
      sampled.push(row);
    }

    return sampled;
  }

  private analyzeConnectivity(pattern: AttentionPattern): any {
    const patternData = pattern.patternData;
    const seqLen = patternData.length;

    // Calculate connectivity metrics
    const inDegrees = new Array(seqLen).fill(0);
    const outDegrees = new Array(seqLen).fill(0);

    for (let i = 0; i < seqLen; i++) {
      for (let j = 0; j < seqLen; j++) {
        if (patternData[i][j]) {
          outDegrees[i]++;
          inDegrees[j]++;
        }
      }
    }

    const avgInDegree = inDegrees.reduce((sum, deg) => sum + deg, 0) / seqLen;
    const avgOutDegree = outDegrees.reduce((sum, deg) => sum + deg, 0) / seqLen;
    const degreeVariance = this.calculateMetrics(inDegrees).std;

    return {
      connectivityScore: Math.min(1.0, avgInDegree / seqLen),
      avgInDegree,
      avgOutDegree,
      degreeVariance,
      bottleneckAnalysis: degreeVariance > avgInDegree * 0.5 ?
        ['High degree variance indicates potential bottlenecks'] : [],
      recommendedOptimizations: avgInDegree < 10 ?
        ['Consider increasing connectivity for better information flow'] : []
    };
  }

  private analyzeLocality(pattern: AttentionPattern): any {
    const patternData = pattern.patternData;
    const seqLen = patternData.length;

    // Calculate locality index - how much attention focuses on nearby positions
    let localConnections = 0;
    let totalConnections = 0;
    const localityWindow = Math.min(50, Math.floor(seqLen * 0.1));

    for (let i = 0; i < seqLen; i++) {
      for (let j = 0; j < seqLen; j++) {
        if (patternData[i][j]) {
          totalConnections++;
          if (Math.abs(i - j) <= localityWindow) {
            localConnections++;
          }
        }
      }
    }

    const localityIndex = totalConnections > 0 ? localConnections / totalConnections : 0;

    return {
      localityIndex,
      localConnections,
      totalConnections,
      bottleneckAnalysis: localityIndex < 0.3 ?
        ['Low locality may impact sequential processing'] : [],
      recommendedOptimizations: localityIndex > 0.9 ?
        ['Consider adding global connections for long-range dependencies'] : []
    };
  }

  private analyzeEfficiency(pattern: AttentionPattern): any {
    const sparsityRatio = pattern.sparsityRatio;
    const memoryReduction = pattern.metadata.memoryReduction;
    const computeReduction = pattern.metadata.computeReduction;

    // Efficiency combines sparsity with maintained connectivity
    const efficiencyRating = (sparsityRatio + memoryReduction + computeReduction) / 3;

    return {
      efficiencyRating,
      sparsityRatio,
      memoryReduction,
      computeReduction,
      bottleneckAnalysis: efficiencyRating < 0.5 ?
        ['Low efficiency - consider more aggressive sparsity'] : [],
      recommendedOptimizations: sparsityRatio > 0.95 ?
        ['Very high sparsity may impact model quality'] : []
    };
  }

  private analyzeInformationFlow(pattern: AttentionPattern): any {
    const patternData = pattern.patternData;
    const seqLen = patternData.length;

    // Simulate information flow analysis
    const pathLengths: number[] = [];
    const reachability = this.calculateReachability(patternData);

    // Calculate average path length for connected components
    for (let i = 0; i < seqLen; i++) {
      for (let j = i + 1; j < seqLen; j++) {
        const pathLength = this.findShortestPath(patternData, i, j);
        if (pathLength > 0) {
          pathLengths.push(pathLength);
        }
      }
    }

    const avgPathLength = pathLengths.length > 0 ?
      pathLengths.reduce((sum, len) => sum + len, 0) / pathLengths.length : 0;

    return {
      informationFlowMetrics: {
        averagePathLength: avgPathLength,
        reachabilityRatio: reachability,
        maxPathLength: pathLengths.length > 0 ? Math.max(...pathLengths) : 0
      },
      bottleneckAnalysis: avgPathLength > 5 ?
        ['Long information paths may limit model effectiveness'] : [],
      recommendedOptimizations: reachability < 0.8 ?
        ['Add skip connections for better information flow'] : []
    };
  }

  private calculateReachability(pattern: boolean[][]): number {
    const seqLen = pattern.length;
    let reachablePairs = 0;

    // Use Floyd-Warshall-like approach to find reachability
    const reach = pattern.map(row => [...row]);

    for (let k = 0; k < seqLen; k++) {
      for (let i = 0; i < seqLen; i++) {
        for (let j = 0; j < seqLen; j++) {
          reach[i][j] = reach[i][j] || (reach[i][k] && reach[k][j]);
        }
      }
    }

    for (let i = 0; i < seqLen; i++) {
      for (let j = 0; j < seqLen; j++) {
        if (reach[i][j]) reachablePairs++;
      }
    }

    return reachablePairs / (seqLen * seqLen);
  }

  private findShortestPath(pattern: boolean[][], start: number, end: number): number {
    const seqLen = pattern.length;
    const distances = new Array(seqLen).fill(Infinity);
    const queue = [start];
    distances[start] = 0;

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current === end) {
        return distances[end];
      }

      for (let next = 0; next < seqLen; next++) {
        if (pattern[current][next] && distances[next] === Infinity) {
          distances[next] = distances[current] + 1;
          queue.push(next);
        }
      }
    }

    return -1; // not reachable
  }

  private generateAnalysisVisualization(pattern: AttentionPattern, analysis: PatternAnalysis): any {
    return {
      patternVisualization: this.generateVisualizationData(pattern),
      connectivityGraph: {
        nodes: pattern.shape[0],
        edges: pattern.metadata.nonZeroElements,
        avgDegree: analysis.results.connectivityScore * pattern.shape[0]
      },
      localityHeatmap: {
        localityIndex: analysis.results.localityIndex,
        windowSize: Math.min(50, Math.floor(pattern.shape[0] * 0.1))
      },
      efficiencyMetrics: {
        sparsityRatio: pattern.sparsityRatio,
        memoryReduction: pattern.metadata.memoryReduction,
        computeReduction: pattern.metadata.computeReduction
      }
    };
  }

  private generateAnalysisSummary(analysis: PatternAnalysis): string {
    const results = analysis.results;
    const efficiency = (results.efficiencyRating * 100).toFixed(1);
    const connectivity = (results.connectivityScore * 100).toFixed(1);
    const locality = (results.localityIndex * 100).toFixed(1);

    return `Pattern analysis shows ${efficiency}% efficiency, ${connectivity}% connectivity, and ${locality}% locality. ` +
           `${results.bottleneckAnalysis.length} potential bottlenecks identified. ` +
           `${results.recommendedOptimizations.length} optimization recommendations available.`;
  }

  private generateExecutionRecommendations(execution: SparseAttentionExecution, config: SparseAttentionConfig): string[] {
    const recommendations: string[] = [];

    if (execution.executionTime > 1000) {
      recommendations.push('Consider more aggressive sparsity for better performance');
    }

    if (execution.informationRetention < 0.9) {
      recommendations.push('Quality loss detected - consider less aggressive sparsity');
    }

    if (execution.memoryUsage > 1000000000) { // 1GB
      recommendations.push('High memory usage - enable memory-efficient attention variants');
    }

    if (execution.sparsityAchieved < config.sparsityRatio * 0.9) {
      recommendations.push('Target sparsity not achieved - review pattern generation');
    }

    return recommendations;
  }

  // This method is already implemented above

  private async optimizeSparsityPattern(params: any): Promise<any> {
    const { baseConfigId, targetMetrics, constraints = {}, optimizationSteps = 10 } = params;

    this.validateRequired(params, ['baseConfigId', 'targetMetrics']);

    if (!this.configs.has(baseConfigId)) {
      throw new Error(`Base configuration ${baseConfigId} not found`);
    }

    const baseConfig = this.configs.get(baseConfigId)!;
    const optimizedConfigId = this.generateId();

    // Simulate optimization process
    const optimizationResults = await this.simulatePatternOptimization(
      baseConfig, targetMetrics, constraints, optimizationSteps
    );

    const optimizedConfig = {
      ...baseConfig,
      id: optimizedConfigId,
      name: `${baseConfig.name} (Optimized)`,
      sparsityRatio: optimizationResults.optimizedSparsity,
      patternParams: {
        ...baseConfig.patternParams,
        ...optimizationResults.optimizedParams
      },
      updatedAt: new Date()
    };

    this.configs.set(optimizedConfigId, optimizedConfig);

    return {
      optimizedConfigId,
      baseConfigId,
      optimizationResults,
      improvements: optimizationResults.improvements,
      finalMetrics: optimizationResults.finalMetrics
    };
  }

  private async compareSparsityPatterns(params: any): Promise<any> {
    const { configIds, comparisonMetrics, testSequenceLengths } = params;

    this.validateRequired(params, ['configIds', 'comparisonMetrics']);

    const comparison: any = {
      configs: configIds,
      metrics: {},
      summary: {},
      recommendations: []
    };

    const seqLengths = testSequenceLengths || [512, 1024, 2048, 4096];

    for (const metric of comparisonMetrics) {
      comparison.metrics[metric] = {};

      for (const configId of configIds) {
        if (this.configs.has(configId)) {
          const config = this.configs.get(configId)!;
          comparison.metrics[metric][configId] = await this.measureMetric(config, metric, seqLengths);
        }
      }
    }

    comparison.summary = this.generateComparisonSummary(comparison.metrics, configIds);
    comparison.recommendations = this.generateComparisonRecommendations(comparison);

    return comparison;
  }

  private async adaptiveSparsityTuning(params: any): Promise<any> {
    const { baseConfigId, inputCharacteristics, performanceGoals = {}, adaptationStrategy = 'balanced' } = params;

    this.validateRequired(params, ['baseConfigId', 'inputCharacteristics']);

    if (!this.configs.has(baseConfigId)) {
      throw new Error(`Base configuration ${baseConfigId} not found`);
    }

    const baseConfig = this.configs.get(baseConfigId)!;
    const adaptedConfigId = this.generateId();

    // Analyze input characteristics
    const adaptationParams = this.calculateAdaptationParameters(
      inputCharacteristics, performanceGoals, adaptationStrategy
    );

    // Create adapted configuration
    const adaptedConfig = {
      ...baseConfig,
      id: adaptedConfigId,
      name: `${baseConfig.name} (Adaptive)`,
      sparsityRatio: adaptationParams.adjustedSparsity,
      patternParams: {
        ...baseConfig.patternParams,
        ...adaptationParams.patternAdjustments
      },
      updatedAt: new Date()
    };

    this.configs.set(adaptedConfigId, adaptedConfig);

    return {
      adaptedConfigId,
      baseConfigId,
      adaptationStrategy,
      inputCharacteristics,
      adaptationParams,
      expectedImprovements: adaptationParams.expectedImprovements
    };
  }

  private async simulatePatternOptimization(
    baseConfig: SparseAttentionConfig,
    targetMetrics: any,
    constraints: any,
    steps: number
  ): Promise<any> {
    // Simulate iterative optimization
    let currentSparsity = baseConfig.sparsityRatio;
    let bestSparsity = currentSparsity;
    let bestScore = 0;

    const optimizationHistory: any[] = [];

    for (let step = 0; step < steps; step++) {
      // Simulate optimization step
      const candidate = currentSparsity + (Math.random() - 0.5) * 0.1;
      const clampedCandidate = Math.max(0.1, Math.min(0.99, candidate));

      const score = this.evaluateConfiguration(clampedCandidate, targetMetrics, constraints);

      if (score > bestScore) {
        bestScore = score;
        bestSparsity = clampedCandidate;
      }

      optimizationHistory.push({
        step,
        sparsity: clampedCandidate,
        score,
        isBest: score === bestScore
      });

      currentSparsity = clampedCandidate;
    }

    return {
      optimizedSparsity: bestSparsity,
      optimizedParams: {
        optimizedForMetrics: Object.keys(targetMetrics)
      },
      improvements: {
        sparsityImprovement: (bestSparsity - baseConfig.sparsityRatio) / baseConfig.sparsityRatio,
        scoreDelta: bestScore
      },
      finalMetrics: {
        sparsity: bestSparsity,
        score: bestScore
      },
      optimizationHistory
    };
  }

  private evaluateConfiguration(sparsity: number, targetMetrics: any, constraints: any): number {
    let score = 0;

    // Score based on target metrics
    if (targetMetrics.speed) {
      score += sparsity * targetMetrics.speed * 0.4;
    }

    if (targetMetrics.memory) {
      score += sparsity * targetMetrics.memory * 0.3;
    }

    if (targetMetrics.quality) {
      score += (1 - sparsity) * targetMetrics.quality * 0.3;
    }

    // Apply constraint penalties
    if (constraints.maxSparsity && sparsity > constraints.maxSparsity) {
      score *= 0.5;
    }

    if (constraints.minQuality && (1 - sparsity) < constraints.minQuality) {
      score *= 0.5;
    }

    return score;
  }

  private async measureMetric(config: SparseAttentionConfig, metric: string, seqLengths: number[]): Promise<any> {
    const results: any = {};

    for (const seqLen of seqLengths) {
      switch (metric) {
        case 'speed':
          results[seqLen] = this.estimateExecutionTime(config, seqLen);
          break;
        case 'memory':
          results[seqLen] = this.estimateMemoryUsage(config, seqLen);
          break;
        case 'quality':
          results[seqLen] = this.estimateQualityMetric(config, seqLen);
          break;
        case 'sparsity':
          results[seqLen] = config.sparsityRatio;
          break;
      }
    }

    return results;
  }

  private estimateExecutionTime(config: SparseAttentionConfig, seqLen: number): number {
    const baseTime = seqLen * seqLen * 0.001; // ms
    const sparsityReduction = config.sparsityRatio;
    return baseTime * (1 - sparsityReduction);
  }

  private estimateMemoryUsage(config: SparseAttentionConfig, seqLen: number): number {
    const baseMemory = seqLen * seqLen * 4; // bytes for attention matrix
    const sparsityReduction = config.sparsityRatio;
    return baseMemory * (1 - sparsityReduction);
  }

  private estimateQualityMetric(config: SparseAttentionConfig, seqLen: number): number {
    // Quality typically decreases with sparsity
    const baseQuality = 0.95;
    const sparsityPenalty = config.sparsityRatio * 0.15;
    return Math.max(0.7, baseQuality - sparsityPenalty);
  }

  private generateComparisonSummary(metrics: any, configIds: string[]): any {
    const summary: any = {};

    for (const [metric, values] of Object.entries(metrics)) {
      const metricValues = Object.values(values as Record<string, any>);
      if (metricValues.length > 0 && typeof metricValues[0] === 'object') {
        // Handle nested metrics (per sequence length)
        const allValues = metricValues.flatMap(v => Object.values(v as Record<string, number>));
        summary[metric] = this.calculateMetrics(allValues);
      }
    }

    return summary;
  }

  private generateComparisonRecommendations(comparison: any): string[] {
    const recommendations: string[] = [];

    recommendations.push('Choose Longformer for document processing tasks');
    recommendations.push('Use BigBird for genomics and scientific applications');
    recommendations.push('Select strided patterns for extremely long sequences');
    recommendations.push('Consider Linformer for resource-constrained environments');

    return recommendations;
  }

  private calculateAdaptationParameters(
    inputCharacteristics: any,
    performanceGoals: any,
    strategy: string
  ): any {
    const avgSeqLength = inputCharacteristics.averageSequenceLength || 512;
    const maxSeqLength = inputCharacteristics.maxSequenceLength || 2048;
    const localityRatio = inputCharacteristics.localityRatio || 0.7;

    let adjustedSparsity = 0.9; // default
    const patternAdjustments: any = {};

    switch (strategy) {
      case 'conservative':
        adjustedSparsity = Math.min(0.8, 0.5 + (maxSeqLength / 4096) * 0.3);
        break;
      case 'aggressive':
        adjustedSparsity = Math.min(0.95, 0.7 + (maxSeqLength / 2048) * 0.25);
        break;
      case 'balanced':
        adjustedSparsity = Math.min(0.9, 0.6 + (maxSeqLength / 3000) * 0.3);
        break;
    }

    // Adjust based on locality
    if (localityRatio > 0.8) {
      patternAdjustments.windowSize = Math.min(256, Math.floor(avgSeqLength * 0.3));
    }

    return {
      adjustedSparsity,
      patternAdjustments,
      expectedImprovements: {
        memoryReduction: adjustedSparsity * 0.8,
        speedup: 1 + adjustedSparsity * 1.5,
        qualityRetention: 1 - adjustedSparsity * 0.1
      }
    };
  }
}

// Start the server if this file is executed directly
if (process.argv[1] === import.meta.url.substring(7)) {
  SparseAttentionEngine.main().catch(error => {
    console.error('Error starting server:', error);
    process.exit(1);
  });
}