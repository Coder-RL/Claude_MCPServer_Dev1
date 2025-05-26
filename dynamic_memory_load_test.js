#!/usr/bin/env node

/**
 * Dynamic Memory Load Test for MCP Servers
 * Tests memory efficiency under various load conditions
 */

import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

// Test Configuration
const TEST_CONFIG = {
  duration: 300000, // 5 minutes per test
  concurrentClients: 10,
  requestsPerClient: 100,
  dataPayloadSizes: [1024, 10240, 102400], // 1KB, 10KB, 100KB
  memoryCheckInterval: 1000, // 1 second
  gcTriggerInterval: 10000, // 10 seconds
  maxMemoryThreshold: 500 * 1024 * 1024, // 500MB
  servers: [
    'data-governance',
    'data-pipeline', 
    'data-warehouse',
    'enhanced-memory',
    'ml-deployment',
    'optimization',
    'realtime-analytics',
    'security-vulnerability',
    'sequential-thinking',
    'ui-design'
  ]
};

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
      external: usage.external,
      arrayBuffers: usage.arrayBuffers
    };
  }

  static async getProcessMemory(pid) {
    return new Promise((resolve, reject) => {
      const ps = spawn('ps', ['-o', 'pid,rss,vsz', '-p', pid]);
      let output = '';
      
      ps.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      ps.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ps command failed with code ${code}`));
          return;
        }
        
        const lines = output.trim().split('\n');
        if (lines.length < 2) {
          reject(new Error('No process data found'));
          return;
        }
        
        const parts = lines[1].trim().split(/\s+/);
        resolve({
          pid: parseInt(parts[0]),
          rss: parseInt(parts[1]) * 1024, // Convert KB to bytes
          vsz: parseInt(parts[2]) * 1024  // Convert KB to bytes
        });
      });
      
      ps.on('error', reject);
    });
  }
}

class MCPServerMonitor extends EventEmitter {
  constructor(serverName) {
    super();
    this.serverName = serverName;
    this.pid = null;
    this.isMonitoring = false;
    this.metrics = [];
    this.alerts = [];
    this.startTime = null;
  }

  async start() {
    // Get PID from PM2
    try {
      const pm2List = await this.execCommand('pm2 jlist');
      const processes = JSON.parse(pm2List);
      const serverProcess = processes.find(p => p.name === this.serverName);
      
      if (!serverProcess || !serverProcess.pid) {
        throw new Error(`Server ${this.serverName} not found or not running`);
      }
      
      this.pid = serverProcess.pid;
      this.startTime = Date.now();
      this.isMonitoring = true;
      
      console.log(`📊 Starting memory monitoring for ${this.serverName} (PID: ${this.pid})`);
      
      // Start monitoring
      this.monitoringInterval = setInterval(() => {
        this.collectMetrics();
      }, TEST_CONFIG.memoryCheckInterval);
      
    } catch (error) {
      console.error(`❌ Failed to start monitoring ${this.serverName}:`, error.message);
      throw error;
    }
  }

  async collectMetrics() {
    if (!this.isMonitoring || !this.pid) return;

    try {
      const processMemory = await MemoryUtils.getProcessMemory(this.pid);
      const timestamp = Date.now();
      
      const metric = {
        timestamp,
        server: this.serverName,
        pid: this.pid,
        memory: {
          rss: processMemory.rss,
          vsz: processMemory.vsz,
          heapPercent: (processMemory.rss / processMemory.vsz) * 100
        },
        uptime: timestamp - this.startTime
      };
      
      this.metrics.push(metric);
      
      // Check for memory issues
      this.checkMemoryAlerts(metric);
      
      // Emit metric
      this.emit('metric', metric);
      
      // Trim old metrics (keep last 1000)
      if (this.metrics.length > 1000) {
        this.metrics.shift();
      }
      
    } catch (error) {
      console.error(`❌ Failed to collect metrics for ${this.serverName}:`, error.message);
    }
  }

  checkMemoryAlerts(metric) {
    const { memory } = metric;
    
    // High memory usage alert
    if (memory.rss > TEST_CONFIG.maxMemoryThreshold) {
      this.alerts.push({
        timestamp: metric.timestamp,
        type: 'high_memory',
        severity: 'critical',
        message: `High memory usage: ${MemoryUtils.formatBytes(memory.rss)}`,
        data: memory
      });
      
      console.warn(`⚠️  ${this.serverName}: High memory usage - ${MemoryUtils.formatBytes(memory.rss)}`);
    }
    
    // Memory growth rate alert
    if (this.metrics.length >= 10) {
      const recent = this.metrics.slice(-10);
      const growthRate = this.calculateMemoryGrowthRate(recent);
      
      if (growthRate > 10 * 1024 * 1024) { // 10MB per minute
        this.alerts.push({
          timestamp: metric.timestamp,
          type: 'memory_growth',
          severity: 'warning',
          message: `Rapid memory growth: ${MemoryUtils.formatBytes(growthRate)}/min`,
          data: { growthRate, recentMetrics: recent.length }
        });
        
        console.warn(`⚠️  ${this.serverName}: Rapid memory growth - ${MemoryUtils.formatBytes(growthRate)}/min`);
      }
    }
  }

  calculateMemoryGrowthRate(metrics) {
    if (metrics.length < 2) return 0;
    
    const first = metrics[0];
    const last = metrics[metrics.length - 1];
    const timeDiff = (last.timestamp - first.timestamp) / 1000 / 60; // minutes
    const memoryDiff = last.memory.rss - first.memory.rss;
    
    return timeDiff > 0 ? memoryDiff / timeDiff : 0;
  }

  stop() {
    this.isMonitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    console.log(`📊 Stopped monitoring ${this.serverName}`);
  }

  getReport() {
    if (this.metrics.length === 0) {
      return {
        server: this.serverName,
        status: 'no_data',
        message: 'No metrics collected'
      };
    }
    
    const metrics = this.metrics;
    const memoryValues = metrics.map(m => m.memory.rss);
    
    const report = {
      server: this.serverName,
      pid: this.pid,
      monitoring: {
        duration: Date.now() - this.startTime,
        samples: metrics.length,
        interval: TEST_CONFIG.memoryCheckInterval
      },
      memory: {
        initial: MemoryUtils.formatBytes(memoryValues[0]),
        final: MemoryUtils.formatBytes(memoryValues[memoryValues.length - 1]),
        peak: MemoryUtils.formatBytes(Math.max(...memoryValues)),
        average: MemoryUtils.formatBytes(memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length),
        growth: MemoryUtils.formatBytes(memoryValues[memoryValues.length - 1] - memoryValues[0]),
        stability: this.calculateMemoryStability(memoryValues)
      },
      alerts: {
        total: this.alerts.length,
        critical: this.alerts.filter(a => a.severity === 'critical').length,
        warnings: this.alerts.filter(a => a.severity === 'warning').length,
        details: this.alerts
      },
      efficiency: {
        score: this.calculateEfficiencyScore(),
        rating: this.getEfficiencyRating()
      }
    };
    
    return report;
  }

  calculateMemoryStability(values) {
    if (values.length < 2) return 1;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = mean > 0 ? stdDev / mean : 0;
    
    // Higher stability = lower coefficient of variation
    return Math.max(0, 1 - coefficientOfVariation);
  }

  calculateEfficiencyScore() {
    if (this.metrics.length === 0) return 0;
    
    const memoryValues = this.metrics.map(m => m.memory.rss);
    const stability = this.calculateMemoryStability(memoryValues);
    const growth = memoryValues[memoryValues.length - 1] - memoryValues[0];
    const maxMemory = Math.max(...memoryValues);
    
    // Factors: stability (40%), low growth (30%), reasonable peak (30%)
    const stabilityScore = stability * 0.4;
    const growthScore = Math.max(0, 1 - (growth / (100 * 1024 * 1024))) * 0.3; // Penalize growth > 100MB
    const peakScore = Math.max(0, 1 - (maxMemory / TEST_CONFIG.maxMemoryThreshold)) * 0.3;
    
    return Math.min(1, stabilityScore + growthScore + peakScore);
  }

  getEfficiencyRating() {
    const score = this.calculateEfficiencyScore();
    
    if (score >= 0.9) return 'Excellent';
    if (score >= 0.8) return 'Good';
    if (score >= 0.7) return 'Fair';
    if (score >= 0.6) return 'Poor';
    return 'Critical';
  }

  async execCommand(command) {
    return new Promise((resolve, reject) => {
      const child = spawn('sh', ['-c', command]);
      let output = '';
      let error = '';
      
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        error += data.toString();
      });
      
      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Command failed: ${error}`));
        } else {
          resolve(output.trim());
        }
      });
    });
  }
}

