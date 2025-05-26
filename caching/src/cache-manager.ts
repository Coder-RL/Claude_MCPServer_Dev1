import { EventEmitter } from 'events';
import * as crypto from 'crypto';

export interface CacheEntry<T = any> {
  key: string;
  value: T;
  ttl: number;
  createdAt: number;
  lastAccessed: number;
  accessCount: number;
  size: number;
  tags: string[];
  metadata?: Record<string, any>;
}

export interface CacheConfig {
  maxSize: number; // bytes
  maxEntries: number;
  defaultTTL: number; // seconds
  cleanupInterval: number; // seconds
  strategy: 'lru' | 'lfu' | 'fifo' | 'random';
  compression?: {
    enabled: boolean;
    algorithm: 'gzip' | 'brotli';
    threshold: number; // bytes
  };
  persistence?: {
    enabled: boolean;
    path: string;
    interval: number; // seconds
  };
  distribution?: {
    enabled: boolean;
    nodes: string[];
    replicationFactor: number;
    consistentHashing: boolean;
  };
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  entries: number;
  hitRatio: number;
  avgAccessTime: number;
  memoryUsage: number;
}

export interface CacheLayer {
  name: string;
  priority: number;
  config: CacheConfig;
  enabled: boolean;
}

export class CacheManager extends EventEmitter {
  private layers = new Map<string, Map<string, CacheEntry>>();
  private layerConfigs = new Map<string, CacheConfig>();
  private layerStats = new Map<string, CacheStats>();
  private cleanupTimers = new Map<string, NodeJS.Timeout>();
  private persistenceTimers = new Map<string, NodeJS.Timeout>();
  private compressionCache = new Map<string, Buffer>();
  private accessPatterns = new Map<string, number[]>();
  private hotKeys = new Set<string>();

  constructor() {
    super();
    this.setupDefaultLayer();
    this.startHotKeyDetection();
  }

  private setupDefaultLayer(): void {
    const defaultConfig: CacheConfig = {
      maxSize: 100 * 1024 * 1024, // 100MB
      maxEntries: 10000,
      defaultTTL: 3600, // 1 hour
      cleanupInterval: 300, // 5 minutes
      strategy: 'lru'
    };

    this.addLayer('default', defaultConfig);
  }

  addLayer(name: string, config: CacheConfig): void {
    this.layers.set(name, new Map());
    this.layerConfigs.set(name, config);
    this.layerStats.set(name, {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
      entries: 0,
      hitRatio: 0,
      avgAccessTime: 0,
      memoryUsage: 0
    });

    this.setupLayerCleanup(name);
    
    if (config.persistence?.enabled) {
      this.setupLayerPersistence(name);
    }

    this.emit('layer-added', { name, config });
  }

  removeLayer(name: string): void {
    if (name === 'default') {
      throw new Error('Cannot remove default layer');
    }

    const layer = this.layers.get(name);
    if (layer) {
      layer.clear();
      this.layers.delete(name);
      this.layerConfigs.delete(name);
      this.layerStats.delete(name);

      const cleanupTimer = this.cleanupTimers.get(name);
      if (cleanupTimer) {
        clearInterval(cleanupTimer);
        this.cleanupTimers.delete(name);
      }

      const persistenceTimer = this.persistenceTimers.get(name);
      if (persistenceTimer) {
        clearInterval(persistenceTimer);
        this.persistenceTimers.delete(name);
      }

      this.emit('layer-removed', { name });
    }
  }

  async set<T>(
    key: string,
    value: T,
    options: {
      ttl?: number;
      layer?: string;
      tags?: string[];
      metadata?: Record<string, any>;
    } = {}
  ): Promise<void> {
    const layerName = options.layer || 'default';
    const layer = this.layers.get(layerName);
    const config = this.layerConfigs.get(layerName);
    
    if (!layer || !config) {
      throw new Error(`Layer not found: ${layerName}`);
    }

    const now = Date.now();
    const ttl = (options.ttl || config.defaultTTL) * 1000; // Convert to ms
    const serializedValue = JSON.stringify(value);
    let processedValue: any = serializedValue;
    let size = Buffer.byteLength(serializedValue, 'utf8');

    // Apply compression if configured
    if (config.compression?.enabled && size > config.compression.threshold) {
      processedValue = await this.compress(serializedValue, config.compression.algorithm);
      size = processedValue.length;
    }

    const entry: CacheEntry<T> = {
      key,
      value: processedValue,
      ttl,
      createdAt: now,
      lastAccessed: now,
      accessCount: 1,
      size,
      tags: options.tags || [],
      metadata: options.metadata
    };

    // Check if we need to evict entries
    await this.ensureCapacity(layerName, size);

    layer.set(key, entry as CacheEntry);
    
    const stats = this.layerStats.get(layerName)!;
    stats.entries = layer.size;
    stats.size += size;
    stats.memoryUsage = this.calculateMemoryUsage(layerName);

    this.emit('cache-set', { layer: layerName, key, size, ttl });
  }

