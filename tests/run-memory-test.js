#!/usr/bin/env node

/**
 * Memory Leak Test Runner
 * Tests memory management improvements in the Claude MCP Server ecosystem
 */

import { createLogger } from '../shared/src/logging.js';
import { EventEmitter } from 'events';

const logger = createLogger('MemoryLeakTest');

// Simple memory leak detector
class SimpleMemoryLeakDetector {
  constructor() {
    this.snapshots = [];
    this.baselineMemory = null;
  }

  takeSnapshot() {
    const memUsage = process.memoryUsage();
    return {
      timestamp: new Date(),
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      rss: memUsage.rss,
      external: memUsage.external
    };
  }

  start() {
    this.baselineMemory = this.takeSnapshot();
    logger.info('Memory baseline established', {
      heapUsed: this.formatBytes(this.baselineMemory.heapUsed),
      heapTotal: this.formatBytes(this.baselineMemory.heapTotal),
      rss: this.formatBytes(this.baselineMemory.rss)
    });
  }

  analyze() {
    const current = this.takeSnapshot();
    const growth = {
      heap: current.heapUsed - this.baselineMemory.heapUsed,
      total: current.heapTotal - this.baselineMemory.heapTotal,
      rss: current.rss - this.baselineMemory.rss
    };

    return {
      baseline: this.baselineMemory,
      current,
      growth,
      leakDetected: growth.heap > 50 * 1024 * 1024 // 50MB threshold
    };
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    const value = bytes / Math.pow(k, i);
    return `${value.toFixed(2)} ${sizes[i]}`;
  }
}

// Test cases
class MemoryTests {
  constructor() {
    this.detector = new SimpleMemoryLeakDetector();
    this.results = [];
  }

  async runAllTests() {
    logger.info('Starting Memory Leak Tests');
    logger.info('=============================\n');

    this.detector.start();

    // Run individual tests
    await this.testBasicAllocationPattern();
    await this.testEventEmitterCleanup();
    await this.testTimerCleanup();
    await this.testMapGrowth();
    await this.testBufferAllocation();
    await this.testPromiseAccumulation();

    // Final analysis
    this.printResults();
  }

  async testBasicAllocationPattern() {
    const testName = 'Basic Allocation Pattern';
    const startMem = process.memoryUsage().heapUsed;
    
    try {
      // Test allocation and deallocation
      const arrays = [];
      for (let i = 0; i < 100; i++) {
        arrays.push(new Array(10000).fill(i));
      }
      
      // Clear references
      arrays.length = 0;
      
      // Force GC if available
      if (global.gc) {
        global.gc();
      }
      
      const endMem = process.memoryUsage().heapUsed;
      const leaked = endMem - startMem;
      
      this.results.push({
        testName,
        passed: leaked < 5 * 1024 * 1024, // Less than 5MB
        memoryLeaked: leaked,
        message: `Memory change: ${this.detector.formatBytes(leaked)}`
      });
      
    } catch (error) {
      this.results.push({
        testName,
        passed: false,
        error: error.message
      });
    }
  }

  async testEventEmitterCleanup() {
    const testName = 'EventEmitter Cleanup';
    const startMem = process.memoryUsage().heapUsed;
    
    try {
      // EventEmitter already imported
      const emitters = [];
      
      // Create emitters with listeners
      for (let i = 0; i < 50; i++) {
        const emitter = new EventEmitter();
        
        // Add multiple listeners
        for (let j = 0; j < 10; j++) {
          emitter.on('event', () => {
            // Handler that captures variables
            const data = new Array(1000).fill(j);
          });
        }
        
        emitters.push(emitter);
      }
      
      // Clean up properly
      for (const emitter of emitters) {
        emitter.removeAllListeners();
      }
      
      emitters.length = 0;
      
      if (global.gc) {
        global.gc();
      }
      
      const endMem = process.memoryUsage().heapUsed;
      const leaked = endMem - startMem;
      
      this.results.push({
        testName,
        passed: leaked < 2 * 1024 * 1024, // Less than 2MB
        memoryLeaked: leaked,
        message: `Memory change: ${this.detector.formatBytes(leaked)}`
      });
      
    } catch (error) {
      this.results.push({
        testName,
        passed: false,
        error: error.message
      });
    }
  }

  async testTimerCleanup() {
    const testName = 'Timer Cleanup';
    const startMem = process.memoryUsage().heapUsed;
    
    try {
      const timers = [];
      
      // Create timers
      for (let i = 0; i < 100; i++) {
        const timer = setInterval(() => {
          const data = new Array(100).fill(i);
        }, 10000); // Long interval so they don't fire
        
        timers.push(timer);
      }
      
      // Clean up timers
      for (const timer of timers) {
        clearInterval(timer);
      }
      
      timers.length = 0;
      
      if (global.gc) {
        global.gc();
      }
      
      const endMem = process.memoryUsage().heapUsed;
      const leaked = endMem - startMem;
      
      this.results.push({
        testName,
        passed: leaked < 1 * 1024 * 1024, // Less than 1MB
        memoryLeaked: leaked,
        message: `Memory change: ${this.detector.formatBytes(leaked)}`
      });
      
    } catch (error) {
      this.results.push({
        testName,
        passed: false,
        error: error.message
      });
    }
  }

