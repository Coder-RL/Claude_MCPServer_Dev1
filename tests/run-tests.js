#!/usr/bin/env node

/**
 * MCP Server Test Runner
 *
 * This script runs all the tests for the MCP Server components.
 * It can run unit tests, integration tests, and performance tests.
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const TEST_TYPES = {
  unit: {
    name: 'Unit Tests',
    command: 'mocha',
    args: [
      '--timeout', '30000',
      'tests/attention-mechanisms/*.test.js',
      'tests/language-model/*.test.js'
    ]
  },
  integration: {
    name: 'Integration Tests',
    command: 'mocha',
    args: [
      '--timeout', '60000',
      'tests/integration/*.test.js'
    ]
  },
  performance: {
    name: 'Performance Tests',
    command: 'node',
    args: [
      'tests/performance/performance-tests.js'
    ]
  },
  all: {
    name: 'All Tests',
    command: 'mocha',
    args: [
      '--timeout', '60000',
      'tests/attention-mechanisms/*.test.js',
      'tests/language-model/*.test.js',
      'tests/integration/*.test.js'
    ]
  }
};

// Parse command line arguments
const args = process.argv.slice(2);
const testType = args[0] || 'all';
const verbose = args.includes('--verbose') || args.includes('-v');

// Create reports directory if it doesn't exist
const reportsDir = path.join(__dirname, 'reports');
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

// Run the specified tests
async function runTests() {
  console.log(`🧪 Running ${TEST_TYPES[testType].name}`);
  console.log('===============================');

  if (!TEST_TYPES[testType]) {
    console.error(`❌ Unknown test type: ${testType}`);
    console.log('Available test types:');
    Object.keys(TEST_TYPES).forEach(type => {
      console.log(`  - ${type}: ${TEST_TYPES[type].name}`);
    });
    process.exit(1);
  }

  // Special case for performance tests
  if (testType === 'performance') {
    return runPerformanceTests();
  }

  // Run Mocha tests
  return new Promise((resolve, reject) => {
    const testProcess = spawn(TEST_TYPES[testType].command, TEST_TYPES[testType].args, {
      stdio: 'inherit'
    });

    testProcess.on('close', code => {
      if (code === 0) {
        console.log(`\n✅ ${TEST_TYPES[testType].name} completed successfully`);
        resolve(0);
      } else {
        console.error(`\n❌ ${TEST_TYPES[testType].name} failed with code ${code}`);
        resolve(code);
      }
    });

    testProcess.on('error', err => {
      console.error(`\n❌ Failed to run ${TEST_TYPES[testType].name}:`, err);
      reject(err);
    });
  });
}

// Run performance tests
async function runPerformanceTests() {
  try {
    // Import the performance tests module using dynamic import
    const performanceModule = await import('./performance/performance-tests.js');
    const exitCode = await performanceModule.runPerformanceTests();
    return exitCode;
  } catch (error) {
    console.error('❌ Error running performance tests:', error);
    return 1;
  }
}

// Run tests and exit with appropriate code
runTests()
  .then(exitCode => {
    process.exit(exitCode);
  })
  .catch(error => {
    console.error('❌ Error running tests:', error);
    process.exit(1);
  });

// Export the runTests function
export { runTests };
