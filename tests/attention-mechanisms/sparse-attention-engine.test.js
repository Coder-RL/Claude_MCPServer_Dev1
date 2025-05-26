/**
 * Tests for the Sparse Attention Engine component
 *
 * These tests verify the functionality of the Sparse Attention Engine,
 * including its ability to create and apply sparse attention patterns,
 * optimize attention for efficiency, and analyze pattern effectiveness.
 */

import http from 'http';
import { spawn } from 'child_process';
import chai from 'chai';
const { expect } = chai;

// Test configuration
const SERVER_PORT = 8001;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const SERVER_STARTUP_TIMEOUT = 10000; // 10 seconds

describe('Sparse Attention Engine Tests', function() {
  // Increase timeout for the entire test suite
  this.timeout(30000);

  let serverProcess;

  before(async function() {
    console.log('Checking if Sparse Attention Engine server is running...');

    // Check if server is already running
    try {
      const response = await makeRequest('GET', `${SERVER_URL}/health`);
      if (response.statusCode === 200) {
        console.log('Sparse Attention Engine server is running.');
      } else {
        console.warn('Sparse Attention Engine server returned non-200 status code:', response.statusCode);
        this.skip();
      }
    } catch (error) {
      console.error('Sparse Attention Engine server is not running. Please start it with: npm run start:sparse-attention-engine');
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
      expect(toolNames).to.include('create_sparse_attention_config');
      expect(toolNames).to.include('generate_attention_pattern');
      expect(toolNames).to.include('apply_sparse_attention');
    });
  });

  describe('Sparse Attention Configuration', function() {
    let configId;

    it('should create a sparse attention configuration', async function() {
      const config = {
        name: 'Test Sparse Config',
        patternType: 'fixed',
        sparsityLevel: 0.8,
        blockSize: 16,
        headCount: 8,
        localWindowSize: 32,
        globalTokens: 4
      };

      const response = await makeRequest('POST', `${SERVER_URL}/tools/create_sparse_attention_config`, config);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.success).to.be.true;
      expect(data.configId).to.be.a('string');

      configId = data.configId;
    });

    it('should retrieve the sparse attention configuration', async function() {
      // Skip if config creation failed
      if (!configId) this.skip();

      const response = await makeRequest('GET', `${SERVER_URL}/tools/get_sparse_attention_config?id=${configId}`);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.success).to.be.true;
      expect(data.config.id).to.equal(configId);
      expect(data.config.name).to.equal('Test Sparse Config');
    });
  });

  describe('Pattern Generation and Application', function() {
    let configId;
    let patternId;

    before(async function() {
      // Create a config for these tests
      const config = {
        name: 'Pattern Test Config',
        patternType: 'fixed',
        sparsityLevel: 0.8,
        blockSize: 16,
        headCount: 8,
        localWindowSize: 32,
        globalTokens: 4
      };

      const response = await makeRequest('POST', `${SERVER_URL}/tools/create_sparse_attention_config`, config);
      const data = JSON.parse(response.body);

      if (data.success) {
        configId = data.configId;
      }
    });

    it('should generate an attention pattern', async function() {
      // Skip if config creation failed
      if (!configId) this.skip();

      const patternParams = {
        configId,
        sequenceLength: 128,
        batchSize: 4,
        patternName: 'test-pattern'
      };

      const response = await makeRequest('POST', `${SERVER_URL}/tools/generate_attention_pattern`, patternParams);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.success).to.be.true;
      expect(data.patternId).to.be.a('string');
      expect(data.sparsityAchieved).to.be.a('number');
      expect(data.sparsityAchieved).to.be.greaterThan(0.5);

      patternId = data.patternId;
    });

    it('should apply sparse attention to a matrix', async function() {
      // Skip if pattern generation failed
      if (!patternId) this.skip();

      // Create a sample attention matrix
      const attentionMatrix = generateSampleAttentionMatrix(128, 128);

      const applyParams = {
        patternId,
        attentionMatrix,
        optimizationLevel: 'medium'
      };

      const response = await makeRequest('POST', `${SERVER_URL}/tools/apply_sparse_attention`, applyParams);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.success).to.be.true;
      expect(data.sparseMatrix).to.be.an('array');
      expect(data.memoryReduction).to.be.a('number');
      expect(data.computationalSavings).to.be.a('number');
    });

    it('should analyze pattern effectiveness', async function() {
      // Skip if pattern generation failed
      if (!patternId) this.skip();

      const analysisParams = {
        patternId,
        analysisMetrics: ['sparsity', 'coverage', 'efficiency']
      };

      const response = await makeRequest('POST', `${SERVER_URL}/tools/analyze_pattern_effectiveness`, analysisParams);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.success).to.be.true;
      expect(data.analysis).to.be.an('object');
      expect(data.analysis.sparsity).to.be.a('number');
      expect(data.analysis.coverage).to.be.a('number');
      expect(data.analysis.efficiency).to.be.a('number');
    });
  });

  describe('Performance Tests', function() {
    it('should handle large attention matrices', async function() {
      // Create a large attention matrix (1000x1000)
      const largeMatrix = generateSampleAttentionMatrix(1000, 1000);

      const config = {
        name: 'Large Matrix Config',
        patternType: 'fixed',
        sparsityLevel: 0.9,
        blockSize: 32,
        headCount: 16,
        localWindowSize: 64,
        globalTokens: 8
      };

      // First create a config
      const configResponse = await makeRequest('POST', `${SERVER_URL}/tools/create_sparse_attention_config`, config);
      const configData = JSON.parse(configResponse.body);

      if (!configData.success) this.skip();

      // Then generate a pattern
      const patternParams = {
        configId: configData.configId,
        sequenceLength: 1000,
        batchSize: 1,
        patternName: 'large-test-pattern'
      };

      const patternResponse = await makeRequest('POST', `${SERVER_URL}/tools/generate_attention_pattern`, patternParams);
      const patternData = JSON.parse(patternResponse.body);

      if (!patternData.success) this.skip();

      // Finally apply the pattern
      const startTime = Date.now();

      const applyParams = {
        patternId: patternData.patternId,
        attentionMatrix: largeMatrix,
        optimizationLevel: 'high'
      };

      const applyResponse = await makeRequest('POST', `${SERVER_URL}/tools/apply_sparse_attention`, applyParams);
      const applyData = JSON.parse(applyResponse.body);

      const duration = Date.now() - startTime;

      expect(applyData.success).to.be.true;
      expect(duration).to.be.lessThan(10000); // Should process in under 10 seconds
      expect(applyData.memoryReduction).to.be.greaterThan(0.7); // Should achieve at least 70% memory reduction
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

// Helper function to generate a sample attention matrix
function generateSampleAttentionMatrix(rows, cols) {
  const matrix = [];
  for (let i = 0; i < rows; i++) {
    const row = [];
    for (let j = 0; j < cols; j++) {
      // Generate a pattern: diagonal with some noise
      let value = 0;
      if (i === j) {
        value = 0.8 + (Math.random() * 0.2); // Strong diagonal
      } else if (Math.abs(i - j) <= 1) {
        value = 0.3 + (Math.random() * 0.3); // Near diagonal
      } else {
        value = Math.random() * 0.1; // Background noise
      }
      row.push(value);
    }
    matrix.push(row);
  }
  return matrix;
}
