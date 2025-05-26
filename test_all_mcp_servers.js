#!/usr/bin/env node

/**
 * Comprehensive End-to-End MCP Server Testing Script
 * Tests all 11 MCP servers through Claude Code integration
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Test cases for each MCP server
const serverTests = {
  'memory-simple': {
    testName: 'Basic Memory Storage',
    testCommand: `echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "store_memory", "arguments": {"key": "test_key", "value": "test_value", "tags": ["test"]}}}' | node mcp/memory/simple-server.js`,
    expectedInOutput: 'success'
  },
  
  'enhanced-memory': {
    testName: 'Enhanced Memory with 6 Optimization Techniques',
    testCommand: `echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "store_enhanced_memory", "arguments": {"content": "Test content for enhanced memory storage", "session_id": "test_session", "importance": 4, "tags": ["test", "demo"]}}}' | npx tsx servers/memory/src/enhanced-memory-final.ts`,
    expectedInOutput: 'content'
  },

  'data-pipeline': {
    testName: 'Data Pipeline Creation',
    testCommand: `echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "create_pipeline", "arguments": {"name": "test_pipeline", "source": {"type": "csv", "path": "/tmp/test.csv"}, "destination": {"type": "postgres", "connection": "test"}}}}' | npx tsx servers/data-analytics/src/data-pipeline.ts`,
    expectedInOutput: 'pipeline'
  },

  'realtime-analytics': {
    testName: 'Real-time Analytics Stream',
    testCommand: `echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "create_stream", "arguments": {"name": "test_stream", "source": "kafka", "topic": "test_events", "window_size": 300}}}' | npx tsx servers/data-analytics/src/realtime-analytics.ts`,
    expectedInOutput: 'stream'
  },

  'data-warehouse': {
    testName: 'Data Warehouse Query',
    testCommand: `echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "run_query", "arguments": {"query": "SELECT COUNT(*) as total FROM test_table", "warehouse": "analytics_warehouse"}}}' | npx tsx servers/data-analytics/src/data-warehouse.ts`,
    expectedInOutput: 'query'
  },

  'ml-deployment': {
    testName: 'ML Model Registration',
    testCommand: `echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "register_model", "arguments": {"name": "test_model", "type": "classification", "framework": "tensorflow", "version": "1.0", "metrics": {"accuracy": 0.95}}}}' | npx tsx servers/data-analytics/src/ml-deployment.ts`,
    expectedInOutput: 'model'
  },

  'data-governance': {
    testName: 'Data Asset Registration',
    testCommand: `echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "register_data_asset", "arguments": {"name": "test_dataset", "type": "table", "schema": "analytics", "owner": "data_team", "classification": "internal"}}}' | npx tsx servers/data-analytics/src/data-governance.ts`,
    expectedInOutput: 'asset'
  },

  'security-vulnerability': {
    testName: 'Security Project Scan',
    testCommand: `echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "scan_project_security", "arguments": {"project_path": "/tmp/test_project", "scan_type": "quick", "include_dependencies": true}}}' | npx tsx servers/security-vulnerability/src/security-vulnerability.ts`,
    expectedInOutput: 'scan'
  },

  'optimization': {
    testName: 'Performance Profiling',
    testCommand: `echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "start_profiling", "arguments": {"target": "application", "duration": 30, "metrics": ["cpu", "memory", "latency"]}}}' | npx tsx servers/optimization/src/optimization.ts`,
    expectedInOutput: 'profile'
  },

  'ui-design': {
    testName: 'Design System Analysis',
    testCommand: `echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "analyze_design_system", "arguments": {"project_path": "/tmp/test_ui", "framework": "react", "analyze_tokens": true}}}' | npx tsx servers/ui-design/src/ui-design.ts`,
    expectedInOutput: 'design'
  },

  'sequential-thinking': {
    testName: 'Sequential Thinking Reasoning',
    testCommand: `echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "sequentialthinking", "arguments": {"problem": "How to optimize database performance?"}}}' | npx -y @modelcontextprotocol/server-sequential-thinking`,
    expectedInOutput: 'thinking'
  }
};

async function testServer(serverName, testConfig) {
  console.log(`\n🔧 Testing ${serverName}: ${testConfig.testName}`);
  console.log(`Command: ${testConfig.testCommand.substring(0, 100)}...`);
  
  try {
    const { stdout, stderr } = await execAsync(testConfig.testCommand, {
      cwd: '/Users/robertlee/GitHubProjects/Claude_MCPServer',
      timeout: 5000,
      env: { ...process.env, [Object.keys(process.env).find(k => k.includes('_ID')) || 'SERVER_ID']: `${serverName}-server` }
    });
    
    console.log(`✅ ${serverName}: SUCCESS`);
    console.log(`   Output preview: ${stdout.substring(0, 200).replace(/\n/g, ' ')}...`);
    
    if (stderr && stderr.trim()) {
      console.log(`   Stderr: ${stderr.substring(0, 100).replace(/\n/g, ' ')}...`);
    }
    
    return { server: serverName, status: 'SUCCESS', output: stdout, error: null };
    
  } catch (error) {
    console.log(`❌ ${serverName}: FAILED`);
    console.log(`   Error: ${error.message}`);
    
    return { server: serverName, status: 'FAILED', output: null, error: error.message };
  }
}

async function main() {
  console.log('🚀 Starting Comprehensive MCP Server End-to-End Testing');
  console.log('======================================================');
  console.log(`Testing ${Object.keys(serverTests).length} MCP servers...\n`);
  
  const results = [];
  let successCount = 0;
  let failCount = 0;
  
  // Test each server
  for (const [serverName, testConfig] of Object.entries(serverTests)) {
    const result = await testServer(serverName, testConfig);
    results.push(result);
    
    if (result.status === 'SUCCESS') {
      successCount++;
    } else {
      failCount++;
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Summary
  console.log('\n📊 TEST SUMMARY');
  console.log('================');
  console.log(`Total Servers Tested: ${results.length}`);
  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`Success Rate: ${((successCount / results.length) * 100).toFixed(1)}%`);
  
  // Detailed results
  console.log('\n📋 DETAILED RESULTS');
  console.log('===================');
  results.forEach(result => {
    const status = result.status === 'SUCCESS' ? '✅' : '❌';
    console.log(`${status} ${result.server}: ${result.status}`);
    if (result.error) {
      console.log(`   Error: ${result.error.substring(0, 100)}...`);
    }
  });
  
  // Claude Code Integration Test Instructions
  console.log('\n🎯 CLAUDE CODE INTEGRATION TEST INSTRUCTIONS');
  console.log('============================================');
  console.log('To test through Claude Code, run these commands:');
  console.log('');
  console.log('1. Start Claude Code with MCP support:');
  console.log('   cd /Users/robertlee/GitHubProjects/Claude_MCPServer');
  console.log('   ./scripts/claude-mcp-wrapper.sh');
  console.log('');
  console.log('2. In Claude Code, run:');
  console.log('   /mcp');
  console.log('   Expected: All 11 servers listed as "connected"');
  console.log('');
  console.log('3. Test each server through Claude Code:');
  console.log('   - Ask: "List all available MCP tools"');
  console.log('   - Ask: "Store something in enhanced memory with importance 5"');
  console.log('   - Ask: "Create a data pipeline for CSV processing"');
  console.log('   - Ask: "Scan this project for security vulnerabilities"');
  console.log('   - Ask: "Analyze the UI design system of this project"');
  console.log('');
  console.log('Expected: Claude should successfully use all MCP servers and their tools');
  
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});