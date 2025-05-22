import { EventEmitter } from 'events';
import { createLogger } from '../../../shared/src/logging.js';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('EnsembleMethods');

export interface EnsembleModel {
  id: string;
  name: string;
  method: 'voting' | 'stacking' | 'bagging' | 'boosting';
  baseModels: BaseModel[];
  weights?: number[];
  metaModel?: any; // For stacking
  configuration: EnsembleConfig;
  status: 'training' | 'trained' | 'deployed' | 'failed';
  createdAt: Date;
  lastUpdated: Date;
  metrics: EnsembleMetrics;
}

export interface BaseModel {
  id: string;
  name: string;
  type: 'classification' | 'regression';
  endpoint?: string;
  weight: number;
  performance: ModelPerformance;
  predict: (input: any) => Promise<any>;
}

export interface EnsembleConfig {
  votingStrategy?: 'hard' | 'soft';
  stackingLayers?: number;
  baggingSize?: number;
  boostingRounds?: number;
  crossValidationFolds?: number;
  performanceThreshold?: number;
}

export interface ModelPerformance {
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1Score?: number;
  mse?: number;
  mae?: number;
  r2Score?: number;
}

export interface EnsembleMetrics {
  totalPredictions: number;
  averageLatency: number;
  consensusRate: number; // How often models agree
  individualAccuracies: number[];
  ensembleAccuracy: number;
  diversityScore: number;
}

export interface EnsembleServiceConfig {
  cacheSize: number;
  parallelProcessing: boolean;
  maxConcurrentEnsembles: number;
  performanceTrackingEnabled: boolean;
}

export class EnsembleMethodsService extends EventEmitter {
  private ensembles: Map<string, EnsembleModel> = new Map();
  private predictionCache: Map<string, any> = new Map();
  private performanceHistory: Map<string, any[]> = new Map();

  constructor(private config: EnsembleServiceConfig) {
    super();
    logger.info('Ensemble Methods Service initialized', {
      cacheSize: config.cacheSize,
      parallelProcessing: config.parallelProcessing
    });
  }

  async initialize(): Promise<void> {
    try {
      // Initialize prediction cache with LRU eviction
      this.setupCacheEviction();
      
      // Load existing ensembles from storage
      await this.loadExistingEnsembles();
      
      logger.info('Ensemble Methods Service ready');
    } catch (error) {
      logger.error('Failed to initialize Ensemble Methods Service', { error });
      throw error;
    }
  }

  async createEnsemble(args: {
    name: string;
    method: 'voting' | 'stacking' | 'bagging' | 'boosting';
    models: any[];
    weights?: number[];
    configuration?: EnsembleConfig;
  }): Promise<{ ensembleId: string; status: string }> {
    try {
      const ensembleId = uuidv4();
      
      // Validate input
      this.validateEnsembleConfig(args);
      
      // Create base models
      const baseModels = await this.createBaseModels(args.models);
      
      // Normalize weights
      const weights = this.normalizeWeights(args.weights, baseModels.length);
      
      const ensemble: EnsembleModel = {
        id: ensembleId,
        name: args.name,
        method: args.method,
        baseModels,
        weights,
        configuration: args.configuration || this.getDefaultConfig(args.method),
        status: 'training',
        createdAt: new Date(),
        lastUpdated: new Date(),
        metrics: {
          totalPredictions: 0,
          averageLatency: 0,
          consensusRate: 0,
          individualAccuracies: [],
          ensembleAccuracy: 0,
          diversityScore: 0
        }
      };

      // Train ensemble based on method
      await this.trainEnsemble(ensemble);
      
      this.ensembles.set(ensembleId, ensemble);
      
      this.emit('ensembleCreated', {
        ensembleId,
        name: args.name,
        method: args.method,
        modelCount: baseModels.length
      });

      logger.info('Ensemble created successfully', {
        ensembleId,
        name: args.name,
        method: args.method,
        modelCount: baseModels.length
      });

      return {
        ensembleId,
        status: ensemble.status
      };
    } catch (error) {
      logger.error('Failed to create ensemble', { error, name: args.name });
      throw error;
    }
  }

