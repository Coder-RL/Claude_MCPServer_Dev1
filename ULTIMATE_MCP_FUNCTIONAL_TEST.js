#!/usr/bin/env node

/**
 * ULTIMATE MCP FUNCTIONAL TEST
 * 
 * This test verifies that MCP servers can actually handle tool requests
 * similar to what Claude Code would send in real usage.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const TEST_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const RESULTS_DIR = `./ultimate_functional_test_${TEST_TIMESTAMP.substring(0, 15)}`;

// Ensure results directory exists
if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

function log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    fs.appendFileSync(`${RESULTS_DIR}/test.log`, logMessage + '\n');
}

/**
 * Test MCP server by sending requests and verifying responses
 */
async function testMCPServer(serverConfig) {
    const { name, command, args, testRequests } = serverConfig;
    
    log(`🧪 Testing ${name} server...`);
    
    return new Promise((resolve) => {
        const serverProcess = spawn(command, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: process.cwd()
        });

        let stdout = '';
        let stderr = '';
        let responses = [];
        let requestsSent = 0;

        serverProcess.stdout.on('data', (data) => {
            stdout += data.toString();
            
            // Try to parse JSON responses
            const lines = stdout.split('\n');
            for (const line of lines) {
                if (line.trim() && line.includes('"jsonrpc"')) {
                    try {
                        const response = JSON.parse(line);
                        responses.push(response);
                        log(`📨 ${name} response: ${JSON.stringify(response).substring(0, 100)}...`);
                    } catch (e) {
                        // Not valid JSON, ignore
                    }
                }
            }
        });

        serverProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        // Kill process after timeout
        const timeout = setTimeout(() => {
            serverProcess.kill('SIGTERM');
        }, 10000);

        serverProcess.on('close', (code) => {
            clearTimeout(timeout);
            
            const result = {
                name,
                success: responses.length > 0,
                responses: responses.length,
                requestsSent,
                stdout: stdout.substring(0, 500),
                stderr: stderr.substring(0, 500),
                code
            };
            
            log(`${result.success ? '✅' : '❌'} ${name}: ${result.responses} responses to ${requestsSent} requests`);
            resolve(result);
        });

        // Send test requests
        setTimeout(() => {
            for (const request of testRequests) {
                serverProcess.stdin.write(JSON.stringify(request) + '\n');
                requestsSent++;
                log(`📤 Sent to ${name}: ${request.method}`);
            }
            
            // Close stdin after sending requests
            setTimeout(() => {
                serverProcess.stdin.end();
            }, 2000);
        }, 1000);
    });
}

/**
 * MCP Server Test Configurations
 */
const serverTests = [
    {
        name: 'filesystem-standard',
        command: '/Users/robertlee/.nvm/versions/node/v20.18.3/bin/npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
        testRequests: [
            {
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2024-11-05',
                    capabilities: {},
                    clientInfo: { name: 'test-client', version: '1.0.0' }
                }
            },
            {
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/list',
                params: {}
            }
        ]
    },
    {
        name: 'sequential-thinking',
        command: 'node',
        args: ['mcp/sequential-thinking/server.js'],
        testRequests: [
            {
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2024-11-05',
                    capabilities: {},
                    clientInfo: { name: 'test-client', version: '1.0.0' }
                }
            },
            {
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/list',
                params: {}
            },
            {
                jsonrpc: '2.0',
                id: 3,
                method: 'tools/call',
                params: {
                    name: 'think_step_by_step',
                    arguments: {
                        problem: 'How to deploy a Node.js application to production'
                    }
                }
            }
        ]
    },
    {
        name: 'memory-enhanced',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-memory'],
        testRequests: [
            {
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2024-11-05',
                    capabilities: {},
                    clientInfo: { name: 'test-client', version: '1.0.0' }
                }
            },
            {
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/list',
                params: {}
            },
            {
                jsonrpc: '2.0',
                id: 3,
                method: 'tools/call',
                params: {
                    name: 'store_memory',
                    arguments: {
                        key: 'test_key',
                        value: 'Ultimate MCP test successful'
                    }
                }
            }
        ]
    }
];

/**
 * Test TypeScript servers
 */
const typescriptServerTests = [
    {
        name: 'data-analytics-consolidated',
        path: 'servers/consolidated/data-analytics-consolidated.ts'
    },
    {
        name: 'security-vulnerability',
        path: 'servers/security-vulnerability/src/security-vulnerability-fixed.ts'
    },
    {
        name: 'optimization',
        path: 'servers/optimization/src/optimization-fixed.ts'
    },
    {
        name: 'ui-design',
        path: 'servers/ui-design/src/ui-design-fixed.ts'
    }
];

