/**
 * Performance Tests for MCP Server Components
 *
 * These tests evaluate the performance of the components under load,
 * including large attention matrices, memory usage, and token counting accuracy.
 */

import http from 'http';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
const REPORT_DIR = path.join(__dirname, '..', 'reports');

// Create reports directory if it doesn't exist
if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

// Main performance test function
async function runPerformanceTests() {
  console.log('🚀 Starting Performance Tests');
  console.log('============================');

  const results = {
    timestamp: new Date().toISOString(),
    tests: [],
    summary: {
      totalTests: 0,
      passedTests: 0,
      failedTests: 0
    }
  };

  try {
    // Start all servers
    await startServers();

    // Run tests
    await testLargeAttentionMatrices(results);
    await testMemoryUsage(results);
    await testTokenCounting(results);
    await testConcurrentRequests(results);

    // Generate summary
    results.summary.totalTests = results.tests.length;
    results.summary.passedTests = results.tests.filter(t => t.passed).length;
    results.summary.failedTests = results.tests.filter(t => !t.passed).length;

    // Save results
    const reportFile = path.join(REPORT_DIR, `performance-report-${Date.now()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(results, null, 2));
    console.log(`\n📊 Performance report saved to ${reportFile}`);

  } catch (error) {
    console.error('❌ Error running performance tests:', error);
  } finally {
    // Shutdown all servers
    await stopServers();
  }

  // Print summary
  console.log('\n📋 Performance Test Summary');
  console.log('---------------------------');
  console.log(`Total Tests: ${results.summary.totalTests}`);
  console.log(`Passed: ${results.summary.passedTests} ✅`);
  console.log(`Failed: ${results.summary.failedTests} ❌`);

  // Return exit code based on test results
  return results.summary.failedTests > 0 ? 1 : 0;
}

// Check if servers are running
async function startServers() {
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
    throw new Error('No servers are running. Please start the servers with: npm run start:week-14 and npm run start:week-15');
  } else {
    console.log(`${runningServers.length} servers are running: ${runningServers.join(', ')}`);
  }
}

// No need to stop servers since we didn't start them
async function stopServers() {
  console.log('Servers were not started by this script, so no need to stop them.');
}

// Test large attention matrices
async function testLargeAttentionMatrices(results) {
  console.log('\n🧪 Testing Large Attention Matrices');
  console.log('----------------------------------');

  try {
    // Check if sparse attention engine is running
    try {
      await makeRequest('GET', `${SERVERS.sparseAttentionEngine.url}/health`);
    } catch (error) {
      console.log('❌ Sparse Attention Engine not available, skipping test');
      results.tests.push({
        name: 'Large Attention Matrices',
        passed: false,
        error: 'Server not available',
        details: {}
      });
      return;
    }

    // Create a sparse attention configuration
    const config = {
      name: 'Performance Test Config',
      patternType: 'fixed',
      sparsityLevel: 0.9,
      blockSize: 32,
      headCount: 16,
      localWindowSize: 64,
      globalTokens: 8
    };

    const configResponse = await makeRequest('POST', `${SERVERS.sparseAttentionEngine.url}/tools/create_sparse_attention_config`, config);
    const configData = JSON.parse(configResponse.body);

    if (!configData.success) {
      throw new Error('Failed to create sparse attention configuration');
    }

    // Generate a pattern for a large matrix
    const patternParams = {
      configId: configData.configId,
      sequenceLength: 1000,
      batchSize: 1,
      patternName: 'performance-test-pattern'
    };

    const patternResponse = await makeRequest('POST', `${SERVERS.sparseAttentionEngine.url}/tools/generate_attention_pattern`, patternParams);
    const patternData = JSON.parse(patternResponse.body);

    if (!patternData.success) {
      throw new Error('Failed to generate attention pattern');
    }

    // Create a large attention matrix (1000x1000)
    console.log('Generating 1000x1000 attention matrix...');
    const largeMatrix = generateSampleAttentionMatrix(1000, 1000);

    // Apply the pattern and measure performance
    console.log('Applying sparse attention pattern...');
    const startTime = Date.now();

    const applyParams = {
      patternId: patternData.patternId,
      attentionMatrix: largeMatrix,
      optimizationLevel: 'high'
    };

    const applyResponse = await makeRequest('POST', `${SERVERS.sparseAttentionEngine.url}/tools/apply_sparse_attention`, applyParams);
    const applyData = JSON.parse(applyResponse.body);

    const duration = Date.now() - startTime;

    if (!applyData.success) {
      throw new Error('Failed to apply sparse attention');
    }

    console.log(`✅ Processed 1000x1000 matrix in ${duration}ms`);
    console.log(`   Memory reduction: ${applyData.memoryReduction * 100}%`);
    console.log(`   Computational savings: ${applyData.computationalSavings * 100}%`);

    results.tests.push({
      name: 'Large Attention Matrices',
      passed: true,
      duration: duration,
      details: {
        matrixSize: '1000x1000',
        memoryReduction: applyData.memoryReduction,
        computationalSavings: applyData.computationalSavings
      }
    });

  } catch (error) {
    console.log(`❌ Large Attention Matrices test failed: ${error.message}`);
    results.tests.push({
      name: 'Large Attention Matrices',
      passed: false,
      error: error.message,
      details: {}
    });
  }
}

// Test memory usage
async function testMemoryUsage(results) {
  console.log('\n🧪 Testing Memory Usage');
  console.log('----------------------');

  try {
    // Check if memory-efficient attention is running
    try {
      await makeRequest('GET', `${SERVERS.memoryEfficientAttention.url}/health`);
    } catch (error) {
      console.log('❌ Memory-Efficient Attention not available, skipping test');
      results.tests.push({
        name: 'Memory Usage',
        passed: false,
        error: 'Server not available',
        details: {}
      });
      return;
    }

    // Create a memory-efficient configuration
    const config = {
      name: 'Memory Performance Test',
      algorithm: 'flash_attention',
      maxMemoryUsage: 2 * 1024 * 1024 * 1024, // 2GB
      chunkSize: 2048,
      overlapping: true,
      overlapSize: 256
    };

    const configResponse = await makeRequest('POST', `${SERVERS.memoryEfficientAttention.url}/tools/create_memory_efficient_config`, config);
    const configData = JSON.parse(configResponse.body);

    if (!configData.success) {
      throw new Error('Failed to create memory-efficient configuration');
    }

    // Start a memory optimization session
    const sessionParams = {
      configId: configData.configId,
      modelName: 'performance-test-model',
      batchSize: 16,
      sequenceLength: 4096,
      hiddenSize: 1024,
      numHeads: 16
    };

    const sessionResponse = await makeRequest('POST', `${SERVERS.memoryEfficientAttention.url}/tools/start_memory_optimization_session`, sessionParams);
    const sessionData = JSON.parse(sessionResponse.body);

    if (!sessionData.success) {
      throw new Error('Failed to start memory optimization session');
    }

    // Profile memory usage
    console.log('Profiling memory usage...');
    const profileParams = {
      sessionId: sessionData.sessionId,
      profileDuration: 5, // seconds
      samplingRate: 10, // Hz
      includeBreakdown: true
    };

    const profileResponse = await makeRequest('POST', `${SERVERS.memoryEfficientAttention.url}/tools/profile_memory_usage`, profileParams);
    const profileData = JSON.parse(profileResponse.body);

    if (!profileData.success) {
      throw new Error('Failed to profile memory usage');
    }

    console.log(`✅ Memory profiling completed`);
    console.log(`   Peak memory: ${formatBytes(profileData.memoryUsage.peak)}`);
    console.log(`   Average memory: ${formatBytes(profileData.memoryUsage.average)}`);

    results.tests.push({
      name: 'Memory Usage',
      passed: true,
      details: {
        peakMemory: profileData.memoryUsage.peak,
        averageMemory: profileData.memoryUsage.average,
        breakdown: profileData.memoryUsage.breakdown
      }
    });

  } catch (error) {
    console.log(`❌ Memory Usage test failed: ${error.message}`);
    results.tests.push({
      name: 'Memory Usage',
      passed: false,
      error: error.message,
      details: {}
    });
  }
}

// Test token counting accuracy
async function testTokenCounting(results) {
  console.log('\n🧪 Testing Token Counting Accuracy');
  console.log('--------------------------------');

  try {
    // Check if language model interface is running
    try {
      await makeRequest('GET', `${SERVERS.languageModelInterface.url}/health`);
    } catch (error) {
      console.log('❌ Language Model Interface not available, skipping test');
      results.tests.push({
        name: 'Token Counting',
        passed: false,
        error: 'Server not available',
        details: {}
      });
      return;
    }

    // Register a model
    const model = {
      name: 'Token Test Model',
      provider: 'openai',
      template: 'gpt-4'
    };

    const modelResponse = await makeRequest('POST', `${SERVERS.languageModelInterface.url}/tools/registerModel`, model);
    const modelData = JSON.parse(modelResponse.body);

    if (!modelData.success) {
      throw new Error('Failed to register model');
    }

    // Test texts of different lengths
    const testTexts = [
      'This is a short sentence.',
      'This is a medium length paragraph that contains multiple sentences. It should have more tokens than the previous example. We want to test the token counting functionality with different text lengths.',
      generateLongText(1000) // Generate a long text with approximately 1000 words
    ];

    const results = [];

    for (let i = 0; i < testTexts.length; i++) {
      const text = testTexts[i];
      console.log(`Counting tokens for text ${i+1} (${text.length} characters)...`);

      const tokenParams = {
        modelId: modelData.id,
        text: text
      };

      const tokenResponse = await makeRequest('POST', `${SERVERS.languageModelInterface.url}/tools/countTokens`, tokenParams);
      const tokenData = JSON.parse(tokenResponse.body);

      if (!tokenData.success) {
        throw new Error(`Failed to count tokens for text ${i+1}`);
      }

      results.push({
        textLength: text.length,
        tokenCount: tokenData.tokenCount
      });

      console.log(`   Text ${i+1}: ${tokenData.tokenCount} tokens`);
    }

    console.log('✅ Token counting completed for all test texts');

    results.tests.push({
      name: 'Token Counting',
      passed: true,
      details: {
        results: results
      }
    });

  } catch (error) {
    console.log(`❌ Token Counting test failed: ${error.message}`);
    results.tests.push({
      name: 'Token Counting',
      passed: false,
      error: error.message,
      details: {}
    });
  }
}

// Test concurrent requests
async function testConcurrentRequests(results) {
  console.log('\n🧪 Testing Concurrent Requests');
  console.log('----------------------------');

  try {
    // Check if attention pattern analyzer is running
    try {
      await makeRequest('GET', `${SERVERS.attentionPatternAnalyzer.url}/health`);
    } catch (error) {
      console.log('❌ Attention Pattern Analyzer not available, skipping test');
      results.tests.push({
        name: 'Concurrent Requests',
        passed: false,
        error: 'Server not available',
        details: {}
      });
      return;
    }

    // Create a pattern analysis configuration
    const config = {
      name: 'Concurrency Test Config',
      analysisType: 'batch',
      patternTypes: ['focused', 'dispersed', 'structured'],
      analysisParams: {
        sensitivityThreshold: 0.1,
        temporalWindowSize: 50,
        spatialResolution: 1
      }
    };

    const configResponse = await makeRequest('POST', `${SERVERS.attentionPatternAnalyzer.url}/tools/create_pattern_analysis_config`, config);
    const configData = JSON.parse(configResponse.body);

    if (!configData.success) {
      throw new Error('Failed to create pattern analysis configuration');
    }

    // Start a pattern analysis session
    const sessionParams = {
      configId: configData.configId,
      modelName: 'concurrency-test-model',
      taskType: 'concurrency-test',
      datasetInfo: {
        numLayers: 4,
        numHeads: 8
      }
    };

    const sessionResponse = await makeRequest('POST', `${SERVERS.attentionPatternAnalyzer.url}/tools/start_pattern_analysis_session`, sessionParams);
    const sessionData = JSON.parse(sessionResponse.body);

    if (!sessionData.success) {
      throw new Error('Failed to start pattern analysis session');
    }

    // Run concurrent requests
    const numConcurrentRequests = 10;
    console.log(`Running ${numConcurrentRequests} concurrent requests...`);

    const startTime = Date.now();
    const requests = [];

    for (let i = 0; i < numConcurrentRequests; i++) {
      // Create a sample attention matrix
      const attentionWeights = generateSampleAttentionMatrix(32, 32);

      const analysisParams = {
        sessionId: sessionData.sessionId,
        attentionWeights,
        layerIndex: i % 4, // Distribute across layers
        headIndex: i % 8, // Distribute across heads
        metadata: {
          requestId: i
        }
      };

      requests.push(makeRequest('POST', `${SERVERS.attentionPatternAnalyzer.url}/tools/analyze_attention_patterns`, analysisParams));
    }

    // Wait for all requests to complete
    const responses = await Promise.all(requests);
    const duration = Date.now() - startTime;

    // Verify all responses were successful
    const successfulResponses = responses.filter(response => {
      const data = JSON.parse(response.body);
      return data.success === true;
    }).length;

    console.log(`✅ Completed ${successfulResponses}/${numConcurrentRequests} concurrent requests in ${duration}ms`);
    console.log(`   Average response time: ${Math.round(duration / numConcurrentRequests)}ms per request`);

    results.tests.push({
      name: 'Concurrent Requests',
      passed: successfulResponses === numConcurrentRequests,
      duration: duration,
      details: {
        numRequests: numConcurrentRequests,
        successfulRequests: successfulResponses,
        averageResponseTime: Math.round(duration / numConcurrentRequests)
      }
    });

  } catch (error) {
    console.log(`❌ Concurrent Requests test failed: ${error.message}`);
    results.tests.push({
      name: 'Concurrent Requests',
      passed: false,
      error: error.message,
      details: {}
    });
  }
}

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

// Helper function to generate a long text
function generateLongText(wordCount) {
  const words = [
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'I',
    'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
    'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
    'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
    'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
    'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take',
    'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other',
    'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also'
  ];

  let text = '';
  for (let i = 0; i < wordCount; i++) {
    const word = words[Math.floor(Math.random() * words.length)];
    text += word + ' ';

    // Add some punctuation occasionally
    if (i % 15 === 14) text += '. ';
    else if (i % 7 === 6) text += ', ';
  }

  return text;
}

// Helper function to format bytes
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Run the tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runPerformanceTests().then(exitCode => {
    process.exit(exitCode);
  });
}

export { runPerformanceTests };
