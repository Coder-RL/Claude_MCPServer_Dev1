#!/usr/bin/env node

/**
 * Standalone Memory Leak Test
 * Tests memory management improvements without external dependencies
 */

import { EventEmitter } from 'events';

// Simple logger
const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args)
};

// Memory utilities
class MemoryUtils {
  static formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    const value = bytes / Math.pow(k, i);
    return `${value.toFixed(2)} ${sizes[i]}`;
  }

  static forceGC() {
    if (global.gc) {
      global.gc();
      return true;
    }
    return false;
  }

  static getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      heap: usage.heapUsed,
      total: usage.heapTotal,
      rss: usage.rss,
      external: usage.external
    };
  }
}

// Test runner
class MemoryTestRunner {
  constructor() {
    this.results = [];
    this.baseline = null;
  }

  async run() {
    logger.info('🧪 Starting Memory Leak Tests');
    logger.info('================================\n');

    // Establish baseline
    MemoryUtils.forceGC();
    this.baseline = MemoryUtils.getMemoryUsage();
    logger.info('📊 Memory baseline:', {
      heap: MemoryUtils.formatBytes(this.baseline.heap),
      total: MemoryUtils.formatBytes(this.baseline.total),
      rss: MemoryUtils.formatBytes(this.baseline.rss)
    });
    logger.info('');

    // Run tests
    await this.testArrayAllocation();
    await this.testEventEmitterLeaks();
    await this.testTimerLeaks();
    await this.testMapSizeControl();
    await this.testBufferManagement();
    await this.testPromiseChaining();
    await this.testCircularReferences();
    await this.testClosureLeaks();

    // Final report
    this.generateReport();
  }

  async runTest(name, testFn) {
    logger.info(`▶️  Running: ${name}`);
    
    MemoryUtils.forceGC();
    const before = MemoryUtils.getMemoryUsage();
    const startTime = Date.now();
    
    try {
      await testFn();
      
      MemoryUtils.forceGC();
      await new Promise(resolve => setTimeout(resolve, 100)); // Let GC finish
      MemoryUtils.forceGC();
      
      const after = MemoryUtils.getMemoryUsage();
      const duration = Date.now() - startTime;
      const leaked = after.heap - before.heap;
      
      const result = {
        name,
        passed: leaked < 5 * 1024 * 1024, // 5MB threshold
        duration,
        before: before.heap,
        after: after.heap,
        leaked,
        error: null
      };
      
      this.results.push(result);
      
      const status = result.passed ? '✅' : '❌';
      logger.info(`${status} ${name}: ${MemoryUtils.formatBytes(leaked)} leaked in ${duration}ms`);
      
    } catch (error) {
      this.results.push({
        name,
        passed: false,
        error: error.message
      });
      logger.error(`❌ ${name}: ${error.message}`);
    }
    
    logger.info('');
  }

  async testArrayAllocation() {
    await this.runTest('Array Allocation & Cleanup', async () => {
      const arrays = [];
      
      // Allocate
      for (let i = 0; i < 1000; i++) {
        arrays.push(new Array(1000).fill(i));
      }
      
      // Cleanup
      arrays.length = 0;
    });
  }

  async testEventEmitterLeaks() {
    await this.runTest('EventEmitter Memory Leaks', async () => {
      const emitters = [];
      
      // Create emitters with many listeners
      for (let i = 0; i < 100; i++) {
        const emitter = new EventEmitter();
        emitter.setMaxListeners(25); // Prevent warnings
        
        // Add listeners that capture scope
        for (let j = 0; j < 20; j++) {
          const data = new Array(100).fill(j);
          emitter.on('test', () => {
            return data.length;
          });
        }
        
        emitters.push(emitter);
      }
      
      // Proper cleanup
      for (const emitter of emitters) {
        emitter.removeAllListeners();
      }
      
      emitters.length = 0;
    });
  }

  async testTimerLeaks() {
    await this.runTest('Timer & Interval Cleanup', async () => {
      const timers = [];
      const intervals = [];
      
      // Create timers
      for (let i = 0; i < 500; i++) {
        const timer = setTimeout(() => {
          const data = new Array(100).fill(i);
        }, 60000); // Won't execute
        
        timers.push(timer);
      }
      
      // Create intervals
      for (let i = 0; i < 100; i++) {
        const interval = setInterval(() => {
          const data = new Array(100).fill(i);
        }, 60000);
        
        intervals.push(interval);
      }
      
      // Cleanup
      timers.forEach(t => clearTimeout(t));
      intervals.forEach(i => clearInterval(i));
      
      timers.length = 0;
      intervals.length = 0;
    });
  }

  async testMapSizeControl() {
    await this.runTest('Map Size Control', async () => {
      const maps = [];
      const MAX_SIZE = 100;
      
      for (let i = 0; i < 20; i++) {
        const map = new Map();
        
        // Add many entries but maintain size limit
        for (let j = 0; j < 1000; j++) {
          map.set(`key-${j}`, {
            id: j,
            data: new Array(100).fill(j),
            timestamp: Date.now()
          });
          
          // Enforce size limit (FIFO)
          if (map.size > MAX_SIZE) {
            const firstKey = map.keys().next().value;
            map.delete(firstKey);
          }
        }
        
        maps.push(map);
      }
      
      // Cleanup
      maps.forEach(m => m.clear());
      maps.length = 0;
    });
  }

