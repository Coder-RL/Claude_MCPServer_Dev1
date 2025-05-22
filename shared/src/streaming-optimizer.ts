import { EventEmitter, Readable, Writable, Transform } from 'stream';
import { createLogger } from './logging.js';
import { memoryManager } from './memory-manager.js';
import { createIntelligentCache } from './intelligent-cache.js';

export interface StreamConfig {
  bufferSize: number;
  maxBuffers: number;
  backpressureThreshold: number;
  compressionEnabled: boolean;
  compressionThreshold: number;
  prefetchEnabled: boolean;
  prefetchSize: number;
  cacheEnabled: boolean;
  cacheSize: number;
  parallelProcessing: boolean;
  maxConcurrency: number;
  memoryLimit: number;
}

export interface StreamMetrics {
  bytesProcessed: number;
  chunksProcessed: number;
  throughput: number; // bytes per second
  latency: number;
  backpressureEvents: number;
  cacheHits: number;
  cacheMisses: number;
  compressionRatio: number;
  memoryUsage: number;
  processingTime: number;
  errorCount: number;
}

export interface BufferPool {
  id: string;
  buffers: Buffer[];
  inUse: Set<Buffer>;
  available: Buffer[];
  totalSize: number;
  bufferSize: number;
  allocationCount: number;
  deallocationCount: number;
}

export interface StreamProcessor<T = any> {
  process(chunk: T): Promise<T | null>;
  flush?(): Promise<T[]>;
  cleanup?(): Promise<void>;
}

export interface CompressionStrategy {
  compress(data: Buffer): Promise<Buffer>;
  decompress(data: Buffer): Promise<Buffer>;
  getRatio(originalSize: number, compressedSize: number): number;
}

export class StreamingOptimizer extends EventEmitter {
  private logger = createLogger('StreamingOptimizer');
  private config: StreamConfig;
  private metrics: StreamMetrics;
  private bufferPools = new Map<string, BufferPool>();
  private cache = createIntelligentCache();
  private compressionStrategy: CompressionStrategy;
  private activeStreams = new Set<string>();
  private processingQueue: Array<{ id: string; data: any; resolve: Function; reject: Function }> = [];
  private isProcessing = false;
  private memoryAllocationId: string | null = null;

  constructor(config: Partial<StreamConfig> = {}) {
    super();
    
    this.config = {
      bufferSize: 64 * 1024, // 64KB
      maxBuffers: 100,
      backpressureThreshold: 0.8,
      compressionEnabled: true,
      compressionThreshold: 1024, // 1KB
      prefetchEnabled: true,
      prefetchSize: 5,
      cacheEnabled: true,
      cacheSize: 100 * 1024 * 1024, // 100MB
      parallelProcessing: true,
      maxConcurrency: 4,
      memoryLimit: 512 * 1024 * 1024, // 512MB
      ...config
    };

    this.metrics = {
      bytesProcessed: 0,
      chunksProcessed: 0,
      throughput: 0,
      latency: 0,
      backpressureEvents: 0,
      cacheHits: 0,
      cacheMisses: 0,
      compressionRatio: 1.0,
      memoryUsage: 0,
      processingTime: 0,
      errorCount: 0
    };

    this.compressionStrategy = new GzipCompressionStrategy();
    
    this.initializeMemoryAllocation();
    this.initializeBufferPools();
    this.initializeCache();

    this.logger.info('Streaming Optimizer initialized', {
      bufferSize: this.formatBytes(this.config.bufferSize),
      maxBuffers: this.config.maxBuffers,
      memoryLimit: this.formatBytes(this.config.memoryLimit)
    });
  }

  private async initializeMemoryAllocation(): Promise<void> {
    try {
      this.memoryAllocationId = await memoryManager.allocate(
        this.config.memoryLimit,
        'buffer',
        'StreamingOptimizer',
        {
          poolId: 'buffer-pool',
          priority: 'high',
          tags: ['streaming', 'optimization']
        }
      );
    } catch (error) {
      this.logger.warn('Failed to allocate dedicated memory, using system memory');
    }
  }

  private initializeBufferPools(): void {
    // Create different sized buffer pools
    const poolSizes = [
      { id: 'small', bufferSize: 8 * 1024, count: 50 },    // 8KB x 50
      { id: 'medium', bufferSize: 64 * 1024, count: 30 },   // 64KB x 30  
      { id: 'large', bufferSize: 512 * 1024, count: 10 },   // 512KB x 10
      { id: 'xlarge', bufferSize: 2 * 1024 * 1024, count: 5 } // 2MB x 5
    ];

    for (const poolConfig of poolSizes) {
      this.createBufferPool(poolConfig.id, poolConfig.bufferSize, poolConfig.count);
    }
  }