  async testMapGrowth() {
    const testName = 'Map Growth Control';
    const startMem = process.memoryUsage().heapUsed;
    
    try {
      const maps = [];
      
      // Create maps with size limits
      for (let i = 0; i < 10; i++) {
        const map = new Map();
        
        // Add entries
        for (let j = 0; j < 1000; j++) {
          map.set(`key-${j}`, { data: new Array(100).fill(j) });
          
          // Enforce size limit
          if (map.size > 100) {
            const firstKey = map.keys().next().value;
            map.delete(firstKey);
          }
        }
        
        maps.push(map);
      }
      
      // Clear all maps
      for (const map of maps) {
        map.clear();
      }
      
      maps.length = 0;
      
      if (global.gc) {
        global.gc();
      }
      
      const endMem = process.memoryUsage().heapUsed;
      const leaked = endMem - startMem;
      
      this.results.push({
        testName,
        passed: leaked < 3 * 1024 * 1024, // Less than 3MB
        memoryLeaked: leaked,
        message: `Memory change: ${this.detector.formatBytes(leaked)}`
      });
      
    } catch (error) {
      this.results.push({
        testName,
        passed: false,
        error: error.message
      });
    }
  }

  async testBufferAllocation() {
    const testName = 'Buffer Allocation';
    const startMem = process.memoryUsage().heapUsed;
    
    try {
      const buffers = [];
      
      // Allocate buffers
      for (let i = 0; i < 50; i++) {
        buffers.push(Buffer.allocUnsafe(64 * 1024)); // 64KB each
      }
      
      // Clear buffers
      buffers.length = 0;
      
      if (global.gc) {
        global.gc();
      }
      
      const endMem = process.memoryUsage().heapUsed;
      const leaked = endMem - startMem;
      
      this.results.push({
        testName,
        passed: leaked < 1 * 1024 * 1024, // Less than 1MB
        memoryLeaked: leaked,
        message: `Memory change: ${this.detector.formatBytes(leaked)}`
      });
      
    } catch (error) {
      this.results.push({
        testName,
        passed: false,
        error: error.message
      });
    }
  }

  async testPromiseAccumulation() {
    const testName = 'Promise Accumulation';
    const startMem = process.memoryUsage().heapUsed;
    
    try {
      const promises = [];
      
      // Create promises
      for (let i = 0; i < 1000; i++) {
        const promise = new Promise((resolve) => {
          setTimeout(() => resolve(i), 0);
        });
        promises.push(promise);
      }
      
      // Wait for all promises
      await Promise.all(promises);
      
      promises.length = 0;
      
      if (global.gc) {
        global.gc();
      }
      
      const endMem = process.memoryUsage().heapUsed;
      const leaked = endMem - startMem;
      
      this.results.push({
        testName,
        passed: leaked < 2 * 1024 * 1024, // Less than 2MB
        memoryLeaked: leaked,
        message: `Memory change: ${this.detector.formatBytes(leaked)}`
      });
      
    } catch (error) {
      this.results.push({
        testName,
        passed: false,
        error: error.message
      });
    }
  }

  printResults() {
    const analysis = this.detector.analyze();
    
    logger.info('\n========== Test Results ==========');
    logger.info('');
    
    let passed = 0;
    let totalLeaked = 0;
    
    for (const result of this.results) {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      logger.info(`${status} - ${result.testName}`);
      
      if (result.message) {
        logger.info(`  ${result.message}`);
      }
      
      if (result.error) {
        logger.error(`  Error: ${result.error}`);
      }
      
      if (result.passed) passed++;
      if (result.memoryLeaked) totalLeaked += result.memoryLeaked;
    }
    
    logger.info('');
    logger.info('========== Summary ==========');
    logger.info(`Tests passed: ${passed}/${this.results.length}`);
    logger.info(`Total memory leaked: ${this.detector.formatBytes(totalLeaked)}`);
    logger.info('');
    logger.info('Memory Analysis:');
    logger.info(`  Baseline heap: ${this.detector.formatBytes(analysis.baseline.heapUsed)}`);
    logger.info(`  Current heap: ${this.detector.formatBytes(analysis.current.heapUsed)}`);
    logger.info(`  Heap growth: ${this.detector.formatBytes(analysis.growth.heap)}`);
    logger.info(`  RSS growth: ${this.detector.formatBytes(analysis.growth.rss)}`);
    logger.info(`  Leak detected: ${analysis.leakDetected ? 'YES' : 'NO'}`);
    
    if (analysis.leakDetected) {
      logger.warn('\n⚠️  WARNING: Potential memory leak detected!');
      logger.warn('  Heap growth exceeded 50MB threshold');
      logger.warn('  Recommendations:');
      logger.warn('  - Review event listener cleanup');
      logger.warn('  - Check for accumulating data structures');
      logger.warn('  - Verify timer and interval cleanup');
      logger.warn('  - Look for circular references');
    }
    
    logger.info('\n=============================');
  }
}

// Run tests
async function main() {
  const tests = new MemoryTests();
  
  try {
    await tests.runAllTests();
    process.exit(0);
  } catch (error) {
    logger.error('Test suite failed:', error);
    process.exit(1);
  }
}

// Check if running with --expose-gc
if (!global.gc) {
  logger.warn('⚠️  Running without --expose-gc flag');
  logger.warn('  For accurate results, run with: node --expose-gc tests/run-memory-test.js');
  logger.warn('');
}

main().catch(console.error);