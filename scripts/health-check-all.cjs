#!/usr/bin/env node

/**
 * Comprehensive Health Check Script for Claude MCP Server Ecosystem
 * Tests all services and provides detailed health status
 */

const http = require('http');
const { execSync } = require('child_process');

class HealthChecker {
  constructor() {
    this.services = [
      // Infrastructure Services
      { name: 'PostgreSQL', type: 'database', host: 'localhost', port: 5432, path: null },
      { name: 'Redis', type: 'database', host: 'localhost', port: 6379, path: null },
      { name: 'Qdrant', type: 'vector-db', host: 'localhost', port: 6333, path: '/health' },
      
      // MCP Services
      { name: 'Memory MCP', type: 'mcp', host: 'localhost', port: 3201, path: '/health' },
      { name: 'Sequential Thinking', type: 'mcp', host: 'localhost', port: 3202, path: '/health' },
      { name: 'Filesystem MCP', type: 'mcp', host: 'localhost', port: 3203, path: '/health' },
      
      // Data Analytics Services (Week 11)
      { name: 'Data Pipeline', type: 'analytics', host: 'localhost', port: 3011, path: '/health' },
      { name: 'Realtime Analytics', type: 'analytics', host: 'localhost', port: 3012, path: '/health' },
      { name: 'Data Warehouse', type: 'analytics', host: 'localhost', port: 3013, path: '/health' },
      { name: 'ML Deployment', type: 'analytics', host: 'localhost', port: 3014, path: '/health' },
      { name: 'Data Governance', type: 'analytics', host: 'localhost', port: 3015, path: '/health' },
      
      // Attention Mechanisms (Week 14)
      { name: 'Attention Pattern Analyzer', type: 'attention', host: 'localhost', port: 8000, path: '/health' },
      { name: 'Sparse Attention Engine', type: 'attention', host: 'localhost', port: 8001, path: '/health' },
      { name: 'Memory Efficient Attention', type: 'attention', host: 'localhost', port: 8002, path: '/health' },
      { name: 'Attention Visualization', type: 'attention', host: 'localhost', port: 8004, path: '/health' },
      { name: 'Cross Attention Controller', type: 'attention', host: 'localhost', port: 8005, path: '/health' },
      
      // Language Model Interface (Week 15)
      { name: 'Language Model Interface', type: 'language', host: 'localhost', port: 8003, path: '/health' },
      { name: 'Inference Pipeline Manager', type: 'language', host: 'localhost', port: 8006, path: '/health' },
      { name: 'Model Benchmarking Suite', type: 'language', host: 'localhost', port: 8007, path: '/health' },
      { name: 'Model Integration Hub', type: 'language', host: 'localhost', port: 8008, path: '/health' }
    ];
    
    this.results = {
      healthy: [],
      unhealthy: [],
      unreachable: []
    };
  }

  async checkService(service) {
    try {
      const result = await this.makeRequest(service);
      
      if (result.success) {
        this.results.healthy.push({
          ...service,
          status: 'healthy',
          response: result.data,
          responseTime: result.responseTime
        });
        return { success: true, status: 'healthy', data: result.data };
      } else {
        this.results.unhealthy.push({
          ...service,
          status: 'unhealthy',
          error: result.error,
          responseTime: result.responseTime
        });
        return { success: false, status: 'unhealthy', error: result.error };
      }
    } catch (error) {
      this.results.unreachable.push({
        ...service,
        status: 'unreachable',
        error: error.message
      });
      return { success: false, status: 'unreachable', error: error.message };
    }
  }

  async makeRequest(service) {
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      // Special handling for database services
      if (service.type === 'database') {
        if (service.name === 'PostgreSQL') {
          return this.checkPostgreSQL(resolve, startTime);
        } else if (service.name === 'Redis') {
          return this.checkRedis(resolve, startTime);
        }
      }
      
      // HTTP health check for other services
      const options = {
        hostname: service.host,
        port: service.port,
        path: service.path || '/health',
        method: 'GET',
        timeout: 5000
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const responseTime = Date.now() - startTime;
          
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsedData = JSON.parse(data);
              resolve({
                success: true,
                data: parsedData,
                responseTime,
                statusCode: res.statusCode
              });
            } catch (e) {
              resolve({
                success: true,
                data: { raw: data },
                responseTime,
                statusCode: res.statusCode
              });
            }
          } else {
            resolve({
              success: false,
              error: `HTTP ${res.statusCode}: ${data}`,
              responseTime,
              statusCode: res.statusCode
            });
          }
        });
      });

      req.on('error', (error) => {
        const responseTime = Date.now() - startTime;
        resolve({
          success: false,
          error: error.message,
          responseTime
        });
      });

      req.on('timeout', () => {
        req.destroy();
        const responseTime = Date.now() - startTime;
        resolve({
          success: false,
          error: 'Request timeout',
          responseTime
        });
      });

      req.setTimeout(5000);
      req.end();
    });
  }

  checkPostgreSQL(resolve, startTime) {
    try {
      // Check if PostgreSQL process is running
      execSync('docker ps --filter name=claude-mcp-postgres --format "{{.Status}}"', { stdio: 'pipe' });
      const responseTime = Date.now() - startTime;
      resolve({
        success: true,
        data: { status: 'running', service: 'postgresql', port: 5432 },
        responseTime
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      resolve({
        success: false,
        error: 'PostgreSQL container not running',
        responseTime
      });
    }
  }

  checkRedis(resolve, startTime) {
    try {
      // Check if Redis process is running
      execSync('docker ps --filter name=claude-mcp-redis --format "{{.Status}}"', { stdio: 'pipe' });
      const responseTime = Date.now() - startTime;
      resolve({
        success: true,
        data: { status: 'running', service: 'redis', port: 6379 },
        responseTime
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      resolve({
        success: false,
        error: 'Redis container not running',
        responseTime
      });
    }
  }

  async checkDockerInfrastructure() {
    console.log('🐳 Checking Docker Infrastructure...');
    try {
      const output = execSync('docker ps --filter network=claude-mcp-network --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"', { encoding: 'utf8' });
      console.log(output);
      return true;
    } catch (error) {
      console.error('❌ Docker infrastructure check failed:', error.message);
      return false;
    }
  }

  async runHealthChecks() {
    console.log('🏥 Claude MCP Server Ecosystem - Health Check');
    console.log('================================================\n');
    
    // Check Docker infrastructure first
    const dockerOk = await this.checkDockerInfrastructure();
    console.log('');
    
    // Group services by type for organized checking
    const servicesByType = this.services.reduce((acc, service) => {
      if (!acc[service.type]) acc[service.type] = [];
      acc[service.type].push(service);
      return acc;
    }, {});

    // Check each group of services
    for (const [type, services] of Object.entries(servicesByType)) {
      console.log(`🔍 Checking ${type.charAt(0).toUpperCase() + type.slice(1)} Services:`);
      console.log('-'.repeat(50));
      
      const promises = services.map(async (service) => {
        const result = await this.checkService(service);
        const statusIcon = result.success ? '✅' : '❌';
        const responseTime = result.responseTime ? `(${result.responseTime}ms)` : '';
        
        console.log(`${statusIcon} ${service.name}: ${result.status} ${responseTime}`);
        
        if (!result.success && result.error) {
          console.log(`   ↳ ${result.error}`);
        }
        
        return result;
      });
      
      await Promise.all(promises);
      console.log('');
    }
    
    // Summary
    this.printSummary();
    
    // Return overall health status
    const totalServices = this.services.length;
    const healthyServices = this.results.healthy.length;
    const healthPercentage = Math.round((healthyServices / totalServices) * 100);
    
    return {
      healthy: healthyServices,
      total: totalServices,
      percentage: healthPercentage,
      dockerInfrastructure: dockerOk,
      details: this.results
    };
  }

  printSummary() {
    console.log('📊 HEALTH CHECK SUMMARY');
    console.log('======================');
    console.log(`✅ Healthy: ${this.results.healthy.length}`);
    console.log(`❌ Unhealthy: ${this.results.unhealthy.length}`);
    console.log(`🔌 Unreachable: ${this.results.unreachable.length}`);
    
    const total = this.results.healthy.length + this.results.unhealthy.length + this.results.unreachable.length;
    const healthPercentage = Math.round((this.results.healthy.length / total) * 100);
    
    console.log(`📈 Overall Health: ${healthPercentage}%\n`);
    
    if (this.results.unhealthy.length > 0) {
      console.log('⚠️  UNHEALTHY SERVICES:');
      this.results.unhealthy.forEach(service => {
        console.log(`   - ${service.name}: ${service.error}`);
      });
      console.log('');
    }
    
    if (this.results.unreachable.length > 0) {
      console.log('🔌 UNREACHABLE SERVICES:');
      this.results.unreachable.forEach(service => {
        console.log(`   - ${service.name}: ${service.error}`);
      });
      console.log('');
    }
    
    // Recommendations
    if (healthPercentage < 100) {
      console.log('💡 RECOMMENDATIONS:');
      
      if (this.results.unreachable.some(s => s.type === 'database')) {
        console.log('   - Start Docker infrastructure: npm run docker:up');
      }
      
      if (this.results.unreachable.some(s => s.type === 'mcp')) {
        console.log('   - Start MCP servers: npm run start:mcp');
      }
      
      if (this.results.unreachable.some(s => s.type === 'analytics')) {
        console.log('   - Start analytics servers: npm run start:week-11');
      }
      
      if (this.results.unreachable.some(s => s.type === 'attention')) {
        console.log('   - Start attention services: npm run start:week-14');
      }
      
      if (this.results.unreachable.some(s => s.type === 'language')) {
        console.log('   - Start language services: npm run start:week-15');
      }
      
      console.log('');
    } else {
      console.log('🎉 ALL SYSTEMS HEALTHY! 🎉');
    }
  }
}

// Run health checks if this script is executed directly
if (require.main === module) {
  const healthChecker = new HealthChecker();
  
  healthChecker.runHealthChecks()
    .then((results) => {
      // Exit with appropriate code
      const exitCode = results.percentage === 100 ? 0 : 1;
      process.exit(exitCode);
    })
    .catch((error) => {
      console.error('❌ Health check failed:', error);
      process.exit(1);
    });
}

module.exports = HealthChecker;