  private initializeCache(): void {
    if (this.config.cacheEnabled) {
      this.cache.updateConfiguration({
        maxSize: this.config.cacheSize,
        evictionPolicy: 'adaptive',
        compressionEnabled: this.config.compressionEnabled,
        prefetchEnabled: this.config.prefetchEnabled
      });
    }
  }

  private createBufferPool(id: string, bufferSize: number, count: number): void {
    const buffers: Buffer[] = [];
    for (let i = 0; i < count; i++) {
      buffers.push(Buffer.allocUnsafe(bufferSize));
    }

    const pool: BufferPool = {
      id,
      buffers,
      inUse: new Set(),
      available: [...buffers],
      totalSize: bufferSize * count,
      bufferSize,
      allocationCount: 0,
      deallocationCount: 0
    };

    this.bufferPools.set(id, pool);
    this.logger.debug(`Created buffer pool: ${id}`, {
      bufferSize: this.formatBytes(bufferSize),
      count,
      totalSize: this.formatBytes(pool.totalSize)
    });
  }

  acquireBuffer(minSize: number): Buffer | null {
    // Find the smallest pool that can accommodate the size
    const suitablePools = Array.from(this.bufferPools.values())
      .filter(pool => pool.bufferSize >= minSize && pool.available.length > 0)
      .sort((a, b) => a.bufferSize - b.bufferSize);

    if (suitablePools.length === 0) {
      return null;
    }

    const pool = suitablePools[0];
    const buffer = pool.available.pop()!;
    pool.inUse.add(buffer);
    pool.allocationCount++;

    this.updateMemoryUsage();
    return buffer;
  }

  releaseBuffer(buffer: Buffer): void {
    for (const pool of this.bufferPools.values()) {
      if (pool.inUse.has(buffer)) {
        pool.inUse.delete(buffer);
        pool.available.push(buffer);
        pool.deallocationCount++;
        this.updateMemoryUsage();
        return;
      }
    }
  }

  private updateMemoryUsage(): void {
    let totalUsage = 0;
    for (const pool of this.bufferPools.values()) {
      totalUsage += pool.inUse.size * pool.bufferSize;
    }
    this.metrics.memoryUsage = totalUsage;
  }

  createOptimizedReadStream<T>(
    source: Readable | AsyncIterable<T>,
    processor?: StreamProcessor<T>
  ): OptimizedReadStream<T> {
    const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.activeStreams.add(streamId);

    const stream = new OptimizedReadStream<T>(streamId, this, processor);
    
    if (source instanceof Readable) {
      source.pipe(stream);
    } else {
      this.handleAsyncIterable(source, stream);
    }

    stream.on('end', () => {
      this.activeStreams.delete(streamId);
    });

    stream.on('error', () => {
      this.activeStreams.delete(streamId);
      this.metrics.errorCount++;
    });

    return stream;
  }

  private async handleAsyncIterable<T>(source: AsyncIterable<T>, stream: OptimizedReadStream<T>): Promise<void> {
    try {
      for await (const chunk of source) {
        if (!stream.push(chunk)) {
          // Wait for drain event if backpressure detected
          await new Promise(resolve => stream.once('drain', resolve));
        }
      }
      stream.push(null); // End the stream
    } catch (error) {
      stream.emit('error', error);
    }
  }

  createOptimizedWriteStream<T>(
    destination: Writable,
    processor?: StreamProcessor<T>
  ): OptimizedWriteStream<T> {
    const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.activeStreams.add(streamId);

    const stream = new OptimizedWriteStream<T>(streamId, this, processor);
    stream.pipe(destination);

    stream.on('finish', () => {
      this.activeStreams.delete(streamId);
    });

    stream.on('error', () => {
      this.activeStreams.delete(streamId);
      this.metrics.errorCount++;
    });

    return stream;
  }

  createOptimizedTransformStream<T, U>(
    processor: StreamProcessor<T>
  ): OptimizedTransformStream<T, U> {
    const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.activeStreams.add(streamId);

    const stream = new OptimizedTransformStream<T, U>(streamId, this, processor);

    stream.on('end', () => {
      this.activeStreams.delete(streamId);
    });

    stream.on('error', () => {
      this.activeStreams.delete(streamId);
      this.metrics.errorCount++;
    });

    return stream;
  }

