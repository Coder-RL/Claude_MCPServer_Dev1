import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../../../shared/src/logging.js';
import { HealthCheck } from '../../../shared/src/health.js';

export interface NeuralArchitecture {
  id: string;
  layers: LayerConfig[];
  connections: ConnectionConfig[];
  hyperparameters: {
    learningRate: number;
    batchSize: number;
    optimizer: string;
    activationFunction: string;
    dropout: number;
    regularization: {
      type: 'l1' | 'l2' | 'none';
      strength: number;
    };
  };
  metrics: {
    accuracy?: number;
    loss?: number;
    parameters: number;
    flops: number;
    trainingTime: number;
    memoryUsage: number;
  };
  generation: number;
  parentIds: string[];
}

export interface LayerConfig {
  id: string;
  type: 'dense' | 'conv2d' | 'lstm' | 'attention' | 'residual' | 'batch_norm' | 'dropout';
  parameters: Record<string, any>;
  inputShape?: number[];
  outputShape?: number[];
}

export interface ConnectionConfig {
  from: string;
  to: string;
  type: 'forward' | 'skip' | 'attention';
}

export interface SearchSpace {
  layers: {
    types: string[];
    maxLayers: number;
    minLayers: number;
  };
  hyperparameters: {
    learningRate: { min: number; max: number; scale: 'log' | 'linear' };
    batchSize: number[];
    optimizers: string[];
    activations: string[];
    dropout: { min: number; max: number };
  };
  constraints: {
    maxParameters: number;
    maxMemory: number;
    maxTrainingTime: number;
  };
}

export interface NASExperiment {
  id: string;
  name: string;
  searchSpace: SearchSpace;
  strategy: 'evolutionary' | 'reinforcement' | 'differentiable' | 'random';
  status: 'running' | 'completed' | 'failed' | 'paused';
  startTime: number;
  endTime?: number;
  generations: number;
  populationSize: number;
  currentGeneration: number;
  bestArchitecture?: NeuralArchitecture;
  allArchitectures: NeuralArchitecture[];
  paretoFront: NeuralArchitecture[];
  objectives: string[];
}

export class NeuralArchitectureSearch extends EventEmitter {
  private logger = createLogger('NeuralArchitectureSearch');
  private experiments = new Map<string, NASExperiment>();
  private activeExperiments = new Set<string>();
  private architectureEvaluator = new ArchitectureEvaluator();
  private searchStrategies = new Map<string, SearchStrategy>();

  constructor() {
    super();
    this.initializeSearchStrategies();
    this.logger.info('Neural Architecture Search initialized');
  }

  private initializeSearchStrategies(): void {
    this.searchStrategies.set('evolutionary', new EvolutionarySearch());
    this.searchStrategies.set('reinforcement', new ReinforcementLearningSearch());
    this.searchStrategies.set('differentiable', new DifferentiableSearch());
    this.searchStrategies.set('random', new RandomSearch());
  }

  async startSearch(
    name: string,
    searchSpace: SearchSpace,
    strategy: 'evolutionary' | 'reinforcement' | 'differentiable' | 'random' = 'evolutionary',
    options: {
      generations?: number;
      populationSize?: number;
      objectives?: string[];
    } = {}
  ): Promise<string> {
    const experimentId = uuidv4();
    
    const experiment: NASExperiment = {
      id: experimentId,
      name,
      searchSpace,
      strategy,
      status: 'running',
      startTime: Date.now(),
      generations: options.generations || 50,
      populationSize: options.populationSize || 20,
      currentGeneration: 0,
      allArchitectures: [],
      paretoFront: [],
      objectives: options.objectives || ['accuracy', 'efficiency']
    };

    this.experiments.set(experimentId, experiment);
    this.activeExperiments.add(experimentId);

    this.logger.info(`Started NAS experiment: ${experimentId}`, { name, strategy });
    this.emit('searchStarted', { experimentId, name });

    this.runSearch(experimentId);
    return experimentId;
  }

