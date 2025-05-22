import { EventEmitter } from 'events';
import { createLogger } from './logging.js';
import { memoryManager } from './memory-manager.js';

export interface CacheEntry<T = any> {
  key: string;
  value: T;
  size: number;
  createdAt: number;
  lastAccessed: number;
  accessCount: number;
  expiresAt?: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  tags: string[];
  hitCount: number;
  score: number; // Predictive scoring
  metadata: CacheMetadata;
}

export interface CacheMetadata {
  source: string;
  type: 'computation' | 'query' | 'model' | 'data' | 'session';
  compressionRatio?: number;
  serializationTime?: number;
  deserializationTime?: number;
  dependsOn?: string[]; // Other cache keys this depends on
  invalidatesOn?: string[]; // Events that invalidate this entry
}

export interface CacheConfiguration {
  maxSize: number;
  maxEntries: number;
  defaultTTL: number;
  evictionPolicy: 'lru' | 'lfu' | 'adaptive' | 'predictive' | 'hybrid';
  compressionEnabled: boolean;
  compressionThreshold: number;
  prefetchEnabled: boolean;
  prefetchThreshold: number;
  analyticsEnabled: boolean;
  persistToDisk: boolean;
  diskCachePath?: string;
}

export interface CacheStatistics {
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
  averageLatency: number;
  memoryUsage: number;
  entryCount: number;
  compressionRatio: number;
  prefetchHits: number;
  predictiveAccuracy: number;
}

export interface AccessPattern {
  key: string;
  timestamps: number[];
  frequencies: Map<number, number>; // hour -> frequency
  seasonality: number[];
  trend: number;
  lastPrediction: number;
  confidence: number;
}

export interface PredictionModel {
  type: 'linear' | 'exponential' | 'seasonal' | 'lstm' | 'ensemble';
  accuracy: number;
  trainedAt: number;
  features: string[];
  weights: number[];
}

