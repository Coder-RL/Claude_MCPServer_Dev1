import { memoryLeakDetector } from '../monitoring/src/memory-leak-detector.js';
import { memoryMonitoring } from '../monitoring/src/memory-monitoring.js';
import { memoryManager } from '../shared/src/memory-manager.js';
import { streamingOptimizer } from '../shared/src/streaming-optimizer.js';
import { MessageBus } from '../orchestration/src/message-bus.js';
import { redis } from '../database/redis-client.js';
import { db } from '../database/pg-pool.js';
import { createLogger } from '../shared/src/logging.js';

const logger = createLogger('MemoryLeakTest');

interface TestResult {
  testName: string;
  passed: boolean;
  memoryBefore: number;
  memoryAfter: number;
  memoryLeaked: number;
  duration: number;
  errors: string[];
}

class MemoryLeakTestSuite {
  private results: TestResult[] = [];

  async runAllTests(): Promise<void> {
    logger.info('Starting memory leak test suite');

    // Start memory monitoring
    await memoryMonitoring.start();
    
    memoryMonitoring.on('alert', (alert) => {
      logger.warn('Memory alert during testing', alert);
    });

    memoryMonitoring.on('leakDetected', (report) => {
      logger.error('Leak detected during testing', {
        confidence: report.confidence,
        growth: report.growth,
        patterns: report.suspiciousPatterns
      });
    });

    // Run individual tests
    await this.testMemoryManagerCleanup();
    await this.testRedisConnectionCleanup();
    await this.testPostgreSQLConnectionCleanup();
    await this.testStreamingOptimizerCleanup();
    await this.testMessageBusCleanup();
    await this.testMemoryAllocationPatterns();

    // Stop monitoring
    await memoryMonitoring.stop();

    // Report results
    this.reportResults();
  }

