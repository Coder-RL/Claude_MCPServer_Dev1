/**
 * Global test setup for Week 11 integration tests
 */
import { jest } from '@jest/globals';

// Global test configuration
jest.setTimeout(30000);

// Setup and teardown
beforeAll(async () => {
  console.log('🚀 Starting Week 11 test suite...');
});

afterAll(async () => {
  console.log('✅ Week 11 test suite completed');
});