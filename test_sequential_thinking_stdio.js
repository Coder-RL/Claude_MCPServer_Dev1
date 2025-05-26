#!/usr/bin/env node

/**
 * Test Sequential Thinking Server STDIO Communication
 * This script tests if the sequential-thinking server responds properly via STDIO
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function testSequentialThinkingServer() {
    return new Promise((resolve, reject) => {
        console.log('🧪 Testing Sequential Thinking Server STDIO Communication...\n');
        
        // Start the sequential thinking server
        const serverPath = path.join(__dirname, 'mcp/sequential-thinking/server.js');
        const server = spawn('node', [serverPath], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';
        let errorOutput = '';

        server.stdout.on('data', (data) => {
            output += data.toString();
        });

        server.stderr.on('data', (data) => {
            errorOutput += data.toString();
            console.log('📝 Server stderr:', data.toString().trim());
        });

        // Test sequence
        setTimeout(() => {
            console.log('📤 Sending initialize request...');
            const initRequest = {
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    capabilities: {},
                    clientInfo: { name: 'test-client', version: '1.0.0' }
                }
            };
            server.stdin.write(JSON.stringify(initRequest) + '\n');
        }, 100);

        setTimeout(() => {
            console.log('📤 Sending tools/list request...');
            const toolsRequest = {
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/list',
                params: {}
            };
            server.stdin.write(JSON.stringify(toolsRequest) + '\n');
        }, 200);

        setTimeout(() => {
            console.log('📤 Sending tool call request...');
            const toolCallRequest = {
                jsonrpc: '2.0',
                id: 3,
                method: 'tools/call',
                params: {
                    name: 'think_step_by_step',
                    arguments: {
                        problem: 'Test sequential thinking functionality',
                        context: 'E2E testing scenario'
                    }
                }
            };
            server.stdin.write(JSON.stringify(toolCallRequest) + '\n');
        }, 300);

        setTimeout(() => {
            server.kill('SIGTERM');
            
            console.log('\n📥 Server Output:');
            const responses = output.trim().split('\n').filter(line => line.trim());
            
            responses.forEach((response, index) => {
                try {
                    const parsed = JSON.parse(response);
                    console.log(`Response ${index + 1}:`, JSON.stringify(parsed, null, 2));
                } catch (e) {
                    console.log(`Response ${index + 1} (raw):`, response);
                }
            });

            if (responses.length >= 3) {
                console.log('\n✅ Sequential Thinking Server STDIO Test: SUCCESS');
                console.log('🔗 Server is properly responding via STDIO protocol');
                resolve(true);
            } else {
                console.log('\n❌ Sequential Thinking Server STDIO Test: FAILED');
                console.log('📊 Expected 3 responses, got:', responses.length);
                resolve(false);
            }
        }, 1000);

        server.on('error', (error) => {
            console.log('❌ Server process error:', error.message);
            reject(error);
        });
    });
}

// Run the test
testSequentialThinkingServer().then((success) => {
    console.log('\n🏁 Test completed:', success ? 'PASS' : 'FAIL');
    process.exit(success ? 0 : 1);
}).catch((error) => {
    console.log('💥 Test failed with error:', error.message);
    process.exit(1);
});