  async get<T>(
    key: string,
    options: {
      layer?: string;
      updateAccessTime?: boolean;
    } = {}
  ): Promise<T | null> {
    const layerName = options.layer || 'default';
    const updateAccessTime = options.updateAccessTime !== false;

    // Try all layers if no specific layer requested
    const layersToCheck = layerName === 'default' 
      ? Array.from(this.layers.keys())
      : [layerName];

    for (const currentLayer of layersToCheck) {
      const layer = this.layers.get(currentLayer);
      const config = this.layerConfigs.get(currentLayer);
      const stats = this.layerStats.get(currentLayer);

      if (!layer || !config || !stats) continue;

      const entry = layer.get(key);
      if (!entry) {
        stats.misses++;
        continue;
      }

      const now = Date.now();

      // Check if entry has expired
      if (entry.createdAt + entry.ttl < now) {
        layer.delete(key);
        stats.size -= entry.size;
        stats.entries = layer.size;
        stats.evictions++;
        stats.misses++;
        this.emit('cache-expired', { layer: currentLayer, key });
        continue;
      }

      // Update access information
      if (updateAccessTime) {
        entry.lastAccessed = now;
        entry.accessCount++;
      }

      stats.hits++;
      stats.hitRatio = stats.hits / (stats.hits + stats.misses);

      // Track access patterns
      this.trackAccess(key);

      let value: T;
      
      // Decompress if needed
      if (config.compression?.enabled && Buffer.isBuffer(entry.value)) {
        const decompressed = await this.decompress(entry.value, config.compression.algorithm);
        value = JSON.parse(decompressed);
      } else {
        value = typeof entry.value === 'string' ? JSON.parse(entry.value) : entry.value;
      }

      this.emit('cache-hit', { layer: currentLayer, key, accessCount: entry.accessCount });
      return value;
    }

    // Cache miss
    const stats = this.layerStats.get(layerName)!;
    stats.misses++;
    stats.hitRatio = stats.hits / (stats.hits + stats.misses);
    
    this.emit('cache-miss', { layer: layerName, key });
    return null;
  }

  async delete(key: string, layer?: string): Promise<boolean> {
    const layersToCheck = layer ? [layer] : Array.from(this.layers.keys());
    let deleted = false;

    for (const layerName of layersToCheck) {
      const layerMap = this.layers.get(layerName);
      const stats = this.layerStats.get(layerName);
      
      if (!layerMap || !stats) continue;

      const entry = layerMap.get(key);
      if (entry) {
        layerMap.delete(key);
        stats.size -= entry.size;
        stats.entries = layerMap.size;
        deleted = true;
        
        this.emit('cache-delete', { layer: layerName, key, size: entry.size });
      }
    }

    return deleted;
  }

  async invalidateByTag(tag: string, layer?: string): Promise<number> {
    const layersToCheck = layer ? [layer] : Array.from(this.layers.keys());
    let invalidated = 0;

    for (const layerName of layersToCheck) {
      const layerMap = this.layers.get(layerName);
      const stats = this.layerStats.get(layerName);
      
      if (!layerMap || !stats) continue;

      const keysToDelete: string[] = [];
      
      for (const [key, entry] of layerMap) {
        if (entry.tags.includes(tag)) {
          keysToDelete.push(key);
        }
      }

      for (const key of keysToDelete) {
        const entry = layerMap.get(key)!;
        layerMap.delete(key);
        stats.size -= entry.size;
        stats.entries = layerMap.size;
        invalidated++;
      }
    }

    this.emit('cache-invalidated', { tag, count: invalidated });
    return invalidated;
  }