  private async runSearch(experimentId: string): Promise<void> {
    try {
      const experiment = this.experiments.get(experimentId)!;
      const searchStrategy = this.searchStrategies.get(experiment.strategy)!;
      
      let population = await this.generateInitialPopulation(experiment);
      experiment.allArchitectures.push(...population);

      for (let generation = 0; generation < experiment.generations; generation++) {
        if (!this.activeExperiments.has(experimentId)) break;

        experiment.currentGeneration = generation;
        this.logger.info(`NAS Generation ${generation + 1}/${experiment.generations}`, { experimentId });

        const evaluatedPopulation = await Promise.all(
          population.map(arch => this.evaluateArchitecture(arch))
        );

        experiment.allArchitectures.push(...evaluatedPopulation);
        this.updateParetoFront(experiment, evaluatedPopulation);

        if (generation < experiment.generations - 1) {
          population = await searchStrategy.generateNextGeneration(
            evaluatedPopulation,
            experiment.searchSpace,
            generation
          );
        }

        this.emit('generationCompleted', {
          experimentId,
          generation: generation + 1,
          bestArchitecture: experiment.paretoFront[0]
        });

        if (this.shouldEarlyStop(experiment)) {
          this.logger.info(`Early stopping triggered for experiment: ${experimentId}`);
          break;
        }
      }

      experiment.bestArchitecture = this.selectBestArchitecture(experiment);
      experiment.status = 'completed';
      experiment.endTime = Date.now();
      this.activeExperiments.delete(experimentId);

      this.logger.info(`Completed NAS experiment: ${experimentId}`, {
        bestAccuracy: experiment.bestArchitecture?.metrics.accuracy,
        totalArchitectures: experiment.allArchitectures.length
      });

      this.emit('searchCompleted', { experimentId, bestArchitecture: experiment.bestArchitecture });

    } catch (error) {
      const experiment = this.experiments.get(experimentId);
      if (experiment) {
        experiment.status = 'failed';
        experiment.endTime = Date.now();
      }
      this.activeExperiments.delete(experimentId);
      this.logger.error(`NAS experiment failed: ${experimentId}`, error);
      this.emit('searchFailed', { experimentId, error });
    }
  }

  private async generateInitialPopulation(experiment: NASExperiment): Promise<NeuralArchitecture[]> {
    const population: NeuralArchitecture[] = [];
    
    for (let i = 0; i < experiment.populationSize; i++) {
      const architecture = this.generateRandomArchitecture(experiment.searchSpace);
      architecture.generation = 0;
      population.push(architecture);
    }

    return population;
  }

  private generateRandomArchitecture(searchSpace: SearchSpace): NeuralArchitecture {
    const numLayers = Math.floor(
      Math.random() * (searchSpace.layers.maxLayers - searchSpace.layers.minLayers + 1)
    ) + searchSpace.layers.minLayers;

    const layers: LayerConfig[] = [];
    const connections: ConnectionConfig[] = [];

    for (let i = 0; i < numLayers; i++) {
      const layerType = searchSpace.layers.types[
        Math.floor(Math.random() * searchSpace.layers.types.length)
      ];

      const layer: LayerConfig = {
        id: `layer_${i}`,
        type: layerType as any,
        parameters: this.generateLayerParameters(layerType)
      };

      layers.push(layer);

      if (i > 0) {
        connections.push({
          from: `layer_${i - 1}`,
          to: `layer_${i}`,
          type: 'forward'
        });

        if (Math.random() < 0.1 && i > 1) {
          connections.push({
            from: `layer_${i - 2}`,
            to: `layer_${i}`,
            type: 'skip'
          });
        }
      }
    }

    const hyperparams = searchSpace.hyperparameters;
    
    return {
      id: uuidv4(),
      layers,
      connections,
      hyperparameters: {
        learningRate: this.sampleFromRange(hyperparams.learningRate),
        batchSize: hyperparams.batchSize[Math.floor(Math.random() * hyperparams.batchSize.length)],
        optimizer: hyperparams.optimizers[Math.floor(Math.random() * hyperparams.optimizers.length)],
        activationFunction: hyperparams.activations[Math.floor(Math.random() * hyperparams.activations.length)],
        dropout: Math.random() * (hyperparams.dropout.max - hyperparams.dropout.min) + hyperparams.dropout.min,
        regularization: {
          type: Math.random() < 0.5 ? 'l2' : 'l1',
          strength: Math.random() * 0.01
        }
      },
      metrics: {
        parameters: 0,
        flops: 0,
        trainingTime: 0,
        memoryUsage: 0
      },
      generation: 0,
      parentIds: []
    };
  }

  private generateLayerParameters(layerType: string): Record<string, any> {
    switch (layerType) {
      case 'dense':
        return { units: Math.floor(Math.random() * 512) + 32 };
      case 'conv2d':
        return {
          filters: Math.floor(Math.random() * 256) + 16,
          kernelSize: [3, 5][Math.floor(Math.random() * 2)],
          strides: [1, 2][Math.floor(Math.random() * 2)]
        };
      case 'lstm':
        return { units: Math.floor(Math.random() * 256) + 32 };
      case 'attention':
        return {
          heads: [4, 8, 12][Math.floor(Math.random() * 3)],
          keyDim: Math.floor(Math.random() * 128) + 32
        };
      case 'dropout':
        return { rate: Math.random() * 0.5 };
      default:
        return {};
    }
  }