  async predict(ensembleId: string, input: any): Promise<any> {
    const startTime = Date.now();
    const cacheKey = `${ensembleId}_${JSON.stringify(input)}`;

    try {
      // Check cache first
      if (this.predictionCache.has(cacheKey)) {
        const cached = this.predictionCache.get(cacheKey);
        logger.debug('Returning cached prediction', { ensembleId, cacheHit: true });
        return cached;
      }

      const ensemble = this.ensembles.get(ensembleId);
      if (!ensemble) {
        throw new Error(`Ensemble ${ensembleId} not found`);
      }

      if (ensemble.status !== 'trained' && ensemble.status !== 'deployed') {
        throw new Error(`Ensemble ${ensembleId} is not ready for predictions (status: ${ensemble.status})`);
      }

      let prediction;
      switch (ensemble.method) {
        case 'voting':
          prediction = await this.votingPredict(ensemble, input);
          break;
        case 'stacking':
          prediction = await this.stackingPredict(ensemble, input);
          break;
        case 'bagging':
          prediction = await this.baggingPredict(ensemble, input);
          break;
        case 'boosting':
          prediction = await this.boostingPredict(ensemble, input);
          break;
        default:
          throw new Error(`Unsupported ensemble method: ${ensemble.method}`);
      }

      // Update metrics
      const latency = Date.now() - startTime;
      this.updateEnsembleMetrics(ensemble, latency, prediction);

      // Cache result
      if (this.predictionCache.size < this.config.cacheSize) {
        this.predictionCache.set(cacheKey, prediction);
      }

      this.emit('predictionMade', {
        ensembleId,
        method: ensemble.method,
        latency,
        prediction
      });

      logger.debug('Ensemble prediction completed', {
        ensembleId,
        method: ensemble.method,
        latency,
        inputKeys: Object.keys(input)
      });

      return prediction;
    } catch (error) {
      logger.error('Ensemble prediction failed', {
        ensembleId,
        error,
        latency: Date.now() - startTime
      });
      throw error;
    }
  }

  private async votingPredict(ensemble: EnsembleModel, input: any): Promise<any> {
    const predictions = await this.getBasePredictions(ensemble, input);
    
    if (ensemble.configuration.votingStrategy === 'hard') {
      return this.hardVoting(predictions, ensemble.weights);
    } else {
      return this.softVoting(predictions, ensemble.weights);
    }
  }

  private async stackingPredict(ensemble: EnsembleModel, input: any): Promise<any> {
    // Level 1: Get base model predictions
    const basePredictions = await this.getBasePredictions(ensemble, input);
    
    // Level 2: Use meta-model for final prediction
    if (!ensemble.metaModel) {
      throw new Error('Stacking ensemble missing meta-model');
    }
    
    const metaInput = this.prepareMetaInput(basePredictions);
    return await ensemble.metaModel.predict(metaInput);
  }

  private async baggingPredict(ensemble: EnsembleModel, input: any): Promise<any> {
    const predictions = await this.getBasePredictions(ensemble, input);
    
    // Average predictions for regression, majority vote for classification
    const firstModel = ensemble.baseModels[0];
    if (firstModel.type === 'regression') {
      return this.averagePredictions(predictions);
    } else {
      return this.majorityVote(predictions);
    }
  }

  private async boostingPredict(ensemble: EnsembleModel, input: any): Promise<any> {
    // Sequential prediction with weighted combination
    let finalPrediction = 0;
    
    for (let i = 0; i < ensemble.baseModels.length; i++) {
      const model = ensemble.baseModels[i];
      const prediction = await model.predict(input);
      const weight = ensemble.weights ? ensemble.weights[i] : 1 / ensemble.baseModels.length;
      
      finalPrediction += prediction.value * weight;
    }
    
    return {
      value: finalPrediction,
      method: 'boosting',
      confidence: this.calculateBoostingConfidence(ensemble, input),
      contributingModels: ensemble.baseModels.length
    };
  }

  private async getBasePredictions(ensemble: EnsembleModel, input: any): Promise<any[]> {
    if (this.config.parallelProcessing) {
      // Parallel execution
      return await Promise.all(
        ensemble.baseModels.map(model => model.predict(input))
      );
    } else {
      // Sequential execution
      const predictions = [];
      for (const model of ensemble.baseModels) {
        predictions.push(await model.predict(input));
      }
      return predictions;
    }
  }

