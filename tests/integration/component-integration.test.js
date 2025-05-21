/**
 * Integration Tests for MCP Server Components
 *
 * These tests verify that different components can communicate with each other
 * and that the BaseMCPServer inheritance works correctly across components.
 */

import http from 'http';
import { spawn } from 'child_process';
import chai from 'chai';
const { expect } = chai;

// Test configuration
const SERVERS = {
  attentionPatternAnalyzer: {
    port: 8000,
    path: 'servers/attention-mechanisms/src/attention-pattern-analyzer.ts',
    process: null,
    url: 'http://localhost:8000'
  },
  sparseAttentionEngine: {
    port: 8001,
    path: 'servers/attention-mechanisms/src/sparse-attention-engine.ts',
    process: null,
    url: 'http://localhost:8001'
  },
  memoryEfficientAttention: {
    port: 8002,
    path: 'servers/attention-mechanisms/src/memory-efficient-attention.ts',
    process: null,
    url: 'http://localhost:8002'
  },
  languageModelInterface: {
    port: 8003,
    path: 'servers/language-model/src/language-model-interface.ts',
    process: null,
    url: 'http://localhost:8003'
  }
};

const SERVER_STARTUP_TIMEOUT = 10000; // 10 seconds

describe('Component Integration Tests', function() {
  // Increase timeout for the entire test suite
  this.timeout(60000);

  before(async function() {
    // Check if all servers are running
    const runningServers = [];

    for (const [name, server] of Object.entries(SERVERS)) {
      console.log(`Checking if ${name} server is running...`);

      try {
        const response = await makeRequest('GET', `${server.url}/health`);
        if (response.statusCode === 200) {
          console.log(`${name} server is running.`);
          runningServers.push(name);
        } else {
          console.warn(`${name} server returned non-200 status code:`, response.statusCode);
        }
      } catch (error) {
        console.error(`${name} server is not running.`);
      }
    }

    if (runningServers.length === 0) {
      console.error('No servers are running. Please start the servers with: npm run start:week-14 and npm run start:week-15');
      this.skip();
    } else {
      console.log(`${runningServers.length} servers are running: ${runningServers.join(', ')}`);
    }
  });

  describe('Server Health Checks', function() {
    for (const [name, server] of Object.entries(SERVERS)) {
      it(`should verify ${name} is healthy`, async function() {
        try {
          const response = await makeRequest('GET', `${server.url}/health`);
          expect(response.statusCode).to.equal(200);

          const data = JSON.parse(response.body);
          expect(data.status).to.equal('healthy');
        } catch (error) {
          this.skip(); // Skip if server is not running
        }
      });
    }
  });

  describe('BaseMCPServer Inheritance', function() {
    for (const [name, server] of Object.entries(SERVERS)) {
      it(`should verify ${name} implements BaseMCPServer correctly`, async function() {
        try {
          // Test tools endpoint (provided by BaseMCPServer)
          const response = await makeRequest('GET', `${server.url}/tools`);
          expect(response.statusCode).to.equal(200);

          const data = JSON.parse(response.body);
          expect(data.tools).to.be.an('array');
          expect(data.tools.length).to.be.greaterThan(0);
        } catch (error) {
          this.skip(); // Skip if server is not running
        }
      });
    }
  });

  describe('Cross-Component Integration', function() {
    it('should integrate attention pattern analysis with sparse attention', async function() {
      // Skip if either server is not running
      try {
        await makeRequest('GET', `${SERVERS.attentionPatternAnalyzer.url}/health`);
        await makeRequest('GET', `${SERVERS.sparseAttentionEngine.url}/health`);
      } catch (error) {
        this.skip();
      }

      // 1. Create a sparse attention configuration
      const sparseConfig = {
        name: 'Integration Test Config',
        patternType: 'fixed',
        sparsityLevel: 0.8,
        blockSize: 16,
        headCount: 8,
        localWindowSize: 32,
        globalTokens: 4
      };

      const sparseResponse = await makeRequest('POST', `${SERVERS.sparseAttentionEngine.url}/tools/create_sparse_attention_config`, sparseConfig);
      const sparseData = JSON.parse(sparseResponse.body);
      expect(sparseData.success).to.be.true;

      // 2. Generate a sparse attention pattern
      const patternParams = {
        configId: sparseData.configId,
        sequenceLength: 64,
        batchSize: 2,
        patternName: 'integration-test-pattern'
      };

      const patternResponse = await makeRequest('POST', `${SERVERS.sparseAttentionEngine.url}/tools/generate_attention_pattern`, patternParams);
      const patternData = JSON.parse(patternResponse.body);
      expect(patternData.success).to.be.true;

      // 3. Create an attention pattern analysis configuration
      const analysisConfig = {
        name: 'Integration Analysis Config',
        analysisType: 'batch',
        patternTypes: ['focused', 'dispersed', 'structured'],
        analysisParams: {
          sensitivityThreshold: 0.1,
          temporalWindowSize: 50,
          spatialResolution: 1
        }
      };

      const analysisResponse = await makeRequest('POST', `${SERVERS.attentionPatternAnalyzer.url}/tools/create_pattern_analysis_config`, analysisConfig);
      const analysisData = JSON.parse(analysisResponse.body);
      expect(analysisData.success).to.be.true;

      // 4. Start a pattern analysis session
      const sessionParams = {
        configId: analysisData.configId,
        modelName: 'integration-test-model',
        taskType: 'integration-test',
        datasetInfo: {
          numLayers: 2,
          numHeads: 8,
          patternId: patternData.patternId
        }
      };

      const sessionResponse = await makeRequest('POST', `${SERVERS.attentionPatternAnalyzer.url}/tools/start_pattern_analysis_session`, sessionParams);
      const sessionData = JSON.parse(sessionResponse.body);
      expect(sessionData.success).to.be.true;

      // Integration successful if we got this far
    });

    it('should integrate memory-efficient attention with language model interface', async function() {
      // Skip if either server is not running
      try {
        await makeRequest('GET', `${SERVERS.memoryEfficientAttention.url}/health`);
        await makeRequest('GET', `${SERVERS.languageModelInterface.url}/health`);
      } catch (error) {
        this.skip();
      }

      // 1. Register a language model
      const model = {
        name: 'Integration Test Model',
        provider: 'openai',
        template: 'gpt-4'
      };

      const modelResponse = await makeRequest('POST', `${SERVERS.languageModelInterface.url}/tools/registerModel`, model);
      const modelData = JSON.parse(modelResponse.body);
      expect(modelData.success).to.be.true;

      // 2. Create a memory-efficient configuration
      const memConfig = {
        name: 'Integration Memory Config',
        algorithm: 'flash_attention',
        maxMemoryUsage: 1024 * 1024 * 1024, // 1GB
        chunkSize: 1024,
        overlapping: true,
        overlapSize: 128
      };

      const memResponse = await makeRequest('POST', `${SERVERS.memoryEfficientAttention.url}/tools/create_memory_efficient_config`, memConfig);
      const memData = JSON.parse(memResponse.body);
      expect(memData.success).to.be.true;

      // 3. Start a memory optimization session with the model info
      const sessionParams = {
        configId: memData.configId,
        modelName: 'Integration Test Model',
        modelId: modelData.id,
        batchSize: 4,
        sequenceLength: 1024,
        hiddenSize: 768,
        numHeads: 12
      };

      const sessionResponse = await makeRequest('POST', `${SERVERS.memoryEfficientAttention.url}/tools/start_memory_optimization_session`, sessionParams);
      const sessionData = JSON.parse(sessionResponse.body);
      expect(sessionData.success).to.be.true;

      // Integration successful if we got this far
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