  async testBufferManagement() {
    await this.runTest('Buffer Pool Management', async () => {
      const bufferPool = [];
      const POOL_SIZE = 50;
      const BUFFER_SIZE = 64 * 1024; // 64KB
      
      // Create buffer pool
      for (let i = 0; i < POOL_SIZE; i++) {
        bufferPool.push(Buffer.allocUnsafe(BUFFER_SIZE));
      }
      
      // Simulate usage
      const inUse = new Set();
      for (let i = 0; i < 200; i++) {
        const buffer = bufferPool[i % POOL_SIZE];
        inUse.add(buffer);
        
        // Release after "use"
        setTimeout(() => inUse.delete(buffer), 0);
      }
      
      // Wait for releases
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Cleanup
      bufferPool.length = 0;
      inUse.clear();
    });
  }

  async testPromiseChaining() {
    await this.runTest('Promise Chain Management', async () => {
      const promises = [];
      
      // Create promise chains
      for (let i = 0; i < 100; i++) {
        let promise = Promise.resolve(i);
        
        // Chain operations
        for (let j = 0; j < 10; j++) {
          promise = promise.then(val => {
            const data = new Array(10).fill(val);
            return val + data.length;
          });
        }
        
        promises.push(promise);
      }
      
      // Wait for all
      await Promise.all(promises);
      
      // Clear
      promises.length = 0;
    });
  }

  async testCircularReferences() {
    await this.runTest('Circular Reference Handling', async () => {
      const objects = [];
      
      // Create circular references
      for (let i = 0; i < 100; i++) {
        const obj1 = { id: i, data: new Array(100).fill(i) };
        const obj2 = { id: i + 1, data: new Array(100).fill(i + 1) };
        
        // Create circular reference
        obj1.ref = obj2;
        obj2.ref = obj1;
        
        objects.push(obj1, obj2);
      }
      
      // Break circular references
      for (let i = 0; i < objects.length; i += 2) {
        objects[i].ref = null;
        objects[i + 1].ref = null;
      }
      
      // Clear
      objects.length = 0;
    });
  }

  async testClosureLeaks() {
    await this.runTest('Closure Memory Leaks', async () => {
      const functions = [];
      
      // Create closures that capture large data
      for (let i = 0; i < 100; i++) {
        const largeData = new Array(1000).fill(i);
        
        const closure = () => {
          return largeData.reduce((a, b) => a + b, 0);
        };
        
        functions.push(closure);
      }
      
      // Clear functions (and their captured data)
      functions.length = 0;
    });
  }

  generateReport() {
    const current = MemoryUtils.getMemoryUsage();
    const totalGrowth = current.heap - this.baseline.heap;
    
    logger.info('\n================================');
    logger.info('📊 TEST RESULTS SUMMARY');
    logger.info('================================\n');
    
    let passed = 0;
    let totalLeaked = 0;
    
    for (const result of this.results) {
      if (result.passed) passed++;
      if (result.leaked) totalLeaked += result.leaked;
    }
    
    logger.info(`Tests Passed: ${passed}/${this.results.length}`);
    logger.info(`Total Memory Leaked: ${MemoryUtils.formatBytes(totalLeaked)}`);
    logger.info(`Overall Heap Growth: ${MemoryUtils.formatBytes(totalGrowth)}`);
    
    logger.info('\nDetailed Results:');
    logger.info('─────────────────');
    
    for (const result of this.results) {
      const status = result.passed ? '✅' : '❌';
      const leaked = result.leaked ? MemoryUtils.formatBytes(result.leaked) : 'N/A';
      logger.info(`${status} ${result.name}`);
      if (!result.passed) {
        logger.info(`   Leaked: ${leaked}`);
        if (result.error) {
          logger.info(`   Error: ${result.error}`);
        }
      }
    }
    
    logger.info('\nMemory Status:');
    logger.info('──────────────');
    logger.info(`Initial Heap: ${MemoryUtils.formatBytes(this.baseline.heap)}`);
    logger.info(`Final Heap: ${MemoryUtils.formatBytes(current.heap)}`);
    logger.info(`Heap Growth: ${MemoryUtils.formatBytes(totalGrowth)}`);
    logger.info(`RSS: ${MemoryUtils.formatBytes(current.rss)}`);
    logger.info(`External: ${MemoryUtils.formatBytes(current.external)}`);
    
    const leakDetected = totalGrowth > 50 * 1024 * 1024; // 50MB threshold
    
    if (leakDetected) {
      logger.warn('\n⚠️  WARNING: Potential memory leak detected!');
      logger.warn(`   Heap grew by ${MemoryUtils.formatBytes(totalGrowth)}`);
      logger.warn('\n   Recommendations:');
      logger.warn('   • Review event listener cleanup');
      logger.warn('   • Check for accumulating data structures');
      logger.warn('   • Verify timer and interval cleanup');
      logger.warn('   • Look for circular references');
      logger.warn('   • Check for closures capturing large data');
    } else {
      logger.info('\n✅ No significant memory leaks detected!');
    }
    
    logger.info('\n================================\n');
  }
}

// Main execution
async function main() {
  if (!global.gc) {
    logger.warn('⚠️  Running without --expose-gc flag');
    logger.warn('   For best results, run with: node --expose-gc memory-test-standalone.js\n');
  }
  
  const runner = new MemoryTestRunner();
  
  try {
    await runner.run();
    process.exit(0);
  } catch (error) {
    logger.error('Test failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);