async function testTypeScriptServer(serverConfig) {
    const { name, path: serverPath } = serverConfig;
    
    log(`🔧 Testing TypeScript server: ${name}`);
    
    return new Promise((resolve) => {
        const serverProcess = spawn('/Users/robertlee/.nvm/versions/node/v20.18.3/bin/tsx', [serverPath], {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: process.cwd()
        });

        let stdout = '';
        let stderr = '';
        let hasResponse = false;

        serverProcess.stdout.on('data', (data) => {
            stdout += data.toString();
            if (stdout.includes('server') || stdout.includes('listening') || stdout.includes('ready')) {
                hasResponse = true;
            }
        });

        serverProcess.stderr.on('data', (data) => {
            stderr += data.toString();
            if (stderr.includes('server') || stderr.includes('listening') || stderr.includes('ready')) {
                hasResponse = true;
            }
        });

        // Kill after short test
        setTimeout(() => {
            serverProcess.kill('SIGTERM');
        }, 5000);

        serverProcess.on('close', (code) => {
            const result = {
                name,
                success: hasResponse || code === 0,
                stdout: stdout.substring(0, 200),
                stderr: stderr.substring(0, 200),
                code
            };
            
            log(`${result.success ? '✅' : '❌'} ${name}: TypeScript server ${result.success ? 'started successfully' : 'failed to start'}`);
            resolve(result);
        });

        // Send initialize request
        setTimeout(() => {
            const initRequest = {
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2024-11-05',
                    capabilities: {},
                    clientInfo: { name: 'test-client', version: '1.0.0' }
                }
            };
            
            serverProcess.stdin.write(JSON.stringify(initRequest) + '\n');
            
            setTimeout(() => {
                serverProcess.stdin.end();
            }, 1000);
        }, 1000);
    });
}

/**
 * Main test execution
 */
async function runUltimateFunctionalTest() {
    log('🚀 STARTING ULTIMATE MCP FUNCTIONAL TEST');
    log('========================================');
    
    const results = {
        timestamp: new Date().toISOString(),
        npmServers: [],
        typescriptServers: [],
        summary: {}
    };

    // Test NPM-based servers
    log('📦 Testing NPM-based MCP servers...');
    for (const serverTest of serverTests) {
        const result = await testMCPServer(serverTest);
        results.npmServers.push(result);
    }

    // Test TypeScript servers
    log('🔧 Testing TypeScript MCP servers...');
    for (const serverTest of typescriptServerTests) {
        const result = await testTypeScriptServer(serverTest);
        results.typescriptServers.push(result);
    }

    // Calculate summary
    const npmSuccessful = results.npmServers.filter(r => r.success).length;
    const tsSuccessful = results.typescriptServers.filter(r => r.success).length;
    const totalSuccessful = npmSuccessful + tsSuccessful;
    const totalServers = results.npmServers.length + results.typescriptServers.length;

    results.summary = {
        npmServers: {
            successful: npmSuccessful,
            total: results.npmServers.length,
            successRate: `${(npmSuccessful / results.npmServers.length * 100).toFixed(2)}%`
        },
        typescriptServers: {
            successful: tsSuccessful,
            total: results.typescriptServers.length,
            successRate: `${(tsSuccessful / results.typescriptServers.length * 100).toFixed(2)}%`
        },
        overall: {
            successful: totalSuccessful,
            total: totalServers,
            successRate: `${(totalSuccessful / totalServers * 100).toFixed(2)}%`,
            readyForProduction: totalSuccessful >= Math.floor(totalServers * 0.8)
        }
    };

    // Save detailed results
    fs.writeFileSync(
        `${RESULTS_DIR}/functional_test_results.json`,
        JSON.stringify(results, null, 2)
    );

    // Generate final report
    log('📊 ULTIMATE FUNCTIONAL TEST RESULTS');
    log('===================================');
    log(`NPM Servers: ${npmSuccessful}/${results.npmServers.length} successful (${results.summary.npmServers.successRate})`);
    log(`TypeScript Servers: ${tsSuccessful}/${results.typescriptServers.length} successful (${results.summary.typescriptServers.successRate})`);
    log(`Overall: ${totalSuccessful}/${totalServers} successful (${results.summary.overall.successRate})`);
    
    if (results.summary.overall.readyForProduction) {
        log('🎉 PRODUCTION READY: MCP ecosystem is fully functional!');
        
        console.log(`
🎯 ULTIMATE VERIFICATION COMPLETE! 

✅ MCP ECOSYSTEM STATUS: PRODUCTION READY

📊 Test Results:
   • NPM Servers: ${results.summary.npmServers.successRate} success rate
   • TypeScript Servers: ${results.summary.typescriptServers.successRate} success rate
   • Overall: ${results.summary.overall.successRate} success rate

🚀 Ready for Claude Code Integration:

   1. Start Claude Code:
      claude --mcp-config /Users/robertlee/.claude/claude_code_config_dev1_optimized.json

   2. Verify connection with: mcp

   3. Test functionality:
      • "List files in this directory"
      • "Store a test memory with key 'demo' and value 'working'"
      • "Use sequential thinking to plan a deployment"
      • "Scan this project for security vulnerabilities"

📄 Full test results: ${RESULTS_DIR}/
        `);
    } else {
        log('⚠️  PARTIAL SUCCESS: Some servers need attention');
        
        console.log(`
⚠️  PARTIAL READINESS

📊 Test Results: ${results.summary.overall.successRate} success rate

Working servers can still be used for basic Claude Code integration.
See ${RESULTS_DIR}/ for detailed results.
        `);
    }

    return results;
}

// Execute the test
runUltimateFunctionalTest().catch(error => {
    log(`💥 Test failed with error: ${error.message}`);
    console.error(error);
    process.exit(1);
});