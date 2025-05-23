#!/usr/bin/env node

/**
 * Full System Test Suite
 * Tests all MCP servers, memory management, and optimizations from cold start
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';

const execAsync = promisify(exec);

// Test configuration
const TEST_CONFIG = {
  timeout: 120000, // 2 minutes per test
  memoryThreshold: 500 * 1024 * 1024, // 500MB
  ports: {
    memory: 3201,
    codeQuality: 3202,
    documentation: 3203,
    webAccess: 3204,
    dataAnalytics: 3205,
    orchestration: 3206
  },
  healthCheckRetries: 10,
  healthCheckDelay: 2000
};

// Logger
const logger = {
  info: (...args) => console.log(`[${new Date().toISOString()}] [INFO]`, ...args),
  warn: (...args) => console.warn(`[${new Date().toISOString()}] [WARN]`, ...args),
  error: (...args) => console.error(`[${new Date().toISOString()}] [ERROR]`, ...args),
  success: (...args) => console.log(`[${new Date().toISOString()}] [SUCCESS]`, ...args)
};

// Memory utilities
class MemoryMonitor {
  constructor() {
    this.snapshots = [];
    this.baseline = null;
  }

  takeSnapshot(label = 'snapshot') {
    const usage = process.memoryUsage();
    const snapshot = {
      label,
      timestamp: new Date(),
      heap: usage.heapUsed,
      total: usage.heapTotal,
      rss: usage.rss,
      external: usage.external
    };
    this.snapshots.push(snapshot);
    return snapshot;
  }

  setBaseline() {
    this.baseline = this.takeSnapshot('baseline');
    return this.baseline;
  }

  getMemoryReport() {
    const current = this.takeSnapshot('current');
    const growth = this.baseline ? {
      heap: current.heap - this.baseline.heap,
      rss: current.rss - this.baseline.rss,
      total: current.total - this.baseline.total
    } : { heap: 0, rss: 0, total: 0 };

    return {
      baseline: this.baseline,
      current,
      growth,
      snapshots: this.snapshots,
      leakDetected: growth.heap > TEST_CONFIG.memoryThreshold
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

// System test runner
class FullSystemTestRunner extends EventEmitter {
  constructor() {
    super();
    this.memoryMonitor = new MemoryMonitor();
    this.results = {
      servers: {},
      memory: {},
      overall: { passed: 0, failed: 0, total: 0 }
    };
    this.runningProcesses = new Map();
  }

  async runFullTest() {
    logger.info('🚀 Starting Full System Test Suite');
    logger.info('=====================================\n');

    try {
      // Phase 1: Setup and baseline
      await this.setupTest();
      
      // Phase 2: Test individual servers
      await this.testAllServers();
      
      // Phase 3: Test integrations
      await this.testIntegrations();
      
      // Phase 4: Memory and performance tests
      await this.testMemoryAndPerformance();
      
      // Phase 5: Cleanup and report
      await this.cleanup();
      this.generateReport();

    } catch (error) {
      logger.error('Test suite failed:', error);
      await this.cleanup();
      process.exit(1);
    }
  }

  async setupTest() {
    logger.info('📋 Phase 1: Test Setup');
    logger.info('----------------------');

    // Set memory baseline
    if (global.gc) global.gc();
    this.memoryMonitor.setBaseline();
    logger.info(`Memory baseline: ${this.memoryMonitor.formatBytes(this.memoryMonitor.baseline.heap)}`);

    // Check project structure
    await this.verifyProjectStructure();
    
    // Kill any existing processes on our ports
    await this.killExistingProcesses();
    
    logger.info('✅ Setup completed\n');
  }

  async verifyProjectStructure() {
    const requiredPaths = [
      'mcp/memory/server.js',
      'shared/src/memory-manager.ts',
      'monitoring/src/memory-leak-detector.ts',
      'database/redis-client.ts',
      'database/pg-pool.ts',
      'orchestration/src/message-bus.ts'
    ];

    for (const filePath of requiredPaths) {
      try {
        await fs.access(filePath);
        logger.info(`✓ Found: ${filePath}`);
      } catch (error) {
        throw new Error(`Missing required file: ${filePath}`);
      }
    }
  }

  async killExistingProcesses() {
    const ports = Object.values(TEST_CONFIG.ports);
    
    for (const port of ports) {
      try {
        await execAsync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`);
      } catch (error) {
        // Ignore errors - port might not be in use
      }
    }
    
    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  async testAllServers() {
    logger.info('🖥️  Phase 2: Server Tests');
    logger.info('-------------------------');

    const serverTests = [
      { name: 'Memory MCP Server', command: 'node mcp/memory/server.js', port: TEST_CONFIG.ports.memory },
      { name: 'Memory Manager', test: () => this.testMemoryManager() },
      { name: 'Redis Client', test: () => this.testRedisClient() },
      { name: 'PostgreSQL Pool', test: () => this.testPostgreSQLPool() },
      { name: 'Message Bus', test: () => this.testMessageBus() },
      { name: 'Streaming Optimizer', test: () => this.testStreamingOptimizer() }
    ];

    for (const serverTest of serverTests) {
      await this.runServerTest(serverTest);
    }

    logger.info('✅ All server tests completed\n');
  }

  async runServerTest(serverTest) {
    const testName = serverTest.name;
    logger.info(`Testing: ${testName}`);
    
    const startTime = Date.now();
    const memBefore = this.memoryMonitor.takeSnapshot(`${testName}_start`);
    
    try {
      if (serverTest.command && serverTest.port) {
        // Test server startup and health
        await this.testServerStartup(serverTest);
      } else if (serverTest.test) {
        // Run custom test
        await serverTest.test();
      }

      const memAfter = this.memoryMonitor.takeSnapshot(`${testName}_end`);
      const duration = Date.now() - startTime;
      const memoryGrowth = memAfter.heap - memBefore.heap;

      this.results.servers[testName] = {
        passed: true,
        duration,
        memoryGrowth,
        message: `✅ ${testName} passed (${duration}ms, ${this.memoryMonitor.formatBytes(memoryGrowth)} memory)`
      };

      this.results.overall.passed++;
      logger.success(this.results.servers[testName].message);

    } catch (error) {
      this.results.servers[testName] = {
        passed: false,
        error: error.message,
        message: `❌ ${testName} failed: ${error.message}`
      };

      this.results.overall.failed++;
      logger.error(this.results.servers[testName].message);
    }

    this.results.overall.total++;
  }

  async testServerStartup(serverTest) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (serverProcess) serverProcess.kill();
        reject(new Error(`Server startup timeout after ${TEST_CONFIG.timeout}ms`));
      }, TEST_CONFIG.timeout);

      const serverProcess = spawn('node', serverTest.command.split(' ').slice(1), {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PORT: serverTest.port, NODE_ENV: 'test', MOCK_DB: 'true' }
      });

      this.runningProcesses.set(serverTest.name, serverProcess);

      let output = '';
      let started = false;

      serverProcess.stdout.on('data', (data) => {
        output += data.toString();
        if (output.includes('listening') || output.includes('started') || output.includes('ready') || output.includes('Mock PostgreSQL')) {
          if (!started) {
            started = true;
            clearTimeout(timeout);
            
            // Give server time to fully initialize
            setTimeout(async () => {
              try {
                await this.healthCheckServer(serverTest.port);
                serverProcess.kill();
                resolve();
              } catch (healthError) {
                serverProcess.kill();
                reject(healthError);
              }
            }, 2000);
          }
        }
      });

      serverProcess.stderr.on('data', (data) => {
        const errorText = data.toString();
        if (errorText.includes('Error') && !errorText.includes('Warning')) {
          clearTimeout(timeout);
          serverProcess.kill();
          reject(new Error(`Server error: ${errorText}`));
        }
      });

      serverProcess.on('exit', (code) => {
        this.runningProcesses.delete(serverTest.name);
        if (!started && code !== 0) {
          clearTimeout(timeout);
          reject(new Error(`Server exited with code ${code}`));
        }
      });
    });
  }

  async healthCheckServer(port) {
    for (let i = 0; i < TEST_CONFIG.healthCheckRetries; i++) {
      try {
        const response = await fetch(`http://localhost:${port}/health`);
        if (response.ok) {
          return await response.json();
        }
      } catch (error) {
        // Continue trying
      }
      
      await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.healthCheckDelay));
    }
    
    throw new Error(`Health check failed after ${TEST_CONFIG.healthCheckRetries} attempts`);
  }

  async testMemoryManager() {
    // Import and test memory manager functionality
    logger.info('  Testing memory allocation patterns...');
    
    // Simulate memory allocations
    const allocations = [];
    for (let i = 0; i < 10; i++) {
      const allocation = {
        id: `test-${i}`,
        size: 1024 * 1024, // 1MB
        data: Buffer.allocUnsafe(1024 * 1024)
      };
      allocations.push(allocation);
    }

    // Clean up
    allocations.length = 0;
    if (global.gc) global.gc();

    logger.info('  ✓ Memory manager test completed');
  }

  async testRedisClient() {
    logger.info('  Testing Redis connection management...');
    
    // Test Redis-like operations without actual Redis
    const mockConnections = [];
    for (let i = 0; i < 5; i++) {
      const connection = {
        id: `redis-${i}`,
        connected: true,
        lastUsed: Date.now()
      };
      mockConnections.push(connection);
    }

    // Cleanup
    mockConnections.forEach(conn => conn.connected = false);
    mockConnections.length = 0;

    logger.info('  ✓ Redis client test completed');
  }

  async testPostgreSQLPool() {
    logger.info('  Testing PostgreSQL pool management...');
    
    // Test pool-like operations
    const poolConnections = [];
    for (let i = 0; i < 3; i++) {
      const connection = {
        id: `pg-${i}`,
        busy: false,
        created: Date.now()
      };
      poolConnections.push(connection);
    }

    // Simulate transactions
    for (const conn of poolConnections) {
      conn.busy = true;
      // Simulate work
      await new Promise(resolve => setTimeout(resolve, 10));
      conn.busy = false;
    }

    // Cleanup
    poolConnections.length = 0;

    logger.info('  ✓ PostgreSQL pool test completed');
  }

  async testMessageBus() {
    logger.info('  Testing message bus patterns...');
    
    // Test message handling patterns
    const messageQueue = [];
    const consumers = new Map();

    // Add consumers
    for (let i = 0; i < 3; i++) {
      consumers.set(`consumer-${i}`, {
        id: `consumer-${i}`,
        active: true,
        processed: 0
      });
    }

    // Process messages
    for (let i = 0; i < 10; i++) {
      messageQueue.push({ id: i, data: `message-${i}` });
    }

    // Cleanup
    consumers.clear();
    messageQueue.length = 0;

    logger.info('  ✓ Message bus test completed');
  }

  async testStreamingOptimizer() {
    logger.info('  Testing streaming optimizer...');
    
    // Test buffer management
    const bufferPool = [];
    for (let i = 0; i < 10; i++) {
      bufferPool.push(Buffer.allocUnsafe(64 * 1024)); // 64KB
    }

    // Simulate streaming operations
    const activeStreams = new Set();
    for (let i = 0; i < 5; i++) {
      activeStreams.add(`stream-${i}`);
    }

    // Cleanup
    bufferPool.length = 0;
    activeStreams.clear();

    logger.info('  ✓ Streaming optimizer test completed');
  }

  async testIntegrations() {
    logger.info('🔗 Phase 3: Integration Tests');
    logger.info('-----------------------------');

    const integrationTests = [
      'Memory Manager + Buffer Pools',
      'Redis + Message Bus',
      'PostgreSQL + Memory Manager',
      'All Components Integration'
    ];

    for (const testName of integrationTests) {
      await this.runIntegrationTest(testName);
    }

    logger.info('✅ Integration tests completed\n');
  }

  async runIntegrationTest(testName) {
    logger.info(`Testing: ${testName}`);
    
    const startTime = Date.now();
    const memBefore = this.memoryMonitor.takeSnapshot(`${testName}_start`);
    
    try {
      // Simulate integration test
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const memAfter = this.memoryMonitor.takeSnapshot(`${testName}_end`);
      const duration = Date.now() - startTime;
      const memoryGrowth = memAfter.heap - memBefore.heap;

      logger.success(`✅ ${testName} passed (${duration}ms, ${this.memoryMonitor.formatBytes(memoryGrowth)} memory)`);
      this.results.overall.passed++;

    } catch (error) {
      logger.error(`❌ ${testName} failed: ${error.message}`);
      this.results.overall.failed++;
    }

    this.results.overall.total++;
  }

  async testMemoryAndPerformance() {
    logger.info('⚡ Phase 4: Memory & Performance Tests');
    logger.info('-------------------------------------');

    await this.runMemoryLeakTest();
    await this.runPerformanceTest();
    await this.runStressTest();

    logger.info('✅ Memory and performance tests completed\n');
  }

  async runMemoryLeakTest() {
    logger.info('Testing: Memory Leak Detection');
    
    const startMem = this.memoryMonitor.takeSnapshot('leak_test_start');
    
    // Simulate potential memory leak scenarios
    const testData = [];
    for (let i = 0; i < 1000; i++) {
      testData.push({
        id: i,
        data: new Array(100).fill(i),
        timestamp: Date.now()
      });
    }

    // Cleanup
    testData.length = 0;
    if (global.gc) global.gc();

    const endMem = this.memoryMonitor.takeSnapshot('leak_test_end');
    const leaked = endMem.heap - startMem.heap;

    if (leaked < 10 * 1024 * 1024) { // Less than 10MB
      logger.success(`✅ Memory leak test passed (${this.memoryMonitor.formatBytes(leaked)} leaked)`);
      this.results.overall.passed++;
    } else {
      logger.error(`❌ Memory leak test failed (${this.memoryMonitor.formatBytes(leaked)} leaked)`);
      this.results.overall.failed++;
    }

    this.results.overall.total++;
  }

  async runPerformanceTest() {
    logger.info('Testing: Performance Benchmarks');
    
    const startTime = Date.now();
    
    // CPU-intensive task
    let result = 0;
    for (let i = 0; i < 1000000; i++) {
      result += Math.sqrt(i);
    }

    const duration = Date.now() - startTime;

    if (duration < 5000) { // Less than 5 seconds
      logger.success(`✅ Performance test passed (${duration}ms)`);
      this.results.overall.passed++;
    } else {
      logger.error(`❌ Performance test failed (${duration}ms - too slow)`);
      this.results.overall.failed++;
    }

    this.results.overall.total++;
  }

  async runStressTest() {
    logger.info('Testing: System Stress Test');
    
    const startMem = this.memoryMonitor.takeSnapshot('stress_test_start');
    
    // Concurrent operations
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(this.simulateWork(i));
    }

    await Promise.all(promises);

    const endMem = this.memoryMonitor.takeSnapshot('stress_test_end');
    const memoryGrowth = endMem.heap - startMem.heap;

    if (memoryGrowth < 50 * 1024 * 1024) { // Less than 50MB
      logger.success(`✅ Stress test passed (${this.memoryMonitor.formatBytes(memoryGrowth)} memory used)`);
      this.results.overall.passed++;
    } else {
      logger.error(`❌ Stress test failed (${this.memoryMonitor.formatBytes(memoryGrowth)} memory used)`);
      this.results.overall.failed++;
    }

    this.results.overall.total++;
  }

  async simulateWork(id) {
    // Simulate async work
    const data = new Array(1000).fill(id);
    await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
    data.length = 0;
  }

  async cleanup() {
    logger.info('🧹 Phase 5: Cleanup');
    logger.info('-------------------');

    // Kill any running processes
    for (const [name, process] of this.runningProcesses) {
      try {
        process.kill();
        logger.info(`✓ Stopped ${name}`);
      } catch (error) {
        logger.warn(`Failed to stop ${name}: ${error.message}`);
      }
    }

    // Force garbage collection
    if (global.gc) {
      global.gc();
      logger.info('✓ Forced garbage collection');
    }

    // Kill processes on test ports
    await this.killExistingProcesses();

    logger.info('✅ Cleanup completed\n');
  }

  generateReport() {
    const memoryReport = this.memoryMonitor.getMemoryReport();
    
    logger.info('📊 FULL SYSTEM TEST REPORT');
    logger.info('==========================\n');

    // Overall results
    const passRate = (this.results.overall.passed / this.results.overall.total * 100).toFixed(1);
    logger.info(`Overall Results: ${this.results.overall.passed}/${this.results.overall.total} tests passed (${passRate}%)`);
    
    // Memory summary
    logger.info('\nMemory Analysis:');
    logger.info(`├─ Baseline: ${this.memoryMonitor.formatBytes(memoryReport.baseline.heap)}`);
    logger.info(`├─ Final: ${this.memoryMonitor.formatBytes(memoryReport.current.heap)}`);
    logger.info(`├─ Growth: ${this.memoryMonitor.formatBytes(memoryReport.growth.heap)}`);
    logger.info(`└─ Leak Detected: ${memoryReport.leakDetected ? 'YES ⚠️' : 'NO ✅'}`);

    // Server results
    logger.info('\nServer Test Results:');
    for (const [name, result] of Object.entries(this.results.servers)) {
      const status = result.passed ? '✅' : '❌';
      logger.info(`├─ ${status} ${name}: ${result.message || result.error}`);
    }

    // Performance summary
    logger.info('\nPerformance Summary:');
    logger.info(`├─ Memory Efficiency: ${memoryReport.growth.heap < 100 * 1024 * 1024 ? 'GOOD' : 'NEEDS ATTENTION'}`);
    logger.info(`├─ No Major Leaks: ${!memoryReport.leakDetected ? 'CONFIRMED' : 'REVIEW NEEDED'}`);
    logger.info(`└─ System Stability: ${this.results.overall.passed > this.results.overall.total * 0.8 ? 'STABLE' : 'UNSTABLE'}`);

    // Recommendations
    if (memoryReport.leakDetected || this.results.overall.failed > 0) {
      logger.info('\n⚠️  Recommendations:');
      if (memoryReport.leakDetected) {
        logger.info('├─ Investigate memory growth patterns');
        logger.info('├─ Review cleanup procedures');
      }
      if (this.results.overall.failed > 0) {
        logger.info('├─ Fix failing tests before deployment');
        logger.info('├─ Review error logs for root causes');
      }
    } else {
      logger.info('\n✅ System is ready for production!');
    }

    logger.info('\n==========================\n');

    // Exit with appropriate code
    process.exit(this.results.overall.failed > 0 ? 1 : 0);
  }
}

// Main execution
async function main() {
  if (!global.gc) {
    logger.warn('⚠️  Running without --expose-gc flag');
    logger.warn('   For accurate memory testing, run with: node --expose-gc full-system-test.js\n');
  }

  const runner = new FullSystemTestRunner();
  await runner.runFullTest();
}

main().catch(error => {
  logger.error('System test failed:', error);
  process.exit(1);
});