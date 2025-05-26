/**
 * Tests for the Attention Pattern Analyzer component
 *
 * These tests verify the functionality of the Attention Pattern Analyzer,
 * including its ability to analyze attention patterns, detect anomalies,
 * and generate insights.
 */

import http from 'http';
import { spawn } from 'child_process';
import chai from 'chai';
const { expect } = chai;

// Test configuration
const SERVER_PORT = 8000;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const SERVER_STARTUP_TIMEOUT = 10000; // 10 seconds

describe('Attention Pattern Analyzer Tests', function() {
  // Increase timeout for the entire test suite
  this.timeout(30000);

  let serverProcess;

  before(async function() {
    console.log('Checking if Attention Pattern Analyzer server is running...');

    // Check if server is already running
    try {
      const response = await makeRequest('GET', `${SERVER_URL}/health`);
      if (response.statusCode === 200) {
        console.log('Attention Pattern Analyzer server is running.');
      } else {
        console.warn('Attention Pattern Analyzer server returned non-200 status code:', response.statusCode);
        this.skip();
      }
    } catch (error) {
      console.error('Attention Pattern Analyzer server is not running. Please start it with: npm run start:attention-pattern-analyzer');
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
      expect(toolNames).to.include('create_pattern_analysis_config');
      expect(toolNames).to.include('start_pattern_analysis_session');
      expect(toolNames).to.include('analyze_attention_patterns');
    });
  });

  describe('Pattern Analysis', function() {
    let configId;
    let sessionId;

    it('should create a pattern analysis configuration', async function() {
      const config = {
        name: 'Test Configuration',
        analysisType: 'batch',
        patternTypes: ['focused', 'dispersed', 'structured'],
        analysisParams: {
          sensitivityThreshold: 0.1,
          temporalWindowSize: 50,
          spatialResolution: 1
        }
      };

      const response = await makeRequest('POST', `${SERVER_URL}/tools/create_pattern_analysis_config`, config);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.success).to.be.true;
      expect(data.configId).to.be.a('string');

      configId = data.configId;
    });

    it('should start a pattern analysis session', async function() {
      // Skip if config creation failed
      if (!configId) this.skip();

      const sessionParams = {
        configId,
        modelName: 'test-model',
        taskType: 'classification',
        datasetInfo: {
          numLayers: 4,
          numHeads: 8
        }
      };

      const response = await makeRequest('POST', `${SERVER_URL}/tools/start_pattern_analysis_session`, sessionParams);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.success).to.be.true;
      expect(data.sessionId).to.be.a('string');

      sessionId = data.sessionId;
    });

    it('should analyze attention patterns', async function() {
      // Skip if session creation failed
      if (!sessionId) this.skip();

      // Create a sample attention matrix
      const attentionWeights = generateSampleAttentionMatrix(8, 8);

      const analysisParams = {
        sessionId,
        attentionWeights,
        layerIndex: 0,
        headIndex: 0,
        metadata: {
          inputType: 'test'
        }
      };

      const response = await makeRequest('POST', `${SERVER_URL}/tools/analyze_attention_patterns`, analysisParams);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.success).to.be.true;
      expect(data.layerIndex).to.equal(0);
      expect(data.detectedPatterns).to.be.an('array');
      expect(data.detectedPatterns.length).to.be.greaterThan(0);
    });

    it('should detect pattern anomalies', async function() {
      // Skip if session creation failed
      if (!sessionId) this.skip();

      const anomalyParams = {
        sessionId,
        detectorTypes: ['statistical', 'pattern', 'entropy'],
        sensitivityLevel: 'medium'
      };

      const response = await makeRequest('POST', `${SERVER_URL}/tools/detect_pattern_anomalies`, anomalyParams);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.success).to.be.true;
      expect(data.sessionId).to.equal(sessionId);
      expect(data.detectorTypesUsed).to.be.an('array');
    });

    it('should generate pattern insights', async function() {
      // Skip if session creation failed
      if (!sessionId) this.skip();

      const insightParams = {
        sessionId,
        insightCategories: ['efficiency', 'attention_quality', 'model_behavior'],
        includeRecommendations: true
      };

      const response = await makeRequest('POST', `${SERVER_URL}/tools/generate_pattern_insights`, insightParams);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.success).to.be.true;
      expect(data.sessionId).to.equal(sessionId);
      expect(data.categoriesAnalyzed).to.be.an('array');
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