  private hardVoting(predictions: any[], weights?: number[]): any {
    const votes: Map<any, number> = new Map();
    
    predictions.forEach((pred, index) => {
      const value = pred.prediction || pred.value || pred;
      const weight = weights ? weights[index] : 1;
      votes.set(value, (votes.get(value) || 0) + weight);
    });

    // Find majority vote
    let maxVotes = 0;
    let winner = null;
    for (const [value, voteCount] of votes.entries()) {
      if (voteCount > maxVotes) {
        maxVotes = voteCount;
        winner = value;
      }
    }

    return {
      prediction: winner,
      method: 'hard_voting',
      votes: Array.from(votes.entries()),
      confidence: maxVotes / predictions.length,
      consensus: maxVotes === predictions.length
    };
  }

  private softVoting(predictions: any[], weights?: number[]): any {
    // Average the confidence scores
    let weightedSum = 0;
    let totalWeight = 0;
    const confidences: number[] = [];
    
    predictions.forEach((pred, index) => {
      const confidence = pred.confidence || pred.probability || 0.5;
      const weight = weights ? weights[index] : 1;
      
      weightedSum += confidence * weight;
      totalWeight += weight;
      confidences.push(confidence);
    });

    const averageConfidence = weightedSum / totalWeight;
    
    return {
      prediction: averageConfidence > 0.5 ? 1 : 0, // Binary classification example
      confidence: averageConfidence,
      method: 'soft_voting',
      individualConfidences: confidences,
      consensus: Math.max(...confidences) - Math.min(...confidences) < 0.1
    };
  }

  private averagePredictions(predictions: any[]): any {
    const values = predictions.map(p => p.value || p.prediction || p);
    const average = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) / values.length;
    
