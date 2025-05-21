module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: [
    '**/test/**/*.test.ts',
    '**/test/**/*.test.js'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  testTimeout: 30000,
  verbose: true,
  // Mock external modules
  moduleNameMapper: {
    '^redis$': '<rootDir>/test/mocks/redis.js',
    '^pg$': '<rootDir>/test/mocks/pg.js',
    '^mongodb$': '<rootDir>/test/mocks/mongodb.js'
  }
};