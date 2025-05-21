export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: 'tsconfig.json'
    }]
  },
  collectCoverageFrom: [
    'orchestration/src/**/*.ts',
    'servers/*/src/**/*.ts',
    'shared/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/dist/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 30000,
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/shared/$1',
    '^@orchestration/(.*)$': '<rootDir>/orchestration/src/$1',
    '^@servers/(.*)$': '<rootDir>/servers/$1/src',
    '^@database/(.*)$': '<rootDir>/database/$1',
    '^@config/(.*)$': '<rootDir>/config/$1'
  }
};