    return {
      prediction: average,
      method: 'averaging',
      variance,
      standardDeviation: Math.sqrt(variance),
      individualPredictions: values,
      confidence: 1 / (1 + variance) // Lower variance = higher confidence
    };
  }

  private majorityVote(predictions: any[]): any {
    const votes: Map<any, number> = new Map();
    
    predictions.forEach(pred => {
      const value = pred.prediction || pred.value || pred;
      votes.set(value, (votes.get(value) || 0) + 1);
    });

    let maxVotes = 0;
    let winner = null;
    for (const [value, voteCount] of votes.entries()) {
      if (voteCount > maxVotes) {
        maxVotes = voteCount;
        winner = value;
      }
    }

    return {
      prediction: winner,
      method: 'majority_vote',
      votes: Array.from(votes.entries()),
      confidence: maxVotes / predictions.length,
      unanimity: maxVotes === predictions.length
    };
  }

  private async trainEnsemble(ensemble: EnsembleModel): Promise<void> {
    logger.info('Training ensemble', {
      ensembleId: ensemble.id,
      method: ensemble.method,
      modelCount: ensemble.baseModels.length
    });

    try {
      switch (ensemble.method) {
        case 'stacking':
          await this.trainStackingMetaModel(ensemble);
          break;
        case 'boosting':
          await this.trainBoostingWeights(ensemble);
          break;
        default:
          // Voting and bagging don't require additional training
          break;
      }

      // Calculate diversity score
      ensemble.metrics.diversityScore = await this.calculateDiversityScore(ensemble);
      
      ensemble.status = 'trained';
      ensemble.lastUpdated = new Date();
      
      logger.info('Ensemble training completed', {
        ensembleId: ensemble.id,
        diversityScore: ensemble.metrics.diversityScore
      });
    } catch (error) {
      ensemble.status = 'failed';
      ensemble.lastUpdated = new Date();
      throw error;
    }
  }

  private async trainStackingMetaModel(ensemble: EnsembleModel): Promise<void> {
    // Create mock meta-model for stacking
    ensemble.metaModel = {
      predict: async (input: any) => {
        // Simulate meta-model prediction
        const features = Object.values(input).map(v => Number(v) || 0);
        const weightedSum = features.reduce((sum, val, idx) => {
          const weight = ensemble.weights ? ensemble.weights[idx % ensemble.weights.length] : 1;
          return sum + val * weight;
        }, 0);
        
        return {
          prediction: weightedSum / features.length,
          confidence: 0.85 + Math.random() * 0.1,
          method: 'meta_model'
        };
      }
    };
  }

  private async trainBoostingWeights(ensemble: EnsembleModel): Promise<void> {
    // Calculate optimal weights for boosting based on model performance
    const totalPerformance = ensemble.baseModels.reduce((sum, model) => {
      return sum + (model.performance.accuracy || model.performance.r2Score || 0.5);
    }, 0);

    ensemble.weights = ensemble.baseModels.map(model => {
      const performance = model.performance.accuracy || model.performance.r2Score || 0.5;
      return performance / totalPerformance;
    });
  }

  private async createBaseModels(modelConfigs: any[]): Promise<BaseModel[]> {
    const baseModels: BaseModel[] = [];
    
    for (const config of modelConfigs) {
      const mockModel: BaseModel = {
        id: config.id || uuidv4(),
        name: config.name || `Model_${Date.now()}`,
        type: config.type || 'classification',
        weight: config.weight || 1.0,
        performance: config.performance || {
          accuracy: 0.8 + Math.random() * 0.15,
          precision: 0.75 + Math.random() * 0.2,
          recall: 0.75 + Math.random() * 0.2,
          f1Score: 0.77 + Math.random() * 0.18
        },
        predict: async (input: any) => {
          // Mock prediction with realistic delay
          await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 150));
          
          return {
            prediction: Math.random() > 0.5 ? 1 : 0,
            confidence: 0.6 + Math.random() * 0.4,
            modelId: config.id,
            processingTime: 50 + Math.random() * 150
          };
        }
      };
      
      baseModels.push(mockModel);
    }
    
    return baseModels;
  }

  private validateEnsembleConfig(args: any): void {
    if (!args.name || args.name.trim().length === 0) {
      throw new Error('Ensemble name is required');
    }

    if (!args.models || args.models.length < 2) {
      throw new Error('Ensemble requires at least 2 base models');
    }

    if (args.weights && args.weights.length !== args.models.length) {
      throw new Error('Number of weights must match number of models');
    }

    const validMethods = ['voting', 'stacking', 'bagging', 'boosting'];
    if (!validMethods.includes(args.method)) {
      throw new Error(`Invalid ensemble method. Must be one of: ${validMethods.join(', ')}`);
    }
  }

  private normalizeWeights(weights: number[] | undefined, modelCount: number): number[] {
    if (!weights) {
      return new Array(modelCount).fill(1 / modelCount);
    }

    const sum = weights.reduce((a, b) => a + b, 0);
    return weights.map(w => w / sum);
  }

  private getDefaultConfig(method: string): EnsembleConfig {
    const defaults: Record<string, EnsembleConfig> = {
      voting: {
        votingStrategy: 'soft',
        crossValidationFolds: 5
      },
      stacking: {
        stackingLayers: 2,
        crossValidationFolds: 5
      },
      bagging: {
        baggingSize: 100,
        crossValidationFolds: 3
      },
      boosting: {
        boostingRounds: 50,
        performanceThreshold: 0.1
      }
    };

    return defaults[method] || {};
  }

  private updateEnsembleMetrics(ensemble: EnsembleModel, latency: number, prediction: any): void {
    ensemble.metrics.totalPredictions++;
    
    // Update average latency
    const total = ensemble.metrics.totalPredictions;
    ensemble.metrics.averageLatency = 
      (ensemble.metrics.averageLatency * (total - 1) + latency) / total;
    
    // Update consensus rate if applicable
    if (prediction.consensus !== undefined) {
      const consensusCount = ensemble.metrics.consensusRate * (total - 1) + (prediction.consensus ? 1 : 0);
      ensemble.metrics.consensusRate = consensusCount / total;
    }
    
    ensemble.lastUpdated = new Date();
  }

  private async calculateDiversityScore(ensemble: EnsembleModel): Promise<number> {
    // Simplified diversity calculation
    const performances = ensemble.baseModels.map(m => 
      m.performance.accuracy || m.performance.r2Score || 0.5
    );
    
    const mean = performances.reduce((a, b) => a + b, 0) / performances.length;
    const variance = performances.reduce((sum, perf) => sum + Math.pow(perf - mean, 2), 0) / performances.length;
    
    // Higher variance = higher diversity
    return Math.min(variance * 10, 1.0); // Normalize to 0-1
  }

  private prepareMetaInput(basePredictions: any[]): any {
    // Convert base predictions to meta-model input format
    const metaFeatures: Record<string, number> = {};
    
    basePredictions.forEach((pred, idx) => {
      metaFeatures[`model_${idx}_prediction`] = pred.prediction || pred.value || 0;
      metaFeatures[`model_${idx}_confidence`] = pred.confidence || 0.5;
    });
    
    return metaFeatures;
  }

  private calculateBoostingConfidence(ensemble: EnsembleModel, input: any): number {
    // Calculate confidence based on model agreement and individual confidences
    return 0.8 + Math.random() * 0.15; // Simplified for demo
  }

  private setupCacheEviction(): void {
    // Simple LRU cache implementation
    setInterval(() => {
      if (this.predictionCache.size > this.config.cacheSize * 0.8) {
        const keysToDelete = Array.from(this.predictionCache.keys())
          .slice(0, Math.floor(this.predictionCache.size * 0.2));
        
        keysToDelete.forEach(key => this.predictionCache.delete(key));
        
        logger.debug('Cache eviction completed', {
          deletedKeys: keysToDelete.length,
          remainingKeys: this.predictionCache.size
        });
      }
    }, 60000); // Every minute
  }

  private async loadExistingEnsembles(): Promise<void> {
    // In production, load from persistent storage
    logger.debug('Loading existing ensembles from storage');
  }

  // Public API methods
  isHealthy(): boolean {
    return this.ensembles.size >= 0;
  }

  getActiveEnsembleCount(): number {
    return Array.from(this.ensembles.values()).filter(e => e.status === 'trained' || e.status === 'deployed').length;
  }

  getEnsembles(): EnsembleModel[] {
    return Array.from(this.ensembles.values());
  }

  getEnsemble(ensembleId: string): EnsembleModel | undefined {
    return this.ensembles.get(ensembleId);
  }

  async deleteEnsemble(ensembleId: string): Promise<void> {
    const ensemble = this.ensembles.get(ensembleId);
    if (!ensemble) {
      throw new Error(`Ensemble ${ensembleId} not found`);
    }

    this.ensembles.delete(ensembleId);
    
    // Clear related cache entries
    const cacheKeysToDelete = Array.from(this.predictionCache.keys())
      .filter(key => key.startsWith(`${ensembleId}_`));
    cacheKeysToDelete.forEach(key => this.predictionCache.delete(key));
    
    logger.info('Ensemble deleted', { ensembleId });
  }

  getMetrics(): any {
    const ensembles = Array.from(this.ensembles.values());
    
    return {
      totalEnsembles: ensembles.length,
      activeEnsembles: this.getActiveEnsembleCount(),
      totalPredictions: ensembles.reduce((sum, e) => sum + e.metrics.totalPredictions, 0),
      averageLatency: ensembles.length > 0 ? 
        ensembles.reduce((sum, e) => sum + e.metrics.averageLatency, 0) / ensembles.length : 0,
      averageConsensusRate: ensembles.length > 0 ?
        ensembles.reduce((sum, e) => sum + e.metrics.consensusRate, 0) / ensembles.length : 0,
      averageDiversityScore: ensembles.length > 0 ?
        ensembles.reduce((sum, e) => sum + e.metrics.diversityScore, 0) / ensembles.length : 0,
      cacheSize: this.predictionCache.size,
      methodDistribution: this.getMethodDistribution()
    };
  }

  private getMethodDistribution(): Record<string, number> {
    const distribution: Record<string, number> = {};
    
    for (const ensemble of this.ensembles.values()) {
      distribution[ensemble.method] = (distribution[ensemble.method] || 0) + 1;
    }
    
    return distribution;
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Ensemble Methods Service');
    
    this.predictionCache.clear();
    this.ensembles.clear();
    this.performanceHistory.clear();
    this.removeAllListeners();
    
    logger.info('Ensemble Methods Service shutdown complete');
  }
}