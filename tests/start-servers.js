#!/usr/bin/env node

/**
 * Start Test Servers
 *
 * This script starts all the servers needed for testing.
 */

import { spawn } from 'child_process';
import http from 'http';
import { fileURLToPath } from 'url';
import path from 'path';

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Server configuration
const SERVERS = [
  {
    name: 'Attention Pattern Analyzer',
    command: 'tsx',
    args: ['servers/attention-mechanisms/src/attention-pattern-analyzer.ts'],
    port: 8000,
    url: 'http://localhost:8000'
  },
  {
    name: 'Sparse Attention Engine',
    command: 'tsx',
    args: ['servers/attention-mechanisms/src/sparse-attention-engine.ts'],
    port: 8001,
    url: 'http://localhost:8001'
  },
  {
    name: 'Memory-Efficient Attention',
    command: 'tsx',
    args: ['servers/attention-mechanisms/src/memory-efficient-attention.ts'],
    port: 8002,
    url: 'http://localhost:8002'
  },
  {
    name: 'Language Model Interface',
    command: 'tsx',
    args: ['servers/language-model/src/language-model-interface.ts'],
    port: 8003,
    url: 'http://localhost:8003'
  }
];

const SERVER_STARTUP_TIMEOUT = 30000; // 30 seconds

// Start all servers
async function startServers() {
  console.log('🚀 Starting Test Servers');
  console.log('========================');

  const serverProcesses = [];

  for (const server of SERVERS) {
    console.log(`Starting ${server.name} server on port ${server.port}...`);

    const serverProcess = spawn(server.command, server.args, {
      env: { ...process.env, PORT: server.port },
      stdio: 'pipe'
    });

    // Log server output for debugging
    serverProcess.stdout.on('data', (data) => {
      console.log(`[${server.name}] ${data}`);
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`[${server.name}] Error: ${data}`);
    });

    serverProcess.on('close', (code) => {
      console.log(`[${server.name}] Server exited with code ${code}`);
    });

    serverProcesses.push({
      server,
      process: serverProcess
    });
  }

  // Wait for all servers to start
  console.log('\nWaiting for servers to start...');

  const startTime = Date.now();
  const serverStatus = SERVERS.map(server => ({
    name: server.name,
    url: server.url,
    started: false
  }));

  while (Date.now() - startTime < SERVER_STARTUP_TIMEOUT) {
    // Check each server
    for (const status of serverStatus) {
      if (!status.started) {
        try {
          const response = await makeRequest('GET', `${status.url}/health`);
          if (response.statusCode === 200) {
            status.started = true;
            console.log(`✅ ${status.name} server is running.`);
          }
        } catch (error) {
          // Server not ready yet
        }
      }
    }

    // Check if all servers are started
    if (serverStatus.every(status => status.started)) {
      console.log('\n✅ All servers are running!');
      break;
    }

    // Wait a bit before checking again
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Check for servers that didn't start
  const failedServers = serverStatus.filter(status => !status.started);
  if (failedServers.length > 0) {
    console.error('\n❌ Some servers failed to start:');
    for (const server of failedServers) {
      console.error(`   - ${server.name}`);
    }
  }

  // Register cleanup handler
  process.on('SIGINT', () => {
    console.log('\nShutting down servers...');
    for (const { server, process } of serverProcesses) {
      console.log(`Stopping ${server.name} server...`);
      process.kill();
    }
    process.exit(0);
  });

  console.log('\n🧪 You can now run the tests:');
  console.log('   npm run test:attention');
  console.log('   npm run test:integration');
  console.log('   npm run test:performance');
  console.log('   npm run test:all');
  console.log('\nPress Ctrl+C to stop the servers.');
}

// Helper function to make HTTP requests
function makeRequest(method, url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: method
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
    req.end();
  });
}

// Start the servers
startServers().catch(error => {
  console.error('Error starting servers:', error);
  process.exit(1);
});