  private async testMemoryManagerCleanup(): Promise<void> {
    const testName = 'MemoryManager Cleanup';
    const memBefore = process.memoryUsage().heapUsed;
    const startTime = Date.now();
    const errors: string[] = [];

    try {
      // Test allocation and deallocation cycles
      const allocations: string[] = [];
      
      for (let i = 0; i < 100; i++) {
        const id = await memoryManager.allocate(
          1024 * 1024, // 1MB
          'temporary',
          'test-owner',
          { priority: 'low', tags: ['test'] }
        );
        allocations.push(id);
      }

      // Deallocate all
      for (const id of allocations) {
        await memoryManager.deallocate(id);
      }

      // Force GC
      if (global.gc) global.gc();

      // Check for cleanup
      const stats = memoryManager.getSystemMemoryInfo();
      if (stats.totalAllocations > 0) {
        errors.push(`Found ${stats.totalAllocations} lingering allocations`);
      }

    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    const memAfter = process.memoryUsage().heapUsed;
    const duration = Date.now() - startTime;

    this.results.push({
      testName,
      passed: errors.length === 0 && (memAfter - memBefore) < 5 * 1024 * 1024, // Less than 5MB growth
      memoryBefore: memBefore,
      memoryAfter: memAfter,
      memoryLeaked: Math.max(0, memAfter - memBefore),
      duration,
      errors
    });
  }

  private async testRedisConnectionCleanup(): Promise<void> {
    const testName = 'Redis Connection Cleanup';
    const memBefore = process.memoryUsage().heapUsed;
    const startTime = Date.now();
    const errors: string[] = [];

    try {
      // Test multiple subscribe/unsubscribe cycles
      const subscriberIds: string[] = [];
      
      for (let i = 0; i < 10; i++) {
        const id = await redis.subscribe(
          [`test-channel-${i}`],
          (channel, message) => {
            // Handler
          }
        );
        subscriberIds.push(id);
      }

      // Unsubscribe all
      for (const id of subscriberIds) {
        await redis.unsubscribe(id);
      }

      // Force GC
      if (global.gc) global.gc();

      // Check metrics
      const metrics = redis.getMetrics();
      if (metrics.commands.failed > 0) {
        errors.push(`${metrics.commands.failed} Redis commands failed`);
      }

    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    const memAfter = process.memoryUsage().heapUsed;
    const duration = Date.now() - startTime;

    this.results.push({
      testName,
      passed: errors.length === 0 && (memAfter - memBefore) < 2 * 1024 * 1024, // Less than 2MB growth
      memoryBefore: memBefore,
      memoryAfter: memAfter,
      memoryLeaked: Math.max(0, memAfter - memBefore),
      duration,
      errors
    });
  }

  private async testPostgreSQLConnectionCleanup(): Promise<void> {
    const testName = 'PostgreSQL Connection Cleanup';
    const memBefore = process.memoryUsage().heapUsed;
    const startTime = Date.now();
    const errors: string[] = [];

    try {
      // Test transaction cycles
      for (let i = 0; i < 10; i++) {
        await db.transaction(async (client) => {
          await client.query('SELECT NOW()');
        });
      }

      // Test query cycles
      for (let i = 0; i < 20; i++) {
        await db.query('SELECT $1::text', [`test-${i}`]);
      }

      // Force GC
      if (global.gc) global.gc();

      // Check metrics
      const metrics = db.getMetrics();
      if (metrics.activeConnections > 0) {
        errors.push(`Found ${metrics.activeConnections} active connections`);
      }

    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    const memAfter = process.memoryUsage().heapUsed;
    const duration = Date.now() - startTime;

    this.results.push({
      testName,
      passed: errors.length === 0 && (memAfter - memBefore) < 2 * 1024 * 1024,
      memoryBefore: memBefore,
      memoryAfter: memAfter,
      memoryLeaked: Math.max(0, memAfter - memBefore),
      duration,
      errors
    });
  }

  private async testStreamingOptimizerCleanup(): Promise<void> {
    const testName = 'StreamingOptimizer Cleanup';
    const memBefore = process.memoryUsage().heapUsed;
    const startTime = Date.now();
    const errors: string[] = [];

    try {
      // Test buffer allocation/deallocation
      const buffers: (Buffer | null)[] = [];
      
      for (let i = 0; i < 50; i++) {
        const buffer = streamingOptimizer.acquireBuffer(64 * 1024); // 64KB
        if (buffer) {
          buffers.push(buffer);
        }
      }

      // Release all buffers
      for (const buffer of buffers) {
        if (buffer) {
          streamingOptimizer.releaseBuffer(buffer);
        }
      }

      // Test stream creation
      const streams = [];
      for (let i = 0; i < 5; i++) {
        const stream = streamingOptimizer.createOptimizedTransformStream({
          async process(chunk) { return chunk; }
        });
        streams.push(stream);
      }

      // Clean up streams
      for (const stream of streams) {
        stream.end();
      }

      // Shutdown optimizer
      await streamingOptimizer.shutdown();

      // Force GC
      if (global.gc) global.gc();

    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    const memAfter = process.memoryUsage().heapUsed;
    const duration = Date.now() - startTime;

    this.results.push({
      testName,
      passed: errors.length === 0 && (memAfter - memBefore) < 10 * 1024 * 1024, // Less than 10MB growth
      memoryBefore: memBefore,
      memoryAfter: memAfter,
      memoryLeaked: Math.max(0, memAfter - memBefore),
      duration,
      errors
    });
  }

  private async testMessageBusCleanup(): Promise<void> {
    const testName = 'MessageBus Cleanup';
    const memBefore = process.memoryUsage().heapUsed;
    const startTime = Date.now();
    const errors: string[] = [];

    try {
      const messageBus = new MessageBus(redis);
      
      // Test consumer creation/deletion
      for (let i = 0; i < 5; i++) {
        await messageBus.subscribeToStream(
          `test-stream-${i}`,
          {
            group: 'test-group',
            consumer: `test-consumer-${i}`
          },
          async (message) => {
            // Handler
          }
        );
      }

      // Unsubscribe all
      for (let i = 0; i < 5; i++) {
        await messageBus.unsubscribeFromStream(
          `test-stream-${i}`,
          {
            group: 'test-group',
            consumer: `test-consumer-${i}`
          }
        );
      }

      // Shutdown
      await messageBus.shutdown();

      // Force GC
      if (global.gc) global.gc();

      const metrics = messageBus.getMetrics();
      if (metrics.activeConsumers > 0) {
        errors.push(`Found ${metrics.activeConsumers} active consumers`);
      }

    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    const memAfter = process.memoryUsage().heapUsed;
    const duration = Date.now() - startTime;

    this.results.push({
      testName,
      passed: errors.length === 0 && (memAfter - memBefore) < 5 * 1024 * 1024,
      memoryBefore: memBefore,
      memoryAfter: memAfter,
      memoryLeaked: Math.max(0, memAfter - memBefore),
      duration,
      errors
    });
  }

  private async testMemoryAllocationPatterns(): Promise<void> {
    const testName = 'Memory Allocation Patterns';
    const memBefore = process.memoryUsage().heapUsed;
    const startTime = Date.now();
    const errors: string[] = [];

    try {
      // Test rapid allocation/deallocation
      const allocations = new Map<string, any>();
      
      // Simulate memory churn
      for (let i = 0; i < 1000; i++) {
        const key = `allocation-${i % 100}`;
        
        if (allocations.has(key)) {
          // Delete old allocation
          allocations.delete(key);
        }
        
        // Create new allocation
        allocations.set(key, {
          data: Buffer.allocUnsafe(10 * 1024), // 10KB
          timestamp: Date.now(),
          metadata: { index: i }
        });
      }

      // Clear all allocations
      allocations.clear();

      // Force GC multiple times
      if (global.gc) {
        global.gc();
        await new Promise(resolve => setTimeout(resolve, 100));
        global.gc();
      }

    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    const memAfter = process.memoryUsage().heapUsed;
    const duration = Date.now() - startTime;

    this.results.push({
      testName,
      passed: errors.length === 0 && (memAfter - memBefore) < 20 * 1024 * 1024, // Less than 20MB growth
      memoryBefore: memBefore,
      memoryAfter: memAfter,
      memoryLeaked: Math.max(0, memAfter - memBefore),
      duration,
      errors
    });
  }

  private reportResults(): void {
    logger.info('\n========== Memory Leak Test Results ==========\n');
    
    let totalPassed = 0;
    let totalLeaked = 0;
    
    for (const result of this.results) {
      const status = result.passed ? '✅ PASSED' : '❌ FAILED';
      const leaked = this.formatBytes(result.memoryLeaked);
      
      logger.info(`${status} - ${result.testName}`);
      logger.info(`  Memory: ${this.formatBytes(result.memoryBefore)} → ${this.formatBytes(result.memoryAfter)}`);
      logger.info(`  Leaked: ${leaked} (${result.duration}ms)`);
      
      if (result.errors.length > 0) {
        logger.error(`  Errors: ${result.errors.join(', ')}`);
      }
      
      logger.info('');
      
      if (result.passed) totalPassed++;
      totalLeaked += result.memoryLeaked;
    }
    
    logger.info(`Summary: ${totalPassed}/${this.results.length} tests passed`);
    logger.info(`Total memory leaked: ${this.formatBytes(totalLeaked)}`);
    
    // Generate leak detection report
    const leakReport = memoryLeakDetector.getReport();
    if (leakReport.detected) {
      logger.warn('\n⚠️  Memory leak detected by continuous monitoring!');
      logger.warn(`Confidence: ${(leakReport.confidence * 100).toFixed(1)}%`);
      logger.warn(`Growth rate: ${this.formatBytes(leakReport.growth.rate)}/sec`);
      logger.warn(`Suspicious patterns: ${leakReport.suspiciousPatterns.join(', ')}`);
      logger.warn(`Recommendations: ${leakReport.recommendations.join(', ')}`);
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    const value = bytes / Math.pow(k, i);
    return `${value.toFixed(2)} ${sizes[i]}`;
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const testSuite = new MemoryLeakTestSuite();
  
  testSuite.runAllTests()
    .then(() => {
      logger.info('Memory leak tests completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Memory leak tests failed', { error });
      process.exit(1);
    });
}

export { MemoryLeakTestSuite };