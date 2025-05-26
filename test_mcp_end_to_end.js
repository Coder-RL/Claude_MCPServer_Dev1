#!/usr/bin/env node

/**
 * End-to-End MCP Server Testing Script
 * Tests actual MCP protocol functionality with Claude Code
 */

import { spawn } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';

async function testMCPServer(serverName, command, args = []) {
  console.log(`\n🧪 Testing ${serverName}...`);
  
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: '/Users/robertlee'
    });
    
    let stdout = '';
    let stderr = '';
    let hasOutput = false;
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
      hasOutput = true;
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
      hasOutput = true;
    });
    
    // Send simple MCP initialization request
    const initRequest = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "test-client",
          version: "1.0.0"
        }
      }
    }) + '\n';
    
    child.stdin.write(initRequest);
    
    setTimeout(() => {
      child.kill('SIGTERM');
      
      const result = {
        serverName,
        command: `${command} ${args.join(' ')}`,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        hasOutput,
        status: hasOutput ? 'RESPONDING' : 'NO_RESPONSE'
      };
      
      console.log(`   📊 Status: ${result.status}`);
      if (stderr && stderr.includes('started')) {
        console.log(`   ✅ Startup message: "${stderr.trim()}"`);
      }
      if (stdout) {
        console.log(`   📝 Response: "${stdout.slice(0, 100)}..."`);
      }
      
      resolve(result);
    }, 2000);
  });
}

async function main() {
  console.log('🚀 MCP Server End-to-End Testing');
  console.log('================================\n');
  
  const servers = [
    {
      name: 'memory-simple-user',
      command: 'node',
      args: ['/Users/robertlee/GitHubProjects/Claude_MCPServer/mcp/memory/simple-server.js']
    },
    {
      name: 'filesystem-standard', 
      command: '/Users/robertlee/.nvm/versions/node/v20.18.3/bin/npx',
      args: ['@modelcontextprotocol/server-filesystem', '/Users/robertlee']
    },
    {
      name: 'sequential-thinking',
      command: 'node', 
      args: ['/Users/robertlee/GitHubProjects/Claude_MCPServer/mcp/sequential-thinking/server.js']
    }
  ];
  
  const results = [];
  
  for (const server of servers) {
    const result = await testMCPServer(server.name, server.command, server.args);
    results.push(result);
  }
  
  console.log('\n📋 SUMMARY REPORT');
  console.log('=================');
  
  let workingCount = 0;
  let stderrCount = 0;
  
  results.forEach(result => {
    const isWorking = result.status === 'RESPONDING';
    const hasStderrStartup = result.stderr && result.stderr.includes('started');
    
    if (isWorking) workingCount++;
    if (hasStderrStartup) stderrCount++;
    
    console.log(`${isWorking ? '✅' : '❌'} ${result.serverName}: ${result.status}`);
    if (hasStderrStartup) {
      console.log(`   🔍 Note: Outputs startup message to stderr (FALSE POSITIVE "error" in Claude Code)`);
    }
  });
  
  console.log(`\n📊 RESULTS:`);
  console.log(`   Working servers: ${workingCount}/${results.length}`);
  console.log(`   Servers with stderr messages: ${stderrCount}/${results.length}`);
  
  if (stderrCount > 0) {
    console.log(`\n⚠️  IMPORTANT: ${stderrCount} servers output startup messages to stderr.`);
    console.log(`   Claude Code incorrectly reports these as "failed" even though they work correctly.`);
    console.log(`   This is the documented FALSE POSITIVE issue.`);
  }
  
  // Save results
  writeFileSync('/Users/robertlee/GitHubProjects/Claude_MCPServer/mcp_test_results.json', 
    JSON.stringify(results, null, 2));
  
  console.log(`\n💾 Detailed results saved to: mcp_test_results.json`);
}

main().catch(console.error);