  async clear(layer?: string): Promise<void> {
    const layersToClear = layer ? [layer] : Array.from(this.layers.keys());

    for (const layerName of layersToClear) {
      const layerMap = this.layers.get(layerName);
      const stats = this.layerStats.get(layerName);
      
      if (!layerMap || !stats) continue;

      const entryCount = layerMap.size;
      layerMap.clear();
      
      stats.size = 0;
      stats.entries = 0;
      stats.memoryUsage = 0;
      
      this.emit('cache-cleared', { layer: layerName, entriesRemoved: entryCount });
    }
  }

  private async ensureCapacity(layerName: string, newEntrySize: number): Promise<void> {
    const layer = this.layers.get(layerName);
    const config = this.layerConfigs.get(layerName);
    const stats = this.layerStats.get(layerName);
    
    if (!layer || !config || !stats) return;

    // Check size limit
    if (stats.size + newEntrySize > config.maxSize) {
      await this.evictEntries(layerName, (stats.size + newEntrySize) - config.maxSize);
    }

    // Check entry count limit
    if (layer.size >= config.maxEntries) {
      await this.evictEntries(layerName, 0, layer.size - config.maxEntries + 1);
    }
  }

  private async evictEntries(layerName: string, sizeToFree: number, countToFree: number = 0): Promise<void> {
    const layer = this.layers.get(layerName);
    const config = this.layerConfigs.get(layerName);
    const stats = this.layerStats.get(layerName);
    
    if (!layer || !config || !stats) return;

    const entries = Array.from(layer.entries()).map(([key, entry]) => ({ key, entry }));
    let evictionCandidates: Array<{ key: string; entry: CacheEntry }> = [];

    switch (config.strategy) {
      case 'lru':
        evictionCandidates = entries.sort((a, b) => a.entry.lastAccessed - b.entry.lastAccessed);
        break;
      
      case 'lfu':
        evictionCandidates = entries.sort((a, b) => a.entry.accessCount - b.entry.accessCount);
        break;
      
      case 'fifo':
        evictionCandidates = entries.sort((a, b) => a.entry.createdAt - b.entry.createdAt);
        break;
      
      case 'random':
        evictionCandidates = entries.sort(() => Math.random() - 0.5);
        break;
    }

    let freedSize = 0;
    let freedCount = 0;

    for (const { key, entry } of evictionCandidates) {
      if ((sizeToFree > 0 && freedSize >= sizeToFree) && (countToFree === 0 || freedCount >= countToFree)) {
        break;
      }

      layer.delete(key);
      freedSize += entry.size;
      freedCount++;
      stats.evictions++;
      
      this.emit('cache-evicted', { layer: layerName, key, size: entry.size, strategy: config.strategy });
    }

    stats.size -= freedSize;
    stats.entries = layer.size;
  }

  private setupLayerCleanup(layerName: string): void {
    const config = this.layerConfigs.get(layerName);
    if (!config) return;

    const timer = setInterval(() => {
      this.cleanupExpiredEntries(layerName);
    }, config.cleanupInterval * 1000);

    this.cleanupTimers.set(layerName, timer);
  }

  private setupLayerPersistence(layerName: string): void {
    const config = this.layerConfigs.get(layerName);
    if (!config?.persistence?.enabled) return;

    const timer = setInterval(() => {
      this.persistLayer(layerName);
    }, config.persistence.interval * 1000);

    this.persistenceTimers.set(layerName, timer);
  }

  private cleanupExpiredEntries(layerName: string): void {
    const layer = this.layers.get(layerName);
    const stats = this.layerStats.get(layerName);
    
    if (!layer || !stats) return;

    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of layer) {
      if (entry.createdAt + entry.ttl < now) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      const entry = layer.get(key)!;
      layer.delete(key);
      stats.size -= entry.size;
      stats.evictions++;
    }

    stats.entries = layer.size;
    