class LoadTester extends EventEmitter {
  constructor() {
    super();
    this.monitors = new Map();
    this.testResults = [];
    this.isRunning = false;
  }

  async runDynamicLoadTest() {
    console.log('🚀 Starting Dynamic Memory Load Test for MCP Servers');
    console.log('===================================================\n');
    
    this.isRunning = true;
    
    try {
      // Initialize monitors for each server
      for (const serverName of TEST_CONFIG.servers) {
        const monitor = new MCPServerMonitor(serverName);
        this.monitors.set(serverName, monitor);
        
        monitor.on('metric', (metric) => {
          this.handleMetric(metric);
        });
      }
      
      // Start monitoring all servers
      console.log('📊 Starting baseline monitoring...\n');
      for (const [serverName, monitor] of this.monitors) {
        try {
          await monitor.start();
        } catch (error) {
          console.error(`Failed to start monitoring ${serverName}:`, error.message);
        }
      }
      
      // Wait for baseline
      console.log('⏱️  Collecting baseline metrics (30 seconds)...\n');
      await this.sleep(30000);
      
      // Run load tests
      await this.runLoadTestPhases();
      
      // Final monitoring period
      console.log('📊 Final monitoring period (30 seconds)...\n');
      await this.sleep(30000);
      
      // Generate reports
      await this.generateFinalReport();
      
    } catch (error) {
      console.error('❌ Load test failed:', error);
    } finally {
      this.cleanup();
    }
  }

