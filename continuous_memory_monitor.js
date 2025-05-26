#!/usr/bin/env node

/**
 * Continuous Memory Monitor for MCP Servers
 * Real-time monitoring of memory usage patterns and trends
 */

import { spawn } from 'child_process';
import fs from 'fs';

const MONITOR_CONFIG = {
  interval: 5000, // 5 seconds
  duration: 300000, // 5 minutes
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
  ],
  thresholds: {
    memoryGrowth: 10 * 1024 * 1024, // 10MB per minute
    highMemory: 200 * 1024 * 1024,  // 200MB
    instability: 0.1 // 10% coefficient of variation
  }
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

  static calculateStats(values) {
    if (values.length === 0) return { mean: 0, std: 0, cv: 0, trend: 0 };
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);
    const cv = mean > 0 ? std / mean : 0;
    
    // Calculate linear trend
    const n = values.length;
    const x = Array.from({length: n}, (_, i) => i);
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((acc, xi, i) => acc + xi * values[i], 0);
    const sumXX = x.reduce((acc, xi) => acc + xi * xi, 0);
    
    const trend = n > 1 ? (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX) : 0;
    
    return { mean, std, cv, trend };
  }
}

class ContinuousMemoryMonitor {
  constructor() {
    this.isRunning = false;
    this.monitoringData = new Map();
    this.startTime = null;
    this.alertCount = 0;
  }

  async start() {
    console.log('🔄 Starting Continuous Memory Monitor');
    console.log('=====================================\n');
    
    this.isRunning = true;
    this.startTime = Date.now();
    
    // Initialize monitoring data for each server
    for (const server of MONITOR_CONFIG.servers) {
      this.monitoringData.set(server, {
        samples: [],
        alerts: [],
        pid: null
      });
    }
    
    // Get PIDs
    await this.initializeServerPids();
    
    // Start monitoring loop
    await this.monitoringLoop();
  }

  async initializeServerPids() {
    try {
      const pm2List = await this.execCommand('pm2 jlist');
      const processes = JSON.parse(pm2List);
      
      for (const server of MONITOR_CONFIG.servers) {
        const process = processes.find(p => p.name === server);
        if (process && process.pid) {
          const data = this.monitoringData.get(server);
          data.pid = process.pid;
          console.log(`📍 ${server}: PID ${process.pid}`);
        } else {
          console.warn(`⚠️  ${server}: Not running`);
        }
      }
      console.log('');
    } catch (error) {
      console.error('❌ Failed to get server PIDs:', error.message);
    }
  }

  async monitoringLoop() {
    const totalIterations = Math.ceil(MONITOR_CONFIG.duration / MONITOR_CONFIG.interval);
    let iteration = 0;
    
    console.log(`🕐 Monitoring for ${MONITOR_CONFIG.duration / 1000} seconds (${totalIterations} samples)`);
    console.log(`   Interval: ${MONITOR_CONFIG.interval / 1000}s\n`);
    
    const interval = setInterval(async () => {
      iteration++;
      
      if (!this.isRunning || iteration > totalIterations) {
        clearInterval(interval);
        await this.generateReport();
        return;
      }
      
      await this.collectAllMetrics();
      await this.analyzePatterns();
      
      // Progress indicator
      if (iteration % 10 === 0) {
        const progress = (iteration / totalIterations * 100).toFixed(1);
        const elapsed = Math.round((Date.now() - this.startTime) / 1000);
        console.log(`📊 Progress: ${progress}% (${elapsed}s elapsed, ${this.alertCount} alerts)`);
      }
      
    }, MONITOR_CONFIG.interval);
  }