  private sampleFromRange(range: { min: number; max: number; scale: 'log' | 'linear' }): number {
    if (range.scale === 'log') {
      const logMin = Math.log10(range.min);
      const logMax = Math.log10(range.max);
      return Math.pow(10, Math.random() * (logMax - logMin) + logMin);
    } else {
      return Math.random() * (range.max - range.min) + range.min;
    }
  }

  private async evaluateArchitecture(architecture: NeuralArchitecture): Promise<NeuralArchitecture> {
    const startTime = Date.now();
    
    const evaluation = await this.architectureEvaluator.evaluate(architecture);
    
    architecture.metrics = {
      ...evaluation,
      trainingTime: Date.now() - startTime
    };

    return architecture;
  }

  private updateParetoFront(experiment: NASExperiment, newArchitectures: NeuralArchitecture[]): void {
    const allArchitectures = [...experiment.paretoFront, ...newArchitectures];
    const paretoFront: NeuralArchitecture[] = [];

    for (const arch1 of allArchitectures) {
      let isDominated = false;
      
      for (const arch2 of allArchitectures) {
        if (arch1.id === arch2.id) continue;
        
        if (this.dominates(arch2, arch1, experiment.objectives)) {
          isDominated = true;
          break;
        }
      }
      
      if (!isDominated) {
        paretoFront.push(arch1);
      }
    }

    experiment.paretoFront = paretoFront.sort((a, b) => 
      (b.metrics.accuracy || 0) - (a.metrics.accuracy || 0)
    );
  }

  private dominates(arch1: NeuralArchitecture, arch2: NeuralArchitecture, objectives: string[]): boolean {
    let betterInAll = true;
    let betterInOne = false;

    for (const objective of objectives) {
      const value1 = this.getObjectiveValue(arch1, objective);
      const value2 = this.getObjectiveValue(arch2, objective);

      if (objective === 'accuracy') {
        if (value1 < value2) betterInAll = false;
        if (value1 > value2) betterInOne = true;
      } else {
        if (value1 > value2) betterInAll = false;
        if (value1 < value2) betterInOne = true;
      }
    }

    return betterInAll && betterInOne;
  }

  private getObjectiveValue(architecture: NeuralArchitecture, objective: string): number {
    switch (objective) {
      case 'accuracy':
        return architecture.metrics.accuracy || 0;
      case 'efficiency':
        return 1 / (architecture.metrics.parameters + architecture.metrics.flops / 1000000);
      case 'speed':
        return 1 / architecture.metrics.trainingTime;
      case 'memory':
        return 1 / architecture.metrics.memoryUsage;
      default:
        return 0;
    }
  }

  private shouldEarlyStop(experiment: NASExperiment): boolean {
    if (experiment.paretoFront.length === 0) return false;
    
    const recentGeneration = experiment.allArchitectures.filter(
      arch => arch.generation >= experiment.currentGeneration - 5
    );

    const bestRecentAccuracy = Math.max(
      ...recentGeneration.map(arch => arch.metrics.accuracy || 0)
    );

    const overallBestAccuracy = Math.max(
      ...experiment.allArchitectures.map(arch => arch.metrics.accuracy || 0)
    );

    return (overallBestAccuracy - bestRecentAccuracy) < 0.001;
  }

  private selectBestArchitecture(experiment: NASExperiment): NeuralArchitecture {
    if (experiment.paretoFront.length === 0) {
      return experiment.allArchitectures.sort((a, b) => 
        (b.metrics.accuracy || 0) - (a.metrics.accuracy || 0)
      )[0];
    }

    return experiment.paretoFront[0];
  }

  async getExperiment(experimentId: string): Promise<NASExperiment | null> {
    return this.experiments.get(experimentId) || null;
  }

  async listExperiments(): Promise<NASExperiment[]> {
    return Array.from(this.experiments.values()).sort((a, b) => b.startTime - a.startTime);
  }

  async pauseSearch(experimentId: string): Promise<boolean> {
    const experiment = this.experiments.get(experimentId);
    if (experiment && this.activeExperiments.has(experimentId)) {
      experiment.status = 'paused';
      this.activeExperiments.delete(experimentId);
      this.logger.info(`Paused NAS experiment: ${experimentId}`);
      this.emit('searchPaused', { experimentId });
      return true;
    }
    return false;
  }