export class IntelligentCache<T = any> extends EventEmitter {
  private logger = createLogger('IntelligentCache');
  private entries = new Map<string, CacheEntry<T>>();
  private accessPatterns = new Map<string, AccessPattern>();
  private config: CacheConfiguration;
  private stats: CacheStatistics;
  private predictionModel: PredictionModel;
  private memoryAllocationId: string | null = null;
  private compressionCache = new Map<string, Buffer>();
  private prefetchQueue: string[] = [];
  private analyticsInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<CacheConfiguration> = {}) {
    super();
    
    this.config = {
      maxSize: 512 * 1024 * 1024, // 512MB default
      maxEntries: 10000,
      defaultTTL: 3600000, // 1 hour
      evictionPolicy: 'hybrid',
      compressionEnabled: true,
      compressionThreshold: 1024, // 1KB
      prefetchEnabled: true,
      prefetchThreshold: 0.7, // 70% confidence
      analyticsEnabled: true,
      persistToDisk: false,
      ...config
    };

    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      hitRate: 0,
      averageLatency: 0,
      memoryUsage: 0,
      entryCount: 0,
      compressionRatio: 1.0,
      prefetchHits: 0,
      predictiveAccuracy: 0
    };

    this.predictionModel = {
      type: 'ensemble',
      accuracy: 0.5,
      trainedAt: Date.now(),
      features: ['frequency', 'recency', 'seasonality', 'size', 'type'],
      weights: [0.3, 0.25, 0.2, 0.15, 0.1]
    };

    this.initializeMemoryAllocation();
    this.startAnalytics();
    this.startPeriodicCleanup();

    this.logger.info('Intelligent Cache initialized', {
      maxSize: this.formatBytes(this.config.maxSize),
      policy: this.config.evictionPolicy,
      compression: this.config.compressionEnabled,
      prefetch: this.config.prefetchEnabled
    });
  }

  private async initializeMemoryAllocation(): Promise<void> {
    try {
      this.memoryAllocationId = await memoryManager.allocate(
        this.config.maxSize,
        'cache',
        'IntelligentCache',
        {
          poolId: 'cache-pool',
          priority: 'high',
          tags: ['cache', 'intelligent']
        }
      );
    } catch (error) {
      this.logger.warn('Failed to allocate dedicated memory pool, using system memory');
    }
  }

  async get(key: string, options: { 
    updateAccess?: boolean;
    source?: string;
  } = {}): Promise<T | null> {
    const startTime = Date.now();
    const { updateAccess = true, source = 'unknown' } = options;

    const entry = this.entries.get(key);
    
    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      this.recordAccessPattern(key, false);
      this.emit('miss', { key, source });
      return null;
    }

    // Check expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      await this.delete(key);
      this.stats.misses++;
      this.updateHitRate();
      this.emit('expired', { key, age: Date.now() - entry.createdAt });
      return null;
    }

    // Update access statistics
    if (updateAccess) {
      entry.lastAccessed = Date.now();
      entry.accessCount++;
      entry.hitCount++;
      this.updateAccessPattern(key);
    }

    this.stats.hits++;
    this.stats.averageLatency = this.updateMovingAverage(
      this.stats.averageLatency,
      Date.now() - startTime
    );
    this.updateHitRate();

    this.emit('hit', { key, source, latency: Date.now() - startTime });
    
    // Trigger prefetch prediction
    if (this.config.prefetchEnabled) {
      this.predictAndPrefetch(key);
    }

    return entry.value;
  }

  async set(
    key: string, 
    value: T, 
    options: {
      ttl?: number;
      priority?: CacheEntry['priority'];
      tags?: string[];
      metadata?: Partial<CacheMetadata>;
      compress?: boolean;
    } = {}
  ): Promise<void> {
    const {
      ttl = this.config.defaultTTL,
      priority = 'medium',
      tags = [],
      metadata = {},
      compress = this.config.compressionEnabled
    } = options;

    const serializedValue = this.serialize(value);
    const size = this.calculateSize(serializedValue);
    
    // Check if we need to compress
    const shouldCompress = compress && size > this.config.compressionThreshold;
    let finalValue = serializedValue;
    let compressionRatio = 1.0;

    if (shouldCompress) {
      const compressionStart = Date.now();
      finalValue = await this.compress(serializedValue);
      compressionRatio = serializedValue.length / finalValue.length;
      metadata.compressionRatio = compressionRatio;
      metadata.serializationTime = Date.now() - compressionStart;
    }

    const now = Date.now();
    const entry: CacheEntry<T> = {
      key,
      value: finalValue as T,
      size: finalValue.length || size,
      createdAt: now,
      lastAccessed: now,
      accessCount: 1,
      expiresAt: ttl > 0 ? now + ttl : undefined,
      priority,
      tags,
      hitCount: 0,
      score: this.calculatePredictiveScore(key, size, metadata.type || 'data'),
      metadata: {
        source: 'user',
        type: 'data',
        ...metadata
      }
    };

    // Check if we need to make space
    await this.ensureSpace(entry.size);

    // Store the entry
    this.entries.set(key, entry);
    this.stats.entryCount = this.entries.size;
    this.stats.memoryUsage += entry.size;
    this.stats.compressionRatio = this.updateMovingAverage(
      this.stats.compressionRatio,
      compressionRatio
    );

    // Initialize access pattern tracking
    this.recordAccessPattern(key, true);

    this.emit('set', { 
      key, 
      size: entry.size, 
      compressed: shouldCompress,
      compressionRatio 
    });

    this.logger.debug(`Cached entry: ${key}`, {
      size: this.formatBytes(entry.size),
      ttl: ttl > 0 ? `${ttl / 1000}s` : 'none',
      compressed: shouldCompress,
      priority
    });
  }

  async delete(key: string): Promise<boolean> {
    const entry = this.entries.get(key);
    if (!entry) {
      return false;
    }

    this.entries.delete(key);
    this.accessPatterns.delete(key);
    this.stats.memoryUsage -= entry.size;
    this.stats.entryCount = this.entries.size;

    // Remove from prefetch queue
    const prefetchIndex = this.prefetchQueue.indexOf(key);
    if (prefetchIndex !== -1) {
      this.prefetchQueue.splice(prefetchIndex, 1);
    }

    this.emit('deleted', { key, size: entry.size });
    return true;
  }

  async clear(): Promise<void> {
    const entryCount = this.entries.size;
    const memoryUsage = this.stats.memoryUsage;

    this.entries.clear();
    this.accessPatterns.clear();
    this.prefetchQueue.length = 0;
    this.stats.memoryUsage = 0;
    this.stats.entryCount = 0;

    this.emit('cleared', { entryCount, memoryUsage });
    this.logger.info('Cache cleared', {
      entries: entryCount,
      memory: this.formatBytes(memoryUsage)
    });
  }

  private async ensureSpace(requiredSize: number): Promise<void> {
    // Check memory limit
    if (this.stats.memoryUsage + requiredSize > this.config.maxSize) {
      await this.evictEntries(requiredSize);
    }

    // Check entry count limit
    if (this.entries.size >= this.config.maxEntries) {
      await this.evictEntries(0, 1);
    }
  }

  private async evictEntries(requiredSize: number, minCount: number = 0): Promise<void> {
    const candidates = this.selectEvictionCandidates(requiredSize, minCount);
    let freedSize = 0;
    let evictedCount = 0;

    for (const key of candidates) {
      const entry = this.entries.get(key);
      if (entry) {
        freedSize += entry.size;
        evictedCount++;
        await this.delete(key);
        
        if (freedSize >= requiredSize && evictedCount >= minCount) {
          break;
        }
      }
    }

    this.stats.evictions += evictedCount;
    
    this.emit('evicted', { 
      count: evictedCount, 
      freedSize,
      policy: this.config.evictionPolicy 
    });

    this.logger.debug(`Evicted ${evictedCount} entries`, {
      freed: this.formatBytes(freedSize),
      policy: this.config.evictionPolicy
    });
  }

  private selectEvictionCandidates(requiredSize: number, minCount: number): string[] {
    const entries = Array.from(this.entries.values());
    
    switch (this.config.evictionPolicy) {
      case 'lru':
        return this.selectLRUCandidates(entries, requiredSize, minCount);
      case 'lfu':
        return this.selectLFUCandidates(entries, requiredSize, minCount);
      case 'adaptive':
        return this.selectAdaptiveCandidates(entries, requiredSize, minCount);
      case 'predictive':
        return this.selectPredictiveCandidates(entries, requiredSize, minCount);
      case 'hybrid':
        return this.selectHybridCandidates(entries, requiredSize, minCount);
      default:
        return this.selectLRUCandidates(entries, requiredSize, minCount);
    }
  }

  private selectLRUCandidates(entries: CacheEntry<T>[], requiredSize: number, minCount: number): string[] {
    return entries
      .sort((a, b) => a.lastAccessed - b.lastAccessed)
      .slice(0, Math.max(minCount, Math.ceil(entries.length * 0.1)))
      .map(entry => entry.key);
  }

  private selectLFUCandidates(entries: CacheEntry<T>[], requiredSize: number, minCount: number): string[] {
    return entries
      .sort((a, b) => a.accessCount - b.accessCount)
      .slice(0, Math.max(minCount, Math.ceil(entries.length * 0.1)))
      .map(entry => entry.key);
  }

  private selectAdaptiveCandidates(entries: CacheEntry<T>[], requiredSize: number, minCount: number): string[] {
    // Combine recency and frequency with adaptive weights
    const now = Date.now();
    const scoredEntries = entries.map(entry => {
      const recency = (now - entry.lastAccessed) / (1000 * 60 * 60); // hours
      const frequency = entry.accessCount;
      const priority = { low: 1, medium: 2, high: 3, critical: 4 }[entry.priority];
      
      // Adaptive scoring based on current cache pressure
      const memoryPressure = this.stats.memoryUsage / this.config.maxSize;
      const recencyWeight = memoryPressure > 0.8 ? 0.7 : 0.4;
      const frequencyWeight = 1 - recencyWeight;
      
      const score = recencyWeight * recency - frequencyWeight * Math.log(frequency + 1) - priority;
      
      return { key: entry.key, score };
    });

    return scoredEntries
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(minCount, Math.ceil(entries.length * 0.1)))
      .map(item => item.key);
  }

  private selectPredictiveCandidates(entries: CacheEntry<T>[], requiredSize: number, minCount: number): string[] {
    // Use machine learning predictions for eviction
    const predictions = entries.map(entry => {
      const pattern = this.accessPatterns.get(entry.key);
      const futureAccess = this.predictNextAccess(entry.key, pattern);
      
      return {
        key: entry.key,
        nextAccessTime: futureAccess.nextAccess,
        confidence: futureAccess.confidence,
        priority: entry.priority
      };
    });

    // Sort by predicted next access time (ascending) and confidence (descending)
    return predictions
      .sort((a, b) => {
        if (Math.abs(a.nextAccessTime - b.nextAccessTime) < 3600000) { // Within 1 hour
          return a.confidence - b.confidence; // Lower confidence first
        }
        return a.nextAccessTime - b.nextAccessTime; // Later access first
      })
      .slice(0, Math.max(minCount, Math.ceil(entries.length * 0.1)))
      .map(item => item.key);
  }

  private selectHybridCandidates(entries: CacheEntry<T>[], requiredSize: number, minCount: number): string[] {
    // Combine multiple strategies with weighted voting
    const lru = this.selectLRUCandidates(entries, requiredSize, minCount);
    const lfu = this.selectLFUCandidates(entries, requiredSize, minCount);
    const adaptive = this.selectAdaptiveCandidates(entries, requiredSize, minCount);
    const predictive = this.selectPredictiveCandidates(entries, requiredSize, minCount);

    // Score candidates by frequency of appearance across strategies
    const candidateScores = new Map<string, number>();
    
    [lru, lfu, adaptive, predictive].forEach((candidates, index) => {
      const weight = [0.2, 0.2, 0.3, 0.3][index]; // Favor adaptive and predictive
      candidates.forEach((key, position) => {
        const score = weight * (candidates.length - position) / candidates.length;
        candidateScores.set(key, (candidateScores.get(key) || 0) + score);
      });
    });

    return Array.from(candidateScores.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, Math.max(minCount, Math.ceil(entries.length * 0.1)))
      .map(([key]) => key);
  }

  private recordAccessPattern(key: string, isHit: boolean): void {
    const now = Date.now();
    let pattern = this.accessPatterns.get(key);
    
    if (!pattern) {
      pattern = {
        key,
        timestamps: [],
        frequencies: new Map(),
        seasonality: new Array(24).fill(0), // Hourly seasonality
        trend: 0,
        lastPrediction: 0,
        confidence: 0.5
      };
      this.accessPatterns.set(key, pattern);
    }

    if (isHit) {
      pattern.timestamps.push(now);
      
      // Keep only last 100 timestamps
      if (pattern.timestamps.length > 100) {
        pattern.timestamps.shift();
      }
      
      // Update hourly frequency
      const hour = new Date(now).getHours();
      pattern.frequencies.set(hour, (pattern.frequencies.get(hour) || 0) + 1);
      pattern.seasonality[hour]++;
      
      // Update trend (simplified linear regression)
      if (pattern.timestamps.length >= 3) {
        pattern.trend = this.calculateTrend(pattern.timestamps);
      }
    }
  }

  private updateAccessPattern(key: string): void {
    this.recordAccessPattern(key, true);
  }

  private calculateTrend(timestamps: number[]): number {
    if (timestamps.length < 2) return 0;
    
    const n = timestamps.length;
    const x = timestamps.map((_, i) => i);
    const y = timestamps.map(t => t);
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
    const sumXX = x.reduce((acc, xi) => acc + xi * xi, 0);
    
    return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  }

  private predictNextAccess(key: string, pattern?: AccessPattern): { nextAccess: number; confidence: number } {
    if (!pattern || pattern.timestamps.length < 3) {
      return { nextAccess: Date.now() + 24 * 60 * 60 * 1000, confidence: 0.1 };
    }

    const now = Date.now();
    const lastAccess = pattern.timestamps[pattern.timestamps.length - 1];
    
    // Calculate average interval
    const intervals = [];
    for (let i = 1; i < pattern.timestamps.length; i++) {
      intervals.push(pattern.timestamps[i] - pattern.timestamps[i - 1]);
    }
    
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    
    // Apply trend
    const trendAdjustment = pattern.trend * intervals.length;
    const predictedInterval = avgInterval + trendAdjustment;
    
    // Apply seasonality
    const currentHour = new Date(now).getHours();
    const nextHour = (currentHour + Math.floor(predictedInterval / (60 * 60 * 1000))) % 24;
    const seasonalityFactor = pattern.seasonality[nextHour] / Math.max(1, Math.max(...pattern.seasonality));
    
    const nextAccess = lastAccess + predictedInterval * seasonalityFactor;
    
    // Calculate confidence based on pattern consistency
    const intervalVariance = this.calculateVariance(intervals);
    const confidence = Math.max(0.1, Math.min(0.9, 1 - intervalVariance / avgInterval));
    
    return { nextAccess, confidence };
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
  }

  private calculatePredictiveScore(key: string, size: number, type: string): number {
    // Multi-factor scoring for cache value prediction
    const factors = {
      sizeScore: Math.max(0, 1 - size / (1024 * 1024)), // Prefer smaller items
      typeScore: { computation: 0.9, model: 0.8, query: 0.7, data: 0.6, session: 0.5 }[type] || 0.5,
      timeScore: 1.0, // Will be updated based on access patterns
      frequencyScore: 0.5 // Initial neutral score
    };

    const weights = this.predictionModel.weights;
    return weights[0] * factors.frequencyScore +
           weights[1] * factors.timeScore +
           weights[2] * factors.typeScore +
           weights[3] * factors.sizeScore;
  }

  private async predictAndPrefetch(key: string): Promise<void> {
    if (!this.config.prefetchEnabled) return;
    
    const pattern = this.accessPatterns.get(key);
    if (!pattern) return;

    // Predict related keys based on access patterns
    const relatedKeys = this.findRelatedKeys(key, pattern);
    
    for (const relatedKey of relatedKeys) {
      const prediction = this.predictNextAccess(relatedKey);
      
      if (prediction.confidence > this.config.prefetchThreshold && 
          !this.entries.has(relatedKey) &&
          !this.prefetchQueue.includes(relatedKey)) {
        
        this.prefetchQueue.push(relatedKey);
        this.emit('prefetchQueued', { key: relatedKey, confidence: prediction.confidence });
      }
    }
  }

  private findRelatedKeys(key: string, pattern: AccessPattern): string[] {
    // Simple heuristic: find keys with similar access patterns
    const relatedKeys: string[] = [];
    const currentPattern = pattern;
    
    for (const [otherKey, otherPattern] of this.accessPatterns) {
      if (otherKey === key) continue;
      
      const similarity = this.calculatePatternSimilarity(currentPattern, otherPattern);
      if (similarity > 0.7) {
        relatedKeys.push(otherKey);
      }
    }
    
    return relatedKeys.slice(0, 3); // Limit to top 3
  }

  private calculatePatternSimilarity(pattern1: AccessPattern, pattern2: AccessPattern): number {
    // Calculate cosine similarity of seasonality patterns
    const dot = pattern1.seasonality.reduce((sum, val, i) => sum + val * pattern2.seasonality[i], 0);
    const norm1 = Math.sqrt(pattern1.seasonality.reduce((sum, val) => sum + val * val, 0));
    const norm2 = Math.sqrt(pattern2.seasonality.reduce((sum, val) => sum + val * val, 0));
    
    return norm1 > 0 && norm2 > 0 ? dot / (norm1 * norm2) : 0;
  }

  private serialize(value: T): string {
    try {
      return JSON.stringify(value);
    } catch (error) {
      this.logger.warn('Failed to serialize cache value:', error);
      return String(value);
    }
  }

  private deserialize(value: string): T {
    try {
      return JSON.parse(value);
    } catch (error) {
      return value as T;
    }
  }

  private async compress(data: string): Promise<Buffer> {
    // Simplified compression - in production would use zlib or similar
    return Buffer.from(data, 'utf8');
  }

  private async decompress(data: Buffer): Promise<string> {
    return data.toString('utf8');
  }

  private calculateSize(value: any): number {
    if (typeof value === 'string') {
      return Buffer.byteLength(value, 'utf8');
    }
    if (Buffer.isBuffer(value)) {
      return value.length;
    }
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  private updateMovingAverage(current: number, newValue: number, weight: number = 0.1): number {
    return current * (1 - weight) + newValue * weight;
  }

  private startAnalytics(): void {
    if (!this.config.analyticsEnabled) return;
    
    this.analyticsInterval = setInterval(() => {
      this.updateAnalytics();
      this.trainPredictionModel();
    }, 60000); // Every minute
  }

  private updateAnalytics(): void {
    // Update predictive accuracy
    let correctPredictions = 0;
    let totalPredictions = 0;
    
    for (const [key, pattern] of this.accessPatterns) {
      if (pattern.lastPrediction > 0) {
        const prediction = this.predictNextAccess(key, pattern);
        const actualAccess = pattern.timestamps[pattern.timestamps.length - 1];
        
        if (Math.abs(prediction.nextAccess - actualAccess) < 3600000) { // Within 1 hour
          correctPredictions++;
        }
        totalPredictions++;
      }
    }
    
    if (totalPredictions > 0) {
      this.stats.predictiveAccuracy = correctPredictions / totalPredictions;
    }
  }

  private trainPredictionModel(): void {
    // Simplified model training - in production would use ML frameworks
    const patterns = Array.from(this.accessPatterns.values());
    
    if (patterns.length < 10) return; // Need sufficient data
    
    // Update model accuracy based on recent predictions
    this.predictionModel.accuracy = this.stats.predictiveAccuracy;
    this.predictionModel.trainedAt = Date.now();
    
    // Adjust weights based on performance
    if (this.stats.predictiveAccuracy < 0.6) {
      // Increase weight on frequency and recency
      this.predictionModel.weights = [0.4, 0.3, 0.15, 0.1, 0.05];
    } else if (this.stats.predictiveAccuracy > 0.8) {
      // Balance all factors
      this.predictionModel.weights = [0.25, 0.25, 0.2, 0.15, 0.15];
    }
  }

  private startPeriodicCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, 300000); // Every 5 minutes
  }

  private async performCleanup(): Promise<void> {
    const now = Date.now();
    let expiredCount = 0;
    
    // Remove expired entries
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt && now > entry.expiresAt) {
        await this.delete(key);
        expiredCount++;
      }
    }
    
    // Clean up old access patterns
    for (const [key, pattern] of this.accessPatterns) {
      if (!this.entries.has(key) && 
          pattern.timestamps.length > 0 && 
          now - pattern.timestamps[pattern.timestamps.length - 1] > 24 * 60 * 60 * 1000) {
        this.accessPatterns.delete(key);
      }
    }
    
    if (expiredCount > 0) {
      this.logger.debug(`Cleaned up ${expiredCount} expired entries`);
    }
  }

  // Public API methods
  
  getStatistics(): CacheStatistics {
    return { ...this.stats };
  }

  getConfiguration(): CacheConfiguration {
    return { ...this.config };
  }

  updateConfiguration(updates: Partial<CacheConfiguration>): void {
    Object.assign(this.config, updates);
    this.logger.info('Cache configuration updated', updates);
  }

  getAccessPattern(key: string): AccessPattern | null {
    return this.accessPatterns.get(key) || null;
  }

  getPredictionModel(): PredictionModel {
    return { ...this.predictionModel };
  }

  async flush(): Promise<void> {
    await this.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      hitRate: 0,
      averageLatency: 0,
      memoryUsage: 0,
      entryCount: 0,
      compressionRatio: 1.0,
      prefetchHits: 0,
      predictiveAccuracy: 0
    };
  }

  async shutdown(): Promise<void> {
    if (this.analyticsInterval) {
      clearInterval(this.analyticsInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    await this.clear();
    
    if (this.memoryAllocationId) {
      await memoryManager.deallocate(this.memoryAllocationId);
    }
    
    this.logger.info('Intelligent Cache shutdown completed');
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }
}

// Factory function for creating configured cache instances
export function createIntelligentCache<T = any>(config?: Partial<CacheConfiguration>): IntelligentCache<T> {
  return new IntelligentCache<T>(config);
}

export default IntelligentCache;