  async runLoadTestPhases() {
    const phases = [
      {
        name: 'Light Load',
        clients: 3,
        requests: 50,
        payloadSize: 1024,
        duration: 60000
      },
      {
        name: 'Medium Load', 
        clients: 7,
        requests: 100,
        payloadSize: 10240,
        duration: 90000
      },
      {
        name: 'Heavy Load',
        clients: 15,
        requests: 200,
        payloadSize: 102400,
        duration: 120000
      }
    ];
    
    for (const phase of phases) {
      console.log(`🔥 Running ${phase.name} Phase`);
      console.log(`   Clients: ${phase.clients}, Requests: ${phase.requests}, Payload: ${MemoryUtils.formatBytes(phase.payloadSize)}`);
      console.log(`   Duration: ${phase.duration / 1000}s\n`);
      
      await this.simulateLoad(phase);
      
      // Recovery period
      console.log('😌 Recovery period (30 seconds)...\n');
      await this.sleep(30000);
      
      // Force GC on all processes
      await this.triggerGarbageCollection();
    }
  }

  async simulateLoad(phase) {
    const promises = [];
    
    // Simulate concurrent clients
    for (let i = 0; i < phase.clients; i++) {
      promises.push(this.simulateClient(i, phase));
    }
    
    // Run for specified duration
    const timeoutPromise = this.sleep(phase.duration);
    
    await Promise.race([
      Promise.all(promises),
      timeoutPromise
    ]);
  }