  async resumeSearch(experimentId: string): Promise<boolean> {
    const experiment = this.experiments.get(experimentId);
    if (experiment && experiment.status === 'paused') {
      experiment.status = 'running';
      this.activeExperiments.add(experimentId);
      this.logger.info(`Resumed NAS experiment: ${experimentId}`);
      this.emit('searchResumed', { experimentId });
      this.runSearch(experimentId);
      return true;
    }
    return false;
  }

  getHealthCheck(): HealthCheck {
    return {
      status: 'healthy',
      timestamp: Date.now(),
      details: {
        activeSearches: this.activeExperiments.size,
        totalExperiments: this.experiments.size,
        completedExperiments: Array.from(this.experiments.values()).filter(e => e.status === 'completed').length
      }
    };
  }
}

class ArchitectureEvaluator {
  async evaluate(architecture: NeuralArchitecture): Promise<{
    accuracy?: number;
    loss?: number;
    parameters: number;
    flops: number;
    memoryUsage: number;
  }> {
    await new Promise(resolve => setTimeout(resolve, 100));

    const parameters = this.calculateParameters(architecture);
    const flops = this.calculateFLOPs(architecture);
    const memoryUsage = this.calculateMemoryUsage(architecture);

    const accuracy = Math.random() * 0.3 + 0.7 - (parameters / 10000000) * 0.1;
    const loss = 1 - accuracy + Math.random() * 0.1;

    return {
      accuracy: Math.max(0, Math.min(1, accuracy)),
      loss: Math.max(0, loss),
      parameters,
      flops,
      memoryUsage
    };
  }

  private calculateParameters(architecture: NeuralArchitecture): number {
    let totalParams = 0;
    
    for (const layer of architecture.layers) {
      switch (layer.type) {
        case 'dense':
          totalParams += (layer.parameters.units || 128) * 128;
          break;
        case 'conv2d':
          totalParams += (layer.parameters.filters || 32) * 9 * 3;
          break;
        case 'lstm':
          totalParams += (layer.parameters.units || 64) * 4 * 128;
          break;
        case 'attention':
          totalParams += (layer.parameters.keyDim || 64) * (layer.parameters.heads || 8) * 128;
          break;
      }
    }
    
    return totalParams;
  }

  private calculateFLOPs(architecture: NeuralArchitecture): number {
    return this.calculateParameters(architecture) * 2;
  }

  private calculateMemoryUsage(architecture: NeuralArchitecture): number {
    return this.calculateParameters(architecture) * 4;
  }
}

abstract class SearchStrategy {
  abstract generateNextGeneration(
    population: NeuralArchitecture[],
    searchSpace: SearchSpace,
    generation: number
  ): Promise<NeuralArchitecture[]>;
}

class EvolutionarySearch extends SearchStrategy {
  async generateNextGeneration(
    population: NeuralArchitecture[],
    searchSpace: SearchSpace,
    generation: number
  ): Promise<NeuralArchitecture[]> {
    const sortedPopulation = population.sort((a, b) => 
      (b.metrics.accuracy || 0) - (a.metrics.accuracy || 0)
    );

    const nextGeneration: NeuralArchitecture[] = [];
    const eliteCount = Math.floor(population.length * 0.2);
    
    nextGeneration.push(...sortedPopulation.slice(0, eliteCount));

    while (nextGeneration.length < population.length) {
      const parent1 = this.tournamentSelection(sortedPopulation);
      const parent2 = this.tournamentSelection(sortedPopulation);
      
      const child = await this.crossover(parent1, parent2);
      const mutatedChild = await this.mutate(child, searchSpace);
      
      mutatedChild.generation = generation + 1;
      mutatedChild.parentIds = [parent1.id, parent2.id];
      
      nextGeneration.push(mutatedChild);
    }

    return nextGeneration;
  }

  private tournamentSelection(population: NeuralArchitecture[], tournamentSize: number = 3): NeuralArchitecture {
    const tournament = [];
    for (let i = 0; i < tournamentSize; i++) {
      tournament.push(population[Math.floor(Math.random() * population.length)]);
    }
    return tournament.sort((a, b) => (b.metrics.accuracy || 0) - (a.metrics.accuracy || 0))[0];
  }

  private async crossover(parent1: NeuralArchitecture, parent2: NeuralArchitecture): Promise<NeuralArchitecture> {
    const crossoverPoint = Math.floor(Math.random() * Math.min(parent1.layers.length, parent2.layers.length));
    
    const childLayers = [
      ...parent1.layers.slice(0, crossoverPoint),
      ...parent2.layers.slice(crossoverPoint)
    ];

    return {
      id: uuidv4(),
      layers: childLayers,
      connections: this.rebuildConnections(childLayers),
      hyperparameters: this.crossoverHyperparameters(parent1.hyperparameters, parent2.hyperparameters),
      metrics: { parameters: 0, flops: 0, trainingTime: 0, memoryUsage: 0 },
      generation: 0,
      parentIds: []
    };
  }

