/**
 * Tests for the Memory-Efficient Attention component
 *
 * These tests verify the functionality of the Memory-Efficient Attention component,
 * including its ability to optimize memory usage, profile memory consumption,
 * and compare different memory-efficient algorithms.
 */

import http from 'http';
import { spawn } from 'child_process';
import chai from 'chai';
const { expect } = chai;

// Test configuration
const SERVER_PORT = 8002;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const SERVER_STARTUP_TIMEOUT = 10000; // 10 seconds

describe('Memory-Efficient Attention Tests', function() {
  // Increase timeout for the entire test suite
  this.timeout(30000);

  let serverProcess;

  before(async function() {
    console.log('Checking if Memory-Efficient Attention server is running...');

    // Check if server is already running
    try {
      const response = await makeRequest('GET', `${SERVER_URL}/health`);
      if (response.statusCode === 200) {
        console.log('Memory-Efficient Attention server is running.');
      } else {
        console.warn('Memory-Efficient Attention server returned non-200 status code:', response.statusCode);
        this.skip();
      }
    } catch (error) {
      console.error('Memory-Efficient Attention server is not running. Please start it with: npm run start:memory-efficient-attention');
      this.skip();
    }
  });

  describe('Basic Functionality', function() {
    it('should respond to health check', async function() {
      const response = await makeRequest('GET', `${SERVER_URL}/health`);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.status).to.equal('healthy');
    });

    it('should list available tools', async function() {
      const response = await makeRequest('GET', `${SERVER_URL}/tools`);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.tools).to.be.an('array');
      expect(data.tools.length).to.be.greaterThan(0);

      // Verify specific tools are available
      const toolNames = data.tools.map(tool => tool.name);
      expect(toolNames).to.include('create_memory_efficient_config');
      expect(toolNames).to.include('profile_memory_usage');
      expect(toolNames).to.include('optimize_attention_chunks');
    });
  });

  describe('Memory Configuration', function() {
    let configId;

    it('should create a memory-efficient configuration', async function() {
      const config = {
        name: 'Test Memory Config',
        algorithm: 'flash_attention',
        maxMemoryUsage: 1024 * 1024 * 1024, // 1GB
        chunkSize: 1024,
        overlapping: true,
        overlapSize: 128,
        flashBlockSize: 64,
        flashCausal: true,
        flashDropout: 0.1
      };

      const response = await makeRequest('POST', `${SERVER_URL}/tools/create_memory_efficient_config`, config);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.success).to.be.true;
      expect(data.configId).to.be.a('string');

      configId = data.configId;
    });

    it('should retrieve the memory-efficient configuration', async function() {
      // Skip if config creation failed
      if (!configId) this.skip();

      const response = await makeRequest('GET', `${SERVER_URL}/tools/get_memory_efficient_config?id=${configId}`);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.success).to.be.true;
      expect(data.config.id).to.equal(configId);
      expect(data.config.name).to.equal('Test Memory Config');
      expect(data.config.algorithm).to.equal('flash_attention');
    });
  });

  describe('Memory Optimization', function() {
    let configId;
    let sessionId;

    before(async function() {
      // Create a config for these tests
      const config = {
        name: 'Optimization Test Config',
        algorithm: 'memory_efficient_attention',
        maxMemoryUsage: 2 * 1024 * 1024 * 1024, // 2GB
        chunkSize: 2048,
        overlapping: true,
        overlapSize: 256
      };

      const response = await makeRequest('POST', `${SERVER_URL}/tools/create_memory_efficient_config`, config);
      const data = JSON.parse(response.body);

      if (data.success) {
        configId = data.configId;
      }
    });

    it('should start a memory optimization session', async function() {
      // Skip if config creation failed
      if (!configId) this.skip();

      const sessionParams = {
        configId,
        modelName: 'test-model',
        batchSize: 16,
        sequenceLength: 2048,
        hiddenSize: 1024,
        numHeads: 16
      };

      const response = await makeRequest('POST', `${SERVER_URL}/tools/start_memory_optimization_session`, sessionParams);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.success).to.be.true;
      expect(data.sessionId).to.be.a('string');

      sessionId = data.sessionId;
    });

    it('should profile memory usage', async function() {
      // Skip if session creation failed
      if (!sessionId) this.skip();

      const profileParams = {
        sessionId,
        profileDuration: 5, // seconds
        samplingRate: 10, // Hz
        includeBreakdown: true
      };

      const response = await makeRequest('POST', `${SERVER_URL}/tools/profile_memory_usage`, profileParams);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.success).to.be.true;
      expect(data.profileId).to.be.a('string');
      expect(data.memoryUsage).to.be.an('object');
      expect(data.memoryUsage.peak).to.be.a('number');
      expect(data.memoryUsage.average).to.be.a('number');
    });

    it('should optimize attention chunks', async function() {
      // Skip if session creation failed
      if (!sessionId) this.skip();

      const optimizeParams = {
        sessionId,
        targetMemoryUsage: 1024 * 1024 * 1024, // 1GB
        optimizationStrategy: 'balanced',
        maxChunks: 16
      };

      const response = await makeRequest('POST', `${SERVER_URL}/tools/optimize_attention_chunks`, optimizeParams);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.success).to.be.true;
      expect(data.optimizedChunkSize).to.be.a('number');
      expect(data.estimatedMemoryUsage).to.be.a('number');
      expect(data.estimatedThroughput).to.be.a('number');
    });

    it('should analyze memory bottlenecks', async function() {
      // Skip if session creation failed
      if (!sessionId) this.skip();

      const analysisParams = {
        sessionId,
        analysisDepth: 'detailed',
        includeRecommendations: true
      };

      const response = await makeRequest('POST', `${SERVER_URL}/tools/analyze_memory_bottlenecks`, analysisParams);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.success).to.be.true;
      expect(data.bottlenecks).to.be.an('array');
      expect(data.recommendations).to.be.an('array');
    });
  });

  describe('Algorithm Comparison', function() {
    let flashAttentionId;
    let memoryEfficientId;

    before(async function() {
      // Create configs for comparison
      const flashConfig = {
        name: 'Flash Attention Config',
        algorithm: 'flash_attention',
        maxMemoryUsage: 1024 * 1024 * 1024,
        chunkSize: 1024,
        overlapping: false,
        flashBlockSize: 64
      };

      const memEfficientConfig = {
        name: 'Memory Efficient Config',
        algorithm: 'memory_efficient_attention',
        maxMemoryUsage: 1024 * 1024 * 1024,
        chunkSize: 2048,
        overlapping: true,
        overlapSize: 256
      };

      const flashResponse = await makeRequest('POST', `${SERVER_URL}/tools/create_memory_efficient_config`, flashConfig);
      const flashData = JSON.parse(flashResponse.body);

      const memResponse = await makeRequest('POST', `${SERVER_URL}/tools/create_memory_efficient_config`, memEfficientConfig);
      const memData = JSON.parse(memResponse.body);

      if (flashData.success) flashAttentionId = flashData.configId;
      if (memData.success) memoryEfficientId = memData.configId;
    });

    it('should compare memory algorithms', async function() {
      // Skip if configs creation failed
      if (!flashAttentionId || !memoryEfficientId) this.skip();

      const compareParams = {
        configIds: [flashAttentionId, memoryEfficientId],
        comparisonMetrics: ['memory_usage', 'throughput', 'accuracy'],
        testScenarios: [
          { batchSize: 1, sequenceLength: 1024, hiddenSize: 768 },
          { batchSize: 8, sequenceLength: 2048, hiddenSize: 1024 }
        ]
      };

      const response = await makeRequest('POST', `${SERVER_URL}/tools/compare_memory_algorithms`, compareParams);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.success).to.be.true;
      expect(data.comparison).to.be.an('object');
      expect(data.comparison.metrics).to.be.an('object');
      expect(data.comparison.summary).to.be.an('object');
    });
  });
});

// Helper function to make HTTP requests
function makeRequest(method, url, data = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

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

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}