  async simulateClient(clientId, phase) {
    const startTime = Date.now();
    let requests = 0;
    
    while (Date.now() - startTime < phase.duration && requests < phase.requests) {
      try {
        // Simulate memory allocation
        const data = Buffer.alloc(phase.payloadSize, clientId);
        
        // Simulate processing
        const result = await this.processData(data);
        
        // Simulate variable delay
        await this.sleep(Math.random() * 100 + 50);
        
        requests++;
        
      } catch (error) {
        console.error(`Client ${clientId} error:`, error.message);
      }
    }
    
    console.log(`   Client ${clientId}: Completed ${requests} requests`);
  }

  async processData(data) {
    // Simulate data processing that might cause memory pressure
    const processed = [];
    
    // Create temporary objects
    for (let i = 0; i < 10; i++) {
      processed.push({
        id: i,
        data: data.slice(0, Math.min(data.length, 1024)),
        timestamp: Date.now(),
        metadata: {
          processed: true,
          size: data.length,
          checksum: data.reduce((a, b) => a + b, 0) % 1000
        }
      });
    }
    
    // Simulate async operation
    await this.sleep(Math.random() * 10);
    
    return processed.length;
  }

  async triggerGarbageCollection() {
    console.log('🧹 Triggering garbage collection...\n');
    
    // Try to trigger GC in current process
    MemoryUtils.forceGC();
    
    // Signal servers to clean up (if they support it)
    try {
      for (const serverName of TEST_CONFIG.servers) {
        await this.execCommand(`pm2 trigger ${serverName} gc 2>/dev/null || true`);
      }
    } catch (error) {
      // Ignore errors - not all servers may support GC triggers
    }
    
    await this.sleep(5000); // Wait for GC to complete
  }

  handleMetric(metric) {
    // Real-time monitoring feedback
    if (metric.memory.rss > TEST_CONFIG.maxMemoryThreshold * 0.8) {
      console.log(`⚠️  ${metric.server}: High memory usage - ${MemoryUtils.formatBytes(metric.memory.rss)}`);
    }
  }