  private rebuildConnections(layers: LayerConfig[]): ConnectionConfig[] {
    const connections: ConnectionConfig[] = [];
    for (let i = 1; i < layers.length; i++) {
      connections.push({
        from: layers[i - 1].id,
        to: layers[i].id,
        type: 'forward'
      });
    }
    return connections;
  }

  private crossoverHyperparameters(hp1: any, hp2: any): any {
    return {
      learningRate: Math.random() < 0.5 ? hp1.learningRate : hp2.learningRate,
      batchSize: Math.random() < 0.5 ? hp1.batchSize : hp2.batchSize,
      optimizer: Math.random() < 0.5 ? hp1.optimizer : hp2.optimizer,
      activationFunction: Math.random() < 0.5 ? hp1.activationFunction : hp2.activationFunction,
      dropout: (hp1.dropout + hp2.dropout) / 2,
      regularization: Math.random() < 0.5 ? hp1.regularization : hp2.regularization
    };
  }

  private async mutate(architecture: NeuralArchitecture, searchSpace: SearchSpace): Promise<NeuralArchitecture> {
    const mutationRate = 0.1;
    
    if (Math.random() < mutationRate) {
      if (Math.random() < 0.5 && architecture.layers.length < searchSpace.layers.maxLayers) {
        const newLayerType = searchSpace.layers.types[
          Math.floor(Math.random() * searchSpace.layers.types.length)
        ];
        const newLayer: LayerConfig = {
          id: `layer_${Date.now()}`,
          type: newLayerType as any,
          parameters: this.generateLayerParameters(newLayerType)
        };
        architecture.layers.push(newLayer);
      } else if (architecture.layers.length > searchSpace.layers.minLayers) {
        architecture.layers.splice(Math.floor(Math.random() * architecture.layers.length), 1);
      }
      
      architecture.connections = this.rebuildConnections(architecture.layers);
    }

    if (Math.random() < mutationRate) {
      architecture.hyperparameters.learningRate *= (Math.random() * 0.4 + 0.8);
      architecture.hyperparameters.dropout = Math.max(0, Math.min(0.8, 
        architecture.hyperparameters.dropout + (Math.random() - 0.5) * 0.2
      ));
    }

    return architecture;
  }

  private generateLayerParameters(layerType: string): Record<string, any> {
    switch (layerType) {
      case 'dense':
        return { units: Math.floor(Math.random() * 512) + 32 };
      case 'conv2d':
        return {
          filters: Math.floor(Math.random() * 256) + 16,
          kernelSize: [3, 5][Math.floor(Math.random() * 2)]
        };
      default:
        return {};
    }
  }
}

class ReinforcementLearningSearch extends SearchStrategy {
  async generateNextGeneration(
    population: NeuralArchitecture[],
    searchSpace: SearchSpace,
    generation: number
  ): Promise<NeuralArchitecture[]> {
    await new Promise(resolve => setTimeout(resolve, 100));
    return population.slice(0, Math.floor(population.length / 2));
  }
}

class DifferentiableSearch extends SearchStrategy {
  async generateNextGeneration(
    population: NeuralArchitecture[],
    searchSpace: SearchSpace,
    generation: number
  ): Promise<NeuralArchitecture[]> {
    await new Promise(resolve => setTimeout(resolve, 100));
    return population.slice(0, Math.floor(population.length / 2));
  }
}

class RandomSearch extends SearchStrategy {
  async generateNextGeneration(
    population: NeuralArchitecture[],
    searchSpace: SearchSpace,
    generation: number
  ): Promise<NeuralArchitecture[]> {
    const nextGeneration: NeuralArchitecture[] = [];
    
    for (let i = 0; i < population.length; i++) {
      const randomArch = this.generateRandomArchitecture(searchSpace);
      randomArch.generation = generation + 1;
      nextGeneration.push(randomArch);
    }
    
    return nextGeneration;
  }

  private generateRandomArchitecture(searchSpace: SearchSpace): NeuralArchitecture {
    return {
      id: uuidv4(),
      layers: [],
      connections: [],
      hyperparameters: {
        learningRate: 0.001,
        batchSize: 32,
        optimizer: 'adam',
        activationFunction: 'relu',
        dropout: 0.2,
        regularization: { type: 'l2', strength: 0.001 }
      },
      metrics: { parameters: 0, flops: 0, trainingTime: 0, memoryUsage: 0 },
      generation: 0,
      parentIds: []
    };
  }
}