  async collectAllMetrics() {
    const timestamp = Date.now();
    
    for (const [server, data] of this.monitoringData) {
      if (!data.pid) continue;
      
      try {
        const memory = await this.getProcessMemory(data.pid);
        const sample = {
          timestamp,
          rss: memory.rss,
          vsz: memory.vsz,
          uptime: timestamp - this.startTime
        };
        
        data.samples.push(sample);
        
        // Keep only recent samples (last 100)
        if (data.samples.length > 100) {
          data.samples.shift();
        }
        
      } catch (error) {
        console.error(`❌ Failed to collect metrics for ${server}:`, error.message);
      }
    }
  }

  async analyzePatterns() {
    for (const [server, data] of this.monitoringData) {
      if (data.samples.length < 10) continue; // Need minimum samples
      
      const recentSamples = data.samples.slice(-10); // Last 10 samples
      const memoryValues = recentSamples.map(s => s.rss);
      const stats = MemoryUtils.calculateStats(memoryValues);
      
      // Check for alerts
      await this.checkMemoryAlerts(server, data, stats, recentSamples);
    }
  }

  async checkMemoryAlerts(server, data, stats, samples) {
    const latest = samples[samples.length - 1];
    const alerts = [];
    
    // High memory usage
    if (latest.rss > MONITOR_CONFIG.thresholds.highMemory) {
      alerts.push({
        type: 'high_memory',
        severity: 'warning',
        message: `High memory usage: ${MemoryUtils.formatBytes(latest.rss)}`,
        timestamp: latest.timestamp,
        value: latest.rss
      });
    }
    
    // Rapid memory growth
    if (samples.length >= 5) {
      const growthRate = stats.trend * (60000 / MONITOR_CONFIG.interval); // Per minute
      if (growthRate > MONITOR_CONFIG.thresholds.memoryGrowth) {
        alerts.push({
          type: 'rapid_growth',
          severity: 'critical',
          message: `Rapid memory growth: ${MemoryUtils.formatBytes(growthRate)}/min`,
          timestamp: latest.timestamp,
          value: growthRate
        });
      }
    }
    
    // Memory instability
    if (stats.cv > MONITOR_CONFIG.thresholds.instability) {
      alerts.push({
        type: 'instability',
        severity: 'warning',
        message: `Memory instability detected: CV ${(stats.cv * 100).toFixed(1)}%`,
        timestamp: latest.timestamp,
        value: stats.cv
      });
    }
    
    // Log new alerts
    for (const alert of alerts) {
      const existingAlert = data.alerts.find(a => 
        a.type === alert.type && 
        latest.timestamp - a.timestamp < 60000 // Don't repeat within 1 minute
      );
      
      if (!existingAlert) {
        data.alerts.push(alert);
        this.alertCount++;
        console.log(`🚨 ${server}: ${alert.message}`);
      }
    }
  }