  async generateFinalReport() {
    console.log('\n🔍 Generating Memory Efficiency Report...\n');
    console.log('=' .repeat(80));
    console.log('              DYNAMIC MEMORY LOAD TEST RESULTS');
    console.log('=' .repeat(80));
    
    const reports = [];
    
    for (const [serverName, monitor] of this.monitors) {
      const report = monitor.getReport();
      reports.push(report);
      
      console.log(`\n📊 ${serverName.toUpperCase()}`);
      console.log('-' .repeat(50));
      
      if (report.status === 'no_data') {
        console.log('❌ No data collected');
        continue;
      }
      
      console.log(`Memory Usage:`);
      console.log(`  Initial:    ${report.memory.initial}`);
      console.log(`  Final:      ${report.memory.final}`);
      console.log(`  Peak:       ${report.memory.peak}`);
      console.log(`  Average:    ${report.memory.average}`);
      console.log(`  Growth:     ${report.memory.growth}`);
      console.log(`  Stability:  ${(report.memory.stability * 100).toFixed(1)}%`);
      
      console.log(`\nEfficiency:`);
      console.log(`  Score:      ${(report.efficiency.score * 100).toFixed(1)}%`);
      console.log(`  Rating:     ${report.efficiency.rating}`);
      
      console.log(`\nAlerts:`);
      console.log(`  Total:      ${report.alerts.total}`);
      console.log(`  Critical:   ${report.alerts.critical}`);
      console.log(`  Warnings:   ${report.alerts.warnings}`);
      
      if (report.alerts.critical > 0) {
        console.log(`\n  🚨 Critical Issues:`);
        report.alerts.details
          .filter(a => a.severity === 'critical')
          .forEach(alert => {
            console.log(`     ${new Date(alert.timestamp).toISOString()}: ${alert.message}`);
          });
      }
    }
    
    // Overall summary
    console.log('\n' + '=' .repeat(80));
    console.log('                          SUMMARY');
    console.log('=' .repeat(80));
    
    const validReports = reports.filter(r => r.status !== 'no_data');
    const avgScore = validReports.reduce((sum, r) => sum + r.efficiency.score, 0) / validReports.length;
    const totalAlerts = validReports.reduce((sum, r) => sum + r.alerts.total, 0);
    const criticalAlerts = validReports.reduce((sum, r) => sum + r.alerts.critical, 0);
    
    console.log(`\nOverall Performance:`);
    console.log(`  Servers Tested:     ${validReports.length}/${TEST_CONFIG.servers.length}`);
    console.log(`  Average Score:      ${(avgScore * 100).toFixed(1)}%`);
    console.log(`  Total Alerts:       ${totalAlerts}`);
    console.log(`  Critical Issues:    ${criticalAlerts}`);
    console.log(`  Test Duration:      ${Math.round((Date.now() - this.testStartTime) / 1000 / 60)} minutes`);
    
    // Recommendations
    console.log(`\n📋 Recommendations:`);
    
    if (avgScore >= 0.9) {
      console.log(`✅ Excellent memory efficiency across all servers`);
      console.log(`   All servers are operating within optimal parameters`);
    } else if (avgScore >= 0.8) {
      console.log(`✅ Good memory efficiency overall`);
      console.log(`   Consider minor optimizations for peak performance`);
    } else if (avgScore >= 0.7) {
      console.log(`⚠️  Fair memory efficiency`);
      console.log(`   Some servers may benefit from memory optimization`);
    } else {
      console.log(`❌ Poor memory efficiency detected`);
      console.log(`   Immediate attention required for memory management`);
    }
    
    if (criticalAlerts > 0) {
      console.log(`🚨 Address ${criticalAlerts} critical memory issues immediately`);
    }
    
    // Save detailed report
    const detailedReport = {
      timestamp: new Date().toISOString(),
      config: TEST_CONFIG,
      duration: Date.now() - this.testStartTime,
      summary: {
        serverseTested: validReports.length,
        averageScore: avgScore,
        totalAlerts,
        criticalAlerts
      },
      servers: reports
    };
    
    const reportFile = `memory_load_test_${Date.now()}.json`;
    fs.writeFileSync(reportFile, JSON.stringify(detailedReport, null, 2));
    console.log(`\n💾 Detailed report saved: ${reportFile}`);
    
    console.log('\n' + '=' .repeat(80));
  }

  cleanup() {
    this.isRunning = false;
    
    for (const [serverName, monitor] of this.monitors) {
      monitor.stop();
    }
    
    this.monitors.clear();
    console.log('\n🧹 Cleanup completed');
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async execCommand(command) {
    return new Promise((resolve, reject) => {
      const child = spawn('sh', ['-c', command]);
      let output = '';
      let error = '';
      
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        error += data.toString();
      });
      
      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Command failed: ${error}`));
        } else {
          resolve(output.trim());
        }
      });
    });
  }
}

// Main execution
async function main() {
  console.log('🔧 Dynamic Memory Load Test for MCP Servers');
  console.log('============================================\n');
  
  if (!global.gc) {
    console.warn('⚠️  Running without --expose-gc flag');
    console.warn('   For accurate GC measurements, run with: node --expose-gc dynamic_memory_load_test.js\n');
  }
  
  const tester = new LoadTester();
  tester.testStartTime = Date.now();
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n⏹️  Shutting down gracefully...');
    tester.cleanup();
    process.exit(0);
  });
  
  try {
    await tester.runDynamicLoadTest();
    console.log('\n✅ Memory load test completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Memory load test failed:', error);
    tester.cleanup();
    process.exit(1);
  }
}

main().catch(console.error);