  async processChunk<T>(streamId: string, chunk: T, processor?: StreamProcessor<T>): Promise<T | null> {
    const startTime = Date.now();
    
    try {
      // Check cache first
      if (this.config.cacheEnabled && processor) {
        const cacheKey = this.generateCacheKey(chunk);
        const cached = await this.cache.get(cacheKey);
        
        if (cached !== null) {
          this.metrics.cacheHits++;
          return cached as T;
        }
        this.metrics.cacheMisses++;
      }

      // Process the chunk
      let result: T | null = null;
      
      if (this.config.parallelProcessing && this.processingQueue.length < this.config.maxConcurrency) {
        result = await this.processInParallel(chunk, processor);
      } else {
        result = processor ? await processor.process(chunk) : chunk;
      }

      // Cache the result
      if (this.config.cacheEnabled && processor && result !== null) {
        const cacheKey = this.generateCacheKey(chunk);
        await this.cache.set(cacheKey, result, {
          tags: ['streaming', 'processed'],
          metadata: { type: 'computation', source: streamId }
        });
      }

      // Update metrics
      this.metrics.chunksProcessed++;
      this.metrics.processingTime += Date.now() - startTime;
      
      if (Buffer.isBuffer(chunk)) {
        this.metrics.bytesProcessed += chunk.length;
      } else if (typeof chunk === 'string') {
        this.metrics.bytesProcessed += Buffer.byteLength(chunk);
      }

      this.updateThroughput();
      
      return result;

    } catch (error) {
      this.metrics.errorCount++;
      this.logger.error(`Error processing chunk in stream ${streamId}:`, error);
      throw error;
    }
  }

  private async processInParallel<T>(chunk: T, processor?: StreamProcessor<T>): Promise<T | null> {
    return new Promise((resolve, reject) => {
      this.processingQueue.push({
        id: `task_${Date.now()}`,
        data: chunk,
        resolve,
        reject
      });

      if (!this.isProcessing) {
        this.processQueue(processor);
      }
    });
  }

  private async processQueue<T>(processor?: StreamProcessor<T>): Promise<void> {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    
    while (this.processingQueue.length > 0) {
      const batch = this.processingQueue.splice(0, this.config.maxConcurrency);
      
      await Promise.all(batch.map(async task => {
        try {
          const result = processor ? await processor.process(task.data) : task.data;
          task.resolve(result);
        } catch (error) {
          task.reject(error);
        }
      }));
    }
    
    this.isProcessing = false;
  }

  private generateCacheKey<T>(chunk: T): string {
    if (Buffer.isBuffer(chunk)) {
      return `chunk_${chunk.toString('base64').substring(0, 32)}`;
    } else if (typeof chunk === 'string') {
      return `chunk_${Buffer.from(chunk).toString('base64').substring(0, 32)}`;
    } else {
      return `chunk_${JSON.stringify(chunk).substring(0, 32)}`;
    }
  }

  private updateThroughput(): void {
    const now = Date.now();
    const timeWindow = 5000; // 5 seconds
    
    // Simple throughput calculation - in production would use a sliding window
    if (this.metrics.processingTime > 0) {
      this.metrics.throughput = this.metrics.bytesProcessed / (this.metrics.processingTime / 1000);
    }
  }

  async compressChunk(chunk: Buffer): Promise<Buffer> {
    if (!this.config.compressionEnabled || chunk.length < this.config.compressionThreshold) {
      return chunk;
    }

    const compressed = await this.compressionStrategy.compress(chunk);
    const ratio = this.compressionStrategy.getRatio(chunk.length, compressed.length);
    
    // Update compression ratio metric
    this.metrics.compressionRatio = (this.metrics.compressionRatio + ratio) / 2;
    
    return compressed;
  }

  async decompressChunk(chunk: Buffer): Promise<Buffer> {
    if (!this.config.compressionEnabled) {
      return chunk;
    }

    return await this.compressionStrategy.decompress(chunk);
  }

  detectBackpressure(stream: any): boolean {
    const bufferUtilization = stream.writableBuffer ? stream.writableBuffer.length / stream.writableHighWaterMark : 0;
    
    if (bufferUtilization > this.config.backpressureThreshold) {
      this.metrics.backpressureEvents++;
      this.emit('backpressure', { streamId: stream.streamId, utilization: bufferUtilization });
      return true;
    }
    
    return false;
  }

  // Public API methods

  getMetrics(): StreamMetrics {
    return { ...this.metrics };
  }

  getConfiguration(): StreamConfig {
    return { ...this.config };
  }

  updateConfiguration(updates: Partial<StreamConfig>): void {
    Object.assign(this.config, updates);
    
    // Update cache configuration if needed
    if (this.config.cacheEnabled && (updates.cacheSize || updates.compressionEnabled)) {
      this.cache.updateConfiguration({
        maxSize: this.config.cacheSize,
        compressionEnabled: this.config.compressionEnabled
      });
    }
    
    this.logger.info('Streaming configuration updated', updates);
  }