  async generateReport() {
    console.log('\n🔍 Generating Continuous Memory Monitoring Report');
    console.log('=' .repeat(60));
    
    const totalDuration = Date.now() - this.startTime;
    let totalSamples = 0;
    let serversAnalyzed = 0;
    
    for (const [server, data] of this.monitoringData) {
      if (data.samples.length === 0) continue;
      
      serversAnalyzed++;
      totalSamples += data.samples.length;
      
      console.log(`\n📊 ${server.toUpperCase()}`);
      console.log('-' .repeat(40));
      
      const memoryValues = data.samples.map(s => s.rss);
      const stats = MemoryUtils.calculateStats(memoryValues);
      
      console.log(`Samples Collected: ${data.samples.length}`);
      console.log(`Memory Usage:`);
      console.log(`  Average:    ${MemoryUtils.formatBytes(stats.mean)}`);
      console.log(`  Std Dev:    ${MemoryUtils.formatBytes(stats.std)}`);
      console.log(`  CV:         ${(stats.cv * 100).toFixed(1)}%`);
      console.log(`  Trend:      ${MemoryUtils.formatBytes(stats.trend * 60)} per minute`);
      console.log(`  Min:        ${MemoryUtils.formatBytes(Math.min(...memoryValues))}`);
      console.log(`  Max:        ${MemoryUtils.formatBytes(Math.max(...memoryValues))}`);
      
      console.log(`Alerts: ${data.alerts.length}`);
      if (data.alerts.length > 0) {
        const critical = data.alerts.filter(a => a.severity === 'critical').length;
        const warnings = data.alerts.filter(a => a.severity === 'warning').length;
        console.log(`  Critical:   ${critical}`);
        console.log(`  Warnings:   ${warnings}`);
        
        // Show recent alerts
        const recentAlerts = data.alerts.slice(-3);
        console.log(`  Recent:`);
        for (const alert of recentAlerts) {
          const time = new Date(alert.timestamp).toLocaleTimeString();
          console.log(`    ${time}: ${alert.message}`);
        }
      }
      
      // Efficiency rating
      const efficiency = this.calculateEfficiency(stats, data.alerts);
      console.log(`Efficiency: ${efficiency.rating} (${efficiency.score}%)`);
    }
    
    // Overall summary
    console.log('\n' + '=' .repeat(60));
    console.log('SUMMARY');
    console.log('=' .repeat(60));
    console.log(`Duration:        ${Math.round(totalDuration / 1000)}s`);
    console.log(`Servers:         ${serversAnalyzed}/${MONITOR_CONFIG.servers.length}`);
    console.log(`Total Samples:   ${totalSamples}`);
    console.log(`Total Alerts:    ${this.alertCount}`);
    
    // Save detailed data
    const reportData = {
      timestamp: new Date().toISOString(),
      config: MONITOR_CONFIG,
      duration: totalDuration,
      summary: {
        serversAnalyzed,
        totalSamples,
        totalAlerts: this.alertCount
      },
      servers: Object.fromEntries(this.monitoringData)
    };
    
    const filename = `continuous_memory_report_${Date.now()}.json`;
    fs.writeFileSync(filename, JSON.stringify(reportData, null, 2));
    console.log(`\n💾 Report saved: ${filename}`);
    
    console.log('\n✅ Continuous monitoring completed');
  }

  calculateEfficiency(stats, alerts) {
    const stabilityScore = Math.max(0, 1 - stats.cv * 2); // Penalize high CV
    const growthScore = Math.max(0, 1 - Math.abs(stats.trend) / (10 * 1024 * 1024)); // Penalize growth
    const alertScore = Math.max(0, 1 - alerts.length * 0.1); // Penalize alerts
    
    const totalScore = (stabilityScore + growthScore + alertScore) / 3;
    const percentage = Math.round(totalScore * 100);
    
    let rating;
    if (percentage >= 90) rating = 'Excellent';
    else if (percentage >= 80) rating = 'Good';
    else if (percentage >= 70) rating = 'Fair';
    else if (percentage >= 60) rating = 'Poor';
    else rating = 'Critical';
    
    return { score: percentage, rating };
  }

  async getProcessMemory(pid) {
    return new Promise((resolve, reject) => {
      const ps = spawn('ps', ['-o', 'pid,rss,vsz', '-p', pid]);
      let output = '';
      
      ps.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      ps.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ps command failed`));
          return;
        }
        
        const lines = output.trim().split('\n');
        if (lines.length < 2) {
          reject(new Error('No process data'));
          return;
        }
        
        const parts = lines[1].trim().split(/\s+/);
        resolve({
          pid: parseInt(parts[0]),
          rss: parseInt(parts[1]) * 1024,
          vsz: parseInt(parts[2]) * 1024
        });
      });
    });
  }

  async execCommand(command) {
    return new Promise((resolve, reject) => {
      const child = spawn('sh', ['-c', command]);
      let output = '';
      
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error('Command failed'));
        }
      });
    });
  }

  stop() {
    this.isRunning = false;
    console.log('\n⏹️  Stopping monitor...');
  }
}

// Main execution
async function main() {
  const monitor = new ContinuousMemoryMonitor();
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    monitor.stop();
  });
  
  try {
    await monitor.start();
  } catch (error) {
    console.error('❌ Monitoring failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);