    if (expiredKeys.length > 0) {
      this.emit('cleanup-completed', { layer: layerName, expired: expiredKeys.length });
    }
  }

  private async persistLayer(layerName: string): Promise<void> {
    const layer = this.layers.get(layerName);
    const config = this.layerConfigs.get(layerName);
    
    if (!layer || !config?.persistence?.enabled) return;

    try {
      const entries = Array.from(layer.entries());
      const data = JSON.stringify(entries);
      
      // In production, write to actual file system
      this.emit('persistence-completed', { layer: layerName, entries: entries.length });
    } catch (error) {
      this.emit('persistence-failed', { layer: layerName, error: (error as Error).message });
    }
  }

  private async compress(data: string, algorithm: 'gzip' | 'brotli'): Promise<Buffer> {
    const key = crypto.createHash('md5').update(data).digest('hex');
    
    if (this.compressionCache.has(key)) {
      return this.compressionCache.get(key)!;
    }

    let compressed: Buffer;
    
    if (algorithm === 'gzip') {
      const zlib = require('zlib');
      compressed = zlib.gzipSync(data);
    } else {
      const zlib = require('zlib');
      compressed = zlib.brotliCompressSync(data);
    }

    this.compressionCache.set(key, compressed);
    return compressed;
  }

  private async decompress(data: Buffer, algorithm: 'gzip' | 'brotli'): Promise<string> {
    if (algorithm === 'gzip') {
      const zlib = require('zlib');
      return zlib.gunzipSync(data).toString();
    } else {
      const zlib = require('zlib');
      return zlib.brotliDecompressSync(data).toString();
    }
  }

  private trackAccess(key: string): void {
    const now = Date.now();
    const pattern = this.accessPatterns.get(key) || [];
    
    // Keep only recent accesses (last hour)
    const recentAccesses = pattern.filter(time => now - time < 3600000);
    recentAccesses.push(now);
    
    this.accessPatterns.set(key, recentAccesses);
    
    // Mark as hot key if accessed frequently
    if (recentAccesses.length > 10) {
      this.hotKeys.add(key);
    }
  }

  private startHotKeyDetection(): void {
    setInterval(() => {
      const now = Date.now();
      
      // Clean up old access patterns
      for (const [key, pattern] of this.accessPatterns) {
        const recentAccesses = pattern.filter(time => now - time < 3600000);
        
        if (recentAccesses.length === 0) {
          this.accessPatterns.delete(key);
          this.hotKeys.delete(key);
        } else {
          this.accessPatterns.set(key, recentAccesses);
          
          if (recentAccesses.length < 5) {
            this.hotKeys.delete(key);
          }
        }
      }
      
      this.emit('hot-keys-updated', { hotKeys: Array.from(this.hotKeys) });
    }, 300000); // Every 5 minutes
  }

  private calculateMemoryUsage(layerName: string): number {
    const layer = this.layers.get(layerName);
    if (!layer) return 0;

    let usage = 0;
    for (const entry of layer.values()) {
      usage += entry.size + 200; // Approximate overhead per entry
    }
    
    return usage;
  }

  getStats(layer?: string): CacheStats | Record<string, CacheStats> {
    if (layer) {
      const stats = this.layerStats.get(layer);
      if (!stats) {
        throw new Error(`Layer not found: ${layer}`);
      }
      return { ...stats };
    }

    const allStats: Record<string, CacheStats> = {};
    for (const [layerName, stats] of this.layerStats) {
      allStats[layerName] = { ...stats };
    }
    
    return allStats;
  }

  getHotKeys(): string[] {
    return Array.from(this.hotKeys);
  }

  getLayers(): string[] {
    return Array.from(this.layers.keys());
  }

  getLayerConfig(layer: string): CacheConfig | null {
    return this.layerConfigs.get(layer) || null;
  }

  updateLayerConfig(layer: string, config: Partial<CacheConfig>): void {
    const currentConfig = this.layerConfigs.get(layer);
    if (!currentConfig) {
      throw new Error(`Layer not found: ${layer}`);
    }

    const newConfig = { ...currentConfig, ...config };
    this.layerConfigs.set(layer, newConfig);
    
    // Restart timers if intervals changed
    if (config.cleanupInterval) {
      const timer = this.cleanupTimers.get(layer);
      if (timer) {
        clearInterval(timer);
        this.setupLayerCleanup(layer);
      }
    }

    this.emit('layer-config-updated', { layer, config: newConfig });
  }

  destroy(): void {
    // Clear all timers
    for (const timer of this.cleanupTimers.values()) {
      clearInterval(timer);
    }
    
    for (const timer of this.persistenceTimers.values()) {
      clearInterval(timer);
    }
    
    // Clear all caches
    this.layers.clear();
    this.layerConfigs.clear();
    this.layerStats.clear();
    this.cleanupTimers.clear();
    this.persistenceTimers.clear();
    this.compressionCache.clear();
    this.accessPatterns.clear();
    this.hotKeys.clear();
    
    this.removeAllListeners();
  }
}