  getBufferPoolStatistics(): Array<{ id: string; stats: any }> {
    return Array.from(this.bufferPools.entries()).map(([id, pool]) => ({
      id,
      stats: {
        totalBuffers: pool.buffers.length,
        inUse: pool.inUse.size,
        available: pool.available.length,
        utilization: `${((pool.inUse.size / pool.buffers.length) * 100).toFixed(1)}%`,
        bufferSize: this.formatBytes(pool.bufferSize),
        totalSize: this.formatBytes(pool.totalSize),
        allocations: pool.allocationCount,
        deallocations: pool.deallocationCount
      }
    }));
  }

  getActiveStreams(): string[] {
    return Array.from(this.activeStreams);
  }

  getCacheStatistics(): any {
    return this.cache.getStatistics();
  }

  async clearCache(): Promise<void> {
    await this.cache.clear();
  }

  async shutdown(): Promise<void> {
    // Close all active streams
    for (const streamId of this.activeStreams) {
      this.emit('streamClose', { streamId });
    }
    
    // Clear cache
    await this.cache.shutdown();
    
    // Release memory allocation
    if (this.memoryAllocationId) {
      await memoryManager.deallocate(this.memoryAllocationId);
    }
    
    this.logger.info('Streaming Optimizer shutdown completed');
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }
}

class OptimizedReadStream<T> extends Readable {
  constructor(
    public streamId: string,
    private optimizer: StreamingOptimizer,
    private processor?: StreamProcessor<T>
  ) {
    super({ objectMode: true });
  }

  async _read(): Promise<void> {
    // Implemented by the source
  }

  push(chunk: T | null): boolean {
    if (chunk === null) {
      return super.push(null);
    }

    const buffer = this.optimizer.acquireBuffer(1024);
    if (!buffer) {
      this.emit('error', new Error('Unable to acquire buffer'));
      return false;
    }

    // Process chunk if processor is provided
    if (this.processor) {
      this.optimizer.processChunk(this.streamId, chunk, this.processor)
        .then(result => {
          const success = super.push(result);
          this.optimizer.releaseBuffer(buffer);
          return success;
        })
        .catch(error => {
          this.optimizer.releaseBuffer(buffer);
          this.emit('error', error);
        });
      return true;
    } else {
      const success = super.push(chunk);
      this.optimizer.releaseBuffer(buffer);
      return success;
    }
  }
}

class OptimizedWriteStream<T> extends Writable {
  constructor(
    public streamId: string,
    private optimizer: StreamingOptimizer,
    private processor?: StreamProcessor<T>
  ) {
    super({ objectMode: true });
  }

  async _write(chunk: T, encoding: string, callback: Function): Promise<void> {
    try {
      if (this.optimizer.detectBackpressure(this)) {
        // Handle backpressure
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      if (this.processor) {
        await this.optimizer.processChunk(this.streamId, chunk, this.processor);
      }
      
      callback();
    } catch (error) {
      callback(error);
    }
  }
}

class OptimizedTransformStream<T, U> extends Transform {
  constructor(
    public streamId: string,
    private optimizer: StreamingOptimizer,
    private processor: StreamProcessor<T>
  ) {
    super({ objectMode: true });
  }

  async _transform(chunk: T, encoding: string, callback: Function): Promise<void> {
    try {
      const result = await this.optimizer.processChunk(this.streamId, chunk, this.processor);
      if (result !== null) {
        this.push(result);
      }
      callback();
    } catch (error) {
      callback(error);
    }
  }

  async _flush(callback: Function): Promise<void> {
    try {
      if (this.processor.flush) {
        const results = await this.processor.flush();
        for (const result of results) {
          this.push(result);
        }
      }
      callback();
    } catch (error) {
      callback(error);
    }
  }
}

class GzipCompressionStrategy implements CompressionStrategy {
  async compress(data: Buffer): Promise<Buffer> {
    // Simplified compression - in production would use zlib
    return Buffer.from(data.toString('base64'));
  }

  async decompress(data: Buffer): Promise<Buffer> {
    // Simplified decompression - in production would use zlib
    return Buffer.from(data.toString(), 'base64');
  }

  getRatio(originalSize: number, compressedSize: number): number {
    return originalSize > 0 ? compressedSize / originalSize : 1;
  }
}

// Export singleton instance
export const streamingOptimizer = new StreamingOptimizer();
export default streamingOptimizer;