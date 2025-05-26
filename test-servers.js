#!/usr/bin/env node

// Test script to verify all STDIO servers work correctly
async function testServer(serverName, serverPath, configFactory) {
  try {
    // Use dynamic import for ES modules
    const module = await import(serverPath);
    const ServerClass = module.default || module[Object.keys(module)[0]];
    
    if (!ServerClass) {
      throw new Error('No server class found in module');
    }
    
    // Create server instance
    const config = configFactory();
    const server = new ServerClass(config);
    
    // Verify it extends StandardMCPServer
    if (!server.setupTools || typeof server.setupTools !== 'function') {
      throw new Error('Server missing setupTools method');
    }
    
    if (!server.handleToolCall || typeof server.handleToolCall !== 'function') {
      throw new Error('Server missing handleToolCall method');
    }
    
    // Test setupTools
    await server.setupTools();
    
    // Test basic tool call (if server has any tools)
    if (server.tools && server.tools.size > 0) {
      const firstTool = Array.from(server.tools.keys())[0];
      const result = await server.handleToolCall(firstTool, {});
      if (!result || !result.content) {
        throw new Error('Tool call returned invalid result');
      }
    }
    
    console.log(`✅ ${serverName} - All tests passed`);
    return true;
    
  } catch (error) {
    console.log(`❌ ${serverName} - ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('🧪 Testing STDIO MCP Servers...\n');
  
  const servers = [
    {
      name: 'Visualization Insights',
      path: './servers/visualization-insights/src/index.ts',
      config: () => ({
        name: 'test-viz',
        version: '1.0.0',
        host: 'localhost',
        port: 8010,
        maxConcurrentRenders: 5,
        cacheSize: 100,
        outputPath: '/tmp'
      })
    },
    {
      name: 'AI Integration',
      path: './servers/ai-integration/src/index.ts', 
      config: () => ({
        name: 'test-ai',
        version: '1.0.0',
        host: 'localhost',
        port: 8011,
        modelStoragePath: '/tmp',
        computeResources: {
          maxCpuCores: 4,
          maxMemoryGB: 8,
          gpuEnabled: false
        }
      })
    },
    {
      name: 'Advanced AI Capabilities',
      path: './servers/advanced-ai-capabilities/src/index.ts',
      config: () => ({
        name: 'test-advanced',
        version: '1.0.0',
        features: {
          neuralNetworkController: true,
          gradientOptimizer: true,
          lossFunctionManager: true,
          activationOptimizer: true,
          hyperparameterTuner: true
        }
      })
    },
    {
      name: 'Inference Enhancement',
      path: './servers/inference-enhancement/src/index.ts',
      config: () => ({
        name: 'test-inference',
        version: '1.0.0',
        features: {
          enablePerformanceMonitoring: false,
          enableHealthCheck: true,
          maxEmbeddingsPerRequest: 100,
          defaultSearchLimit: 10
        },
        embedding: {
          provider: 'mock',
          model: 'test-model',
          dimensions: 1536
        }
      })
    }
  ];
  
  let passed = 0;
  let total = servers.length;
  
  for (const server of servers) {
    const success = await testServer(server.name, server.path, server.config);
    if (success) passed++;
  }
  
  console.log(`\n📊 Test Results: ${passed}/${total} servers passed`);
  
  if (passed === total) {
    console.log('🎉 All STDIO servers are working correctly!');
  } else {
    console.log('⚠️  Some servers need attention');
  }
}

runTests().catch(console.error);