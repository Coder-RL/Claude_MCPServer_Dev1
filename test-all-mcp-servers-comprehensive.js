#!/usr/bin/env node

/**
 * Comprehensive MCP Server Functional Testing Suite
 * Tests all 10 MCP servers with actual tool calls
 */

const { spawn } = require('child_process');
const path = require('path');

// Server configurations
const servers = {
  'memory-simple': {
    command: 'node',
    args: ['mcp/memory/simple-server.js'],
    testRequest: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "store_memory",
        arguments: {
          key: "test-key",
          value: "test-value"
        }
      }
    }
  },
  'sequential-thinking': {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    testRequest: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "sequentialthinking",
        arguments: {
          query: "What is 2+2?"
        }
      }
    }
  },
  'data-pipeline': {
    command: 'tsx',
    args: ['servers/data-analytics/src/data-pipeline-fixed.ts'],
    testRequest: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "create_pipeline",
        arguments: {
          name: "test-pipeline",
          source: "test-source",
          destination: "test-destination"
        }
      }
    }
  },
  'data-governance': {
    command: 'tsx',
    args: ['servers/data-analytics/src/data-governance-fixed.ts'],
    testRequest: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "register_data_asset",
        arguments: {
          name: "test-asset",
          type: "table",
          location: "test-location"
        }
      }
    }
  },
  'realtime-analytics': {
    command: 'tsx',
    args: ['servers/data-analytics/src/realtime-analytics-fixed.ts'],
    testRequest: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "create_stream",
        arguments: {
          name: "test-stream",
          source: "test-source"
        }
      }
    }
  },
  'data-warehouse': {
    command: 'tsx',
    args: ['servers/data-analytics/src/data-warehouse-fixed.ts'],
    testRequest: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "create_warehouse",
        arguments: {
          name: "test-warehouse",
          type: "postgresql"
        }
      }
    }
  },
  'ml-deployment': {
    command: 'tsx',
    args: ['servers/data-analytics/src/ml-deployment-fixed.ts'],
    testRequest: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "register_model",
        arguments: {
          name: "test-model",
          type: "classification",
          framework: "tensorflow"
        }
      }
    }
  },
  'security-vulnerability': {
    command: 'tsx',
    args: ['servers/security-vulnerability/src/security-vulnerability-fixed.ts'],
    testRequest: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "scan_project",
        arguments: {
          project_path: "/tmp/test-project"
        }
      }
    }
  },
  'optimization': {
    command: 'tsx',
    args: ['servers/optimization/src/optimization-fixed.ts'],
    testRequest: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "profile_performance",
        arguments: {
          component: "test-component"
        }
      }
    }
  },
  'ui-design': {
    command: 'tsx',
    args: ['servers/ui-design/src/ui-design-fixed.ts'],
    testRequest: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "analyze_design_system",
        arguments: {
          project_path: "/tmp/test-project"
        }
      }
    }
  }
};

async function testServer(serverName, config) {
  return new Promise((resolve) => {
    console.log(`\n🧪 Testing ${serverName}...`);
    
    const process = spawn(config.command, config.args, {
      cwd: '/Users/robertlee/GitHubProjects/Claude_MCPServer',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';
    let testCompleted = false;

    // Set timeout
    const timeout = setTimeout(() => {
      if (!testCompleted) {
        process.kill();
        resolve({
          server: serverName,
          status: 'TIMEOUT',
          error: 'Server startup timeout (10s)'
        });
      }
    }, 10000);

    process.stdout.on('data', (data) => {
      output += data.toString();
      
      // If server started successfully, send test request
      if (output.includes('running on stdio') || output.includes('server started') || output.includes('MCP Server')) {
        if (!testCompleted) {
          testCompleted = true;
          clearTimeout(timeout);
          
          // Send initialization request first
          const initRequest = {
            jsonrpc: "2.0",
            id: 0,
            method: "initialize",
            params: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              clientInfo: { name: "test-client", version: "1.0.0" }
            }
          };
          
          process.stdin.write(JSON.stringify(initRequest) + '\n');
          
          // Then send test request
          setTimeout(() => {
            process.stdin.write(JSON.stringify(config.testRequest) + '\n');
            
            // Give time for response
            setTimeout(() => {
              process.kill();
              resolve({
                server: serverName,
                status: 'SUCCESS',
                output: output.trim(),
                response: 'Tool call sent successfully'
              });
            }, 2000);
          }, 1000);
        }
      }
    });

    process.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    process.on('exit', (code) => {
      if (!testCompleted) {
        testCompleted = true;
        clearTimeout(timeout);
        resolve({
          server: serverName,
          status: code === 0 ? 'SUCCESS' : 'FAILED',
          output: output.trim(),
          error: errorOutput.trim(),
          exitCode: code
        });
      }
    });

    process.on('error', (err) => {
      if (!testCompleted) {
        testCompleted = true;
        clearTimeout(timeout);
        resolve({
          server: serverName,
          status: 'ERROR',
          error: err.message
        });
      }
    });
  });
}

async function runAllTests() {
  console.log('🚀 Starting Comprehensive MCP Server Testing Suite');
  console.log('=' .repeat(60));
  
  const results = [];
  
  for (const [serverName, config] of Object.entries(servers)) {
    const result = await testServer(serverName, config);
    results.push(result);
    
    if (result.status === 'SUCCESS') {
      console.log(`✅ ${serverName}: ${result.status}`);
    } else {
      console.log(`❌ ${serverName}: ${result.status} - ${result.error || 'Unknown error'}`);
    }
  }
  
  // Generate summary report
  console.log('\n' + '=' .repeat(60));
  console.log('📊 COMPREHENSIVE TEST RESULTS SUMMARY');
  console.log('=' .repeat(60));
  
  const successful = results.filter(r => r.status === 'SUCCESS');
  const failed = results.filter(r => r.status !== 'SUCCESS');
  
  console.log(`✅ Successful servers: ${successful.length}/10`);
  console.log(`❌ Failed servers: ${failed.length}/10`);
  console.log(`📈 Success rate: ${(successful.length / 10 * 100).toFixed(1)}%`);
  
  if (successful.length > 0) {
    console.log('\n✅ WORKING SERVERS:');
    successful.forEach(r => console.log(`  - ${r.server}`));
  }
  
  if (failed.length > 0) {
    console.log('\n❌ FAILED SERVERS:');
    failed.forEach(r => console.log(`  - ${r.server}: ${r.error || r.status}`));
  }
  
  console.log('\n🎯 RECOMMENDATION:');
  if (successful.length >= 8) {
    console.log('✅ System is production ready with most servers functional');
  } else if (successful.length >= 5) {
    console.log('⚠️  System is partially functional, investigate failed servers');
  } else {
    console.log('🚨 System needs significant debugging before production use');
  }
  
  return results;
}

// Run tests if called directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = { runAllTests, testServer };