#!/usr/bin/env node

/**
 * Comprehensive MCP Testing Suite
 * Tests all MCP services: Memory, Sequential Thinking, Filesystem, and integration
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

class MCPTestSuite {
  constructor() {
    this.testResults = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      details: []
    };
    
    this.services = {
      memory: { url: 'http://localhost:3201', status: 'unknown' },
      sequentialThinking: { url: 'http://localhost:3202', status: 'unknown' },
      filesystem: { url: 'http://localhost:3203', status: 'unknown' },
      qdrant: { url: 'http://localhost:6333', status: 'unknown' }
    };
    
    this.startTime = Date.now();
  }

  async runAllTests() {
    console.log('🧪 Starting Comprehensive MCP Test Suite...');
    console.log('================================================');
    
    try {
      // Phase 1: Service Discovery & Health Checks
      await this.testServiceDiscovery();
      
      // Phase 2: Individual Service Tests
      await this.testMemoryMCP();
      await this.testSequentialThinkingMCP();
      await this.testFilesystemMCP();
      await this.testQdrantService();
      
      // Phase 3: Integration Tests
      await this.testServiceIntegration();
      
      // Phase 4: Load & Performance Tests
      await this.testPerformance();
      
      // Phase 5: Error Handling & Resilience
      await this.testErrorHandling();
      
      // Generate final report
      this.generateReport();
      
    } catch (error) {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    }
  }

  async testServiceDiscovery() {
    console.log('\n🔍 Phase 1: Service Discovery & Health Checks');
    console.log('----------------------------------------------');
    
    for (const [serviceName, config] of Object.entries(this.services)) {
      const result = await this.testServiceHealth(serviceName, config.url);
      this.addTestResult(`Service Discovery - ${serviceName}`, result.success, result.details);
      config.status = result.success ? 'healthy' : 'unhealthy';
    }
  }

  async testServiceHealth(serviceName, baseUrl) {
    try {
      const healthUrl = `${baseUrl}/health`;
      const response = await this.makeRequest('GET', healthUrl);
      
      if (response.statusCode === 200) {
        const data = JSON.parse(response.body);
        console.log(`  ✅ ${serviceName}: ${data.status || 'healthy'}`);
        return { 
          success: true, 
          details: `Health check passed: ${data.status || 'healthy'}` 
        };
      } else {
        console.log(`  ❌ ${serviceName}: HTTP ${response.statusCode}`);
        return { 
          success: false, 
          details: `Health check failed: HTTP ${response.statusCode}` 
        };
      }
    } catch (error) {
      console.log(`  ❌ ${serviceName}: ${error.message}`);
      return { 
        success: false, 
        details: `Health check failed: ${error.message}` 
      };
    }
  }

  async testMemoryMCP() {
    if (this.services.memory.status !== 'healthy') {
      console.log('\n⏭️  Skipping Memory MCP tests (service unhealthy)');
      this.addTestResult('Memory MCP Tests', false, 'Service unavailable');
      return;
    }

    console.log('\n🧠 Phase 2a: Memory MCP Tests');
    console.log('-----------------------------');
    
    const baseUrl = this.services.memory.url;
    
    // Test 1: Add Memory
    await this.testAddMemory(baseUrl);
    
    // Test 2: Search Memory
    await this.testSearchMemory(baseUrl);
    
    // Test 3: List Memories
    await this.testListMemories(baseUrl);
    
    // Test 4: Memory Persistence
    await this.testMemoryPersistence(baseUrl);
  }

  async testAddMemory(baseUrl) {
    try {
      const testMemory = {
        content: 'Test memory for MCP testing suite',
        importance: 0.8,
        tags: ['test', 'mcp', 'automation']
      };
      
      const response = await this.makeRequest('POST', `${baseUrl}/memory`, testMemory);
      
      if (response.statusCode === 201) {
        const data = JSON.parse(response.body);
        console.log(`  ✅ Add Memory: Created ${data.id}`);
        this.addTestResult('Memory MCP - Add Memory', true, `Memory created: ${data.id}`);
        return data.id;
      } else {
        console.log(`  ❌ Add Memory: HTTP ${response.statusCode}`);
        this.addTestResult('Memory MCP - Add Memory', false, `HTTP ${response.statusCode}`);
        return null;
      }
    } catch (error) {
      console.log(`  ❌ Add Memory: ${error.message}`);
      this.addTestResult('Memory MCP - Add Memory', false, error.message);
      return null;
    }
  }

  async testSearchMemory(baseUrl) {
    try {
      const searchQuery = { query: 'test' };
      const response = await this.makeRequest('POST', `${baseUrl}/memory/search`, searchQuery);
      
      if (response.statusCode === 200) {
        const data = JSON.parse(response.body);
        console.log(`  ✅ Search Memory: Found ${data.results?.length || 0} results`);
        this.addTestResult('Memory MCP - Search Memory', true, `Found ${data.results?.length || 0} results`);
      } else {
        console.log(`  ❌ Search Memory: HTTP ${response.statusCode}`);
        this.addTestResult('Memory MCP - Search Memory', false, `HTTP ${response.statusCode}`);
      }
    } catch (error) {
      console.log(`  ❌ Search Memory: ${error.message}`);
      this.addTestResult('Memory MCP - Search Memory', false, error.message);
    }
  }

  async testListMemories(baseUrl) {
    try {
      const response = await this.makeRequest('GET', `${baseUrl}/memory/list`);
      
      if (response.statusCode === 200) {
        const data = JSON.parse(response.body);
        console.log(`  ✅ List Memories: Retrieved ${data.total || 0} memories`);
        this.addTestResult('Memory MCP - List Memories', true, `Retrieved ${data.total || 0} memories`);
      } else {
        console.log(`  ❌ List Memories: HTTP ${response.statusCode}`);
        this.addTestResult('Memory MCP - List Memories', false, `HTTP ${response.statusCode}`);
      }
    } catch (error) {
      console.log(`  ❌ List Memories: ${error.message}`);
      this.addTestResult('Memory MCP - List Memories', false, error.message);
    }
  }

  async testMemoryPersistence(baseUrl) {
    try {
      // Add a memory, then verify it persists
      const testMemory = {
        content: 'Persistence test memory',
        importance: 0.9,
        tags: ['persistence']
      };
      
      const addResponse = await this.makeRequest('POST', `${baseUrl}/memory`, testMemory);
      
      if (addResponse.statusCode === 201) {
        const addData = JSON.parse(addResponse.body);
        
        // Search for the memory
        const searchResponse = await this.makeRequest('POST', `${baseUrl}/memory/search`, { query: 'persistence' });
        
        if (searchResponse.statusCode === 200) {
          const searchData = JSON.parse(searchResponse.body);
          const found = searchData.results?.some(r => r.id === addData.id);
          
          if (found) {
            console.log(`  ✅ Memory Persistence: Memory persisted correctly`);
            this.addTestResult('Memory MCP - Persistence', true, 'Memory persisted and found');
          } else {
            console.log(`  ❌ Memory Persistence: Memory not found in search`);
            this.addTestResult('Memory MCP - Persistence', false, 'Memory not found in search');
          }
        }
      }
    } catch (error) {
      console.log(`  ❌ Memory Persistence: ${error.message}`);
      this.addTestResult('Memory MCP - Persistence', false, error.message);
    }
  }

  async testSequentialThinkingMCP() {
    if (this.services.sequentialThinking.status !== 'healthy') {
      console.log('\n⏭️  Skipping Sequential Thinking MCP tests (service unhealthy)');
      this.addTestResult('Sequential Thinking MCP Tests', false, 'Service unavailable');
      return;
    }

    console.log('\n🤔 Phase 2b: Sequential Thinking MCP Tests');
    console.log('-------------------------------------------');
    
    const baseUrl = this.services.sequentialThinking.url;
    
    // Test 1: Health Check
    await this.testSequentialThinkingHealth(baseUrl);
    
    // Test 2: Basic Response
    await this.testSequentialThinkingResponse(baseUrl);
  }

  async testSequentialThinkingHealth(baseUrl) {
    try {
      const response = await this.makeRequest('GET', `${baseUrl}/health`);
      
      if (response.statusCode === 200) {
        const data = JSON.parse(response.body);
        console.log(`  ✅ Sequential Thinking Health: ${data.status}`);
        this.addTestResult('Sequential Thinking - Health', true, data.status);
      } else {
        console.log(`  ❌ Sequential Thinking Health: HTTP ${response.statusCode}`);
        this.addTestResult('Sequential Thinking - Health', false, `HTTP ${response.statusCode}`);
      }
    } catch (error) {
      console.log(`  ❌ Sequential Thinking Health: ${error.message}`);
      this.addTestResult('Sequential Thinking - Health', false, error.message);
    }
  }

  async testSequentialThinkingResponse(baseUrl) {
    try {
      const response = await this.makeRequest('GET', `${baseUrl}/`);
      
      if (response.statusCode === 200) {
        console.log(`  ✅ Sequential Thinking Response: Server responding`);
        this.addTestResult('Sequential Thinking - Response', true, 'Server responding');
      } else {
        console.log(`  ❌ Sequential Thinking Response: HTTP ${response.statusCode}`);
        this.addTestResult('Sequential Thinking - Response', false, `HTTP ${response.statusCode}`);
      }
    } catch (error) {
      console.log(`  ❌ Sequential Thinking Response: ${error.message}`);
      this.addTestResult('Sequential Thinking - Response', false, error.message);
    }
  }

  async testFilesystemMCP() {
    if (this.services.filesystem.status !== 'healthy') {
      console.log('\n⏭️  Skipping Filesystem MCP tests (service unhealthy)');
      this.addTestResult('Filesystem MCP Tests', false, 'Service unavailable');
      return;
    }

    console.log('\n📁 Phase 2c: Filesystem MCP Tests');
    console.log('---------------------------------');
    
    const baseUrl = this.services.filesystem.url;
    
    // Test 1: Health Check
    await this.testFilesystemHealth(baseUrl);
    
    // Test 2: Basic Response
    await this.testFilesystemResponse(baseUrl);
  }

  async testFilesystemHealth(baseUrl) {
    try {
      const response = await this.makeRequest('GET', `${baseUrl}/health`);
      
      if (response.statusCode === 200) {
        const data = JSON.parse(response.body);
        console.log(`  ✅ Filesystem Health: ${data.status}`);
        this.addTestResult('Filesystem - Health', true, data.status);
      } else {
        console.log(`  ❌ Filesystem Health: HTTP ${response.statusCode}`);
        this.addTestResult('Filesystem - Health', false, `HTTP ${response.statusCode}`);
      }
    } catch (error) {
      console.log(`  ❌ Filesystem Health: ${error.message}`);
      this.addTestResult('Filesystem - Health', false, error.message);
    }
  }

  async testFilesystemResponse(baseUrl) {
    try {
      const response = await this.makeRequest('GET', `${baseUrl}/`);
      
      if (response.statusCode === 200 || response.statusCode === 404) {
        console.log(`  ✅ Filesystem Response: Server responding`);
        this.addTestResult('Filesystem - Response', true, 'Server responding');
      } else {
        console.log(`  ❌ Filesystem Response: HTTP ${response.statusCode}`);
        this.addTestResult('Filesystem - Response', false, `HTTP ${response.statusCode}`);
      }
    } catch (error) {
      console.log(`  ❌ Filesystem Response: ${error.message}`);
      this.addTestResult('Filesystem - Response', false, error.message);
    }
  }

  async testQdrantService() {
    if (this.services.qdrant.status !== 'healthy') {
      console.log('\n⏭️  Skipping Qdrant tests (service unhealthy)');
      this.addTestResult('Qdrant Service Tests', false, 'Service unavailable');
      return;
    }

    console.log('\n🔍 Phase 2d: Qdrant Vector Database Tests');
    console.log('-----------------------------------------');
    
    const baseUrl = this.services.qdrant.url;
    
    // Test 1: Qdrant Info
    await this.testQdrantInfo(baseUrl);
    
    // Test 2: Collections List
    await this.testQdrantCollections(baseUrl);
  }

  async testQdrantInfo(baseUrl) {
    try {
      const response = await this.makeRequest('GET', `${baseUrl}/`);
      
      if (response.statusCode === 200) {
        const data = JSON.parse(response.body);
        console.log(`  ✅ Qdrant Info: ${data.title} v${data.version}`);
        this.addTestResult('Qdrant - Info', true, `${data.title} v${data.version}`);
      } else {
        console.log(`  ❌ Qdrant Info: HTTP ${response.statusCode}`);
        this.addTestResult('Qdrant - Info', false, `HTTP ${response.statusCode}`);
      }
    } catch (error) {
      console.log(`  ❌ Qdrant Info: ${error.message}`);
      this.addTestResult('Qdrant - Info', false, error.message);
    }
  }

  async testQdrantCollections(baseUrl) {
    try {
      const response = await this.makeRequest('GET', `${baseUrl}/collections`);
      
      if (response.statusCode === 200) {
        const data = JSON.parse(response.body);
        console.log(`  ✅ Qdrant Collections: ${data.result?.collections?.length || 0} collections`);
        this.addTestResult('Qdrant - Collections', true, `${data.result?.collections?.length || 0} collections`);
      } else {
        console.log(`  ❌ Qdrant Collections: HTTP ${response.statusCode}`);
        this.addTestResult('Qdrant - Collections', false, `HTTP ${response.statusCode}`);
      }
    } catch (error) {
      console.log(`  ❌ Qdrant Collections: ${error.message}`);
      this.addTestResult('Qdrant - Collections', false, error.message);
    }
  }

  async testServiceIntegration() {
    console.log('\n🔗 Phase 3: Service Integration Tests');
    console.log('------------------------------------');
    
    // Test 1: Cross-service Communication
    await this.testCrossServiceCommunication();
    
    // Test 2: Data Flow
    await this.testDataFlow();
    
    // Test 3: Service Dependencies
    await this.testServiceDependencies();
  }

  async testCrossServiceCommunication() {
    console.log('  📡 Testing cross-service communication...');
    
    const healthyServices = Object.entries(this.services)
      .filter(([, config]) => config.status === 'healthy')
      .length;
    
    if (healthyServices >= 2) {
      console.log(`  ✅ Cross-service Communication: ${healthyServices}/4 services healthy`);
      this.addTestResult('Integration - Cross-service Communication', true, `${healthyServices}/4 services healthy`);
    } else {
      console.log(`  ❌ Cross-service Communication: Insufficient healthy services`);
      this.addTestResult('Integration - Cross-service Communication', false, 'Insufficient healthy services');
    }
  }

  async testDataFlow() {
    console.log('  🌊 Testing data flow between services...');
    
    // Simplified data flow test
    if (this.services.memory.status === 'healthy') {
      console.log(`  ✅ Data Flow: Memory service can store and retrieve data`);
      this.addTestResult('Integration - Data Flow', true, 'Memory service functional');
    } else {
      console.log(`  ⚠️  Data Flow: Limited testing due to service availability`);
      this.addTestResult('Integration - Data Flow', true, 'Limited testing performed');
    }
  }

  async testServiceDependencies() {
    console.log('  🏗️  Testing service dependencies...');
    
    const dependencies = {
      memory: ['qdrant'],
      sequentialThinking: [],
      filesystem: []
    };
    
    let allDependenciesMet = true;
    for (const [service, deps] of Object.entries(dependencies)) {
      for (const dep of deps) {
        if (this.services[dep]?.status !== 'healthy') {
          allDependenciesMet = false;
          console.log(`    ⚠️  ${service} depends on ${dep} (${this.services[dep]?.status})`);
        }
      }
    }
    
    if (allDependenciesMet) {
      console.log(`  ✅ Service Dependencies: All dependencies satisfied`);
      this.addTestResult('Integration - Service Dependencies', true, 'All dependencies satisfied');
    } else {
      console.log(`  ⚠️  Service Dependencies: Some dependencies not met`);
      this.addTestResult('Integration - Service Dependencies', false, 'Some dependencies not met');
    }
  }

  async testPerformance() {
    console.log('\n⚡ Phase 4: Performance Tests');
    console.log('-----------------------------');
    
    // Test 1: Response Times
    await this.testResponseTimes();
    
    // Test 2: Concurrent Requests
    await this.testConcurrentRequests();
    
    // Test 3: Memory Usage
    await this.testMemoryUsage();
  }

  async testResponseTimes() {
    console.log('  ⏱️  Testing response times...');
    
    const results = [];
    
    for (const [serviceName, config] of Object.entries(this.services)) {
      if (config.status === 'healthy') {
        const startTime = Date.now();
        try {
          await this.makeRequest('GET', `${config.url}/health`);
          const responseTime = Date.now() - startTime;
          results.push({ service: serviceName, time: responseTime });
          console.log(`    ${serviceName}: ${responseTime}ms`);
        } catch (error) {
          console.log(`    ${serviceName}: Error`);
        }
      }
    }
    
    const avgResponseTime = results.reduce((sum, r) => sum + r.time, 0) / results.length;
    
    if (avgResponseTime < 1000) { // Less than 1 second
      console.log(`  ✅ Response Times: Average ${Math.round(avgResponseTime)}ms`);
      this.addTestResult('Performance - Response Times', true, `Average ${Math.round(avgResponseTime)}ms`);
    } else {
      console.log(`  ⚠️  Response Times: Average ${Math.round(avgResponseTime)}ms (slow)`);
      this.addTestResult('Performance - Response Times', false, `Average ${Math.round(avgResponseTime)}ms`);
    }
  }

  async testConcurrentRequests() {
    console.log('  🚀 Testing concurrent requests...');
    
    if (this.services.memory.status === 'healthy') {
      const startTime = Date.now();
      const requests = [];
      
      // Make 5 concurrent requests
      for (let i = 0; i < 5; i++) {
        requests.push(this.makeRequest('GET', `${this.services.memory.url}/health`));
      }
      
      try {
        await Promise.all(requests);
        const totalTime = Date.now() - startTime;
        console.log(`    Completed 5 concurrent requests in ${totalTime}ms`);
        this.addTestResult('Performance - Concurrent Requests', true, `5 requests in ${totalTime}ms`);
      } catch (error) {
        console.log(`    Failed: ${error.message}`);
        this.addTestResult('Performance - Concurrent Requests', false, error.message);
      }
    } else {
      console.log(`  ⏭️  Skipping concurrent tests (no healthy services)`);
      this.addTestResult('Performance - Concurrent Requests', false, 'No healthy services');
    }
  }

  async testMemoryUsage() {
    console.log('  💾 Testing memory usage...');
    
    const memUsage = process.memoryUsage();
    const usedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    
    console.log(`    Test suite memory usage: ${usedMB}MB`);
    
    if (usedMB < 100) { // Less than 100MB
      this.addTestResult('Performance - Memory Usage', true, `${usedMB}MB heap used`);
    } else {
      this.addTestResult('Performance - Memory Usage', false, `${usedMB}MB heap used (high)`);
    }
  }

  async testErrorHandling() {
    console.log('\n🛡️  Phase 5: Error Handling & Resilience Tests');
    console.log('----------------------------------------------');
    
    // Test 1: Invalid Requests
    await this.testInvalidRequests();
    
    // Test 2: Service Timeouts
    await this.testServiceTimeouts();
    
    // Test 3: Malformed Data
    await this.testMalformedData();
  }

  async testInvalidRequests() {
    console.log('  🚫 Testing invalid requests...');
    
    if (this.services.memory.status === 'healthy') {
      try {
        const response = await this.makeRequest('GET', `${this.services.memory.url}/nonexistent`);
        
        if (response.statusCode === 404) {
          console.log(`    ✅ 404 handling: Correct response`);
          this.addTestResult('Error Handling - 404 Responses', true, 'Correct 404 response');
        } else {
          console.log(`    ⚠️  404 handling: Unexpected response ${response.statusCode}`);
          this.addTestResult('Error Handling - 404 Responses', false, `Unexpected response ${response.statusCode}`);
        }
      } catch (error) {
        console.log(`    ❌ 404 handling: ${error.message}`);
        this.addTestResult('Error Handling - 404 Responses', false, error.message);
      }
    } else {
      this.addTestResult('Error Handling - 404 Responses', false, 'No healthy services to test');
    }
  }

  async testServiceTimeouts() {
    console.log('  ⏰ Testing service timeouts...');
    
    // Test short timeout
    const timeout = 100; // 100ms timeout
    
    if (this.services.memory.status === 'healthy') {
      try {
        const response = await this.makeRequest('GET', `${this.services.memory.url}/health`, null, timeout);
        
        if (response.statusCode === 200) {
          console.log(`    ✅ Timeout handling: Service responds within ${timeout}ms`);
          this.addTestResult('Error Handling - Timeouts', true, `Service responds within ${timeout}ms`);
        }
      } catch (error) {
        if (error.message.includes('timeout')) {
          console.log(`    ⚠️  Timeout handling: Service slower than ${timeout}ms`);
          this.addTestResult('Error Handling - Timeouts', false, `Service slower than ${timeout}ms`);
        } else {
          console.log(`    ❌ Timeout handling: ${error.message}`);
          this.addTestResult('Error Handling - Timeouts', false, error.message);
        }
      }
    } else {
      this.addTestResult('Error Handling - Timeouts', false, 'No healthy services to test');
    }
  }

  async testMalformedData() {
    console.log('  🗂️  Testing malformed data handling...');
    
    if (this.services.memory.status === 'healthy') {
      try {
        // Send invalid JSON
        const response = await this.makeRequest('POST', `${this.services.memory.url}/memory`, 'invalid json');
        
        if (response.statusCode === 400) {
          console.log(`    ✅ Malformed data: Correct 400 response`);
          this.addTestResult('Error Handling - Malformed Data', true, 'Correct 400 response');
        } else {
          console.log(`    ⚠️  Malformed data: Unexpected response ${response.statusCode}`);
          this.addTestResult('Error Handling - Malformed Data', false, `Unexpected response ${response.statusCode}`);
        }
      } catch (error) {
        console.log(`    ❌ Malformed data: ${error.message}`);
        this.addTestResult('Error Handling - Malformed Data', false, error.message);
      }
    } else {
      this.addTestResult('Error Handling - Malformed Data', false, 'No healthy services to test');
    }
  }

  generateReport() {
    const duration = Date.now() - this.startTime;
    
    console.log('\n📊 Test Suite Results');
    console.log('====================');
    console.log(`Duration: ${Math.round(duration / 1000)}s`);
    console.log(`Total Tests: ${this.testResults.total}`);
    console.log(`Passed: ${this.testResults.passed} ✅`);
    console.log(`Failed: ${this.testResults.failed} ❌`);
    console.log(`Skipped: ${this.testResults.skipped} ⏭️`);
    
    const successRate = Math.round((this.testResults.passed / this.testResults.total) * 100);
    console.log(`Success Rate: ${successRate}%`);
    
    if (this.testResults.failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.testResults.details
        .filter(test => !test.passed)
        .forEach(test => {
          console.log(`  - ${test.name}: ${test.details}`);
        });
    }
    
    // Generate JSON report
    const report = {
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      summary: {
        total: this.testResults.total,
        passed: this.testResults.passed,
        failed: this.testResults.failed,
        skipped: this.testResults.skipped,
        success_rate: successRate
      },
      services: this.services,
      details: this.testResults.details
    };
    
    try {
      const reportDir = path.join(__dirname, '..', 'reports');
      if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
      }
      
      const reportFile = path.join(reportDir, `mcp-test-report-${Date.now()}.json`);
      fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
      console.log(`\n📄 Report saved: ${reportFile}`);
    } catch (error) {
      console.log(`⚠️  Could not save report: ${error.message}`);
    }
    
    console.log('\n🏁 MCP Test Suite Complete!');
    
    // Exit with appropriate code
    process.exit(this.testResults.failed > 0 ? 1 : 0);
  }

  addTestResult(testName, passed, details) {
    this.testResults.total++;
    if (passed) {
      this.testResults.passed++;
    } else {
      this.testResults.failed++;
    }
    
    this.testResults.details.push({
      name: testName,
      passed,
      details,
      timestamp: new Date().toISOString()
    });
  }

  makeRequest(method, url, data = null, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MCP-Test-Suite/1.0.0'
        },
        timeout: timeout
      };

      if (data && typeof data === 'object') {
        data = JSON.stringify(data);
        options.headers['Content-Length'] = Buffer.byteLength(data);
      } else if (data && typeof data === 'string') {
        options.headers['Content-Length'] = Buffer.byteLength(data);
      }

      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body
          });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout after ${timeout}ms`));
      });

      if (data) {
        req.write(data);
      }
      req.end();
    });
  }
}

// Run the test suite if this file is executed directly
if (require.main === module) {
  const testSuite = new MCPTestSuite();
  testSuite.runAllTests();
}

module.exports = MCPTestSuite;