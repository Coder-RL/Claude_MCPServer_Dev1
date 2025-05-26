# MCP Server Tests

This directory contains tests for the MCP Server components, including unit tests, integration tests, and performance tests.

## Test Structure

The tests are organized into the following directories:

- `attention-mechanisms/`: Tests for the Week 14 Attention Mechanisms components
- `language-model/`: Tests for the Week 15 Language Model Interface components
- `integration/`: Tests for integration between components
- `performance/`: Tests for performance under load
- `reports/`: Generated test reports

## Running Tests

Before running the tests, you need to start the servers:

```bash
# Start the servers needed for testing
npm run test:start-servers
```

Then, in a separate terminal, you can run the tests using the following npm scripts:

```bash
# Run unit tests for attention mechanisms and language model components
npm run test:attention

# Run integration tests
npm run test:integration

# Run performance tests
npm run test:performance

# Run all tests
npm run test:all
```

Alternatively, you can start the servers individually:

```bash
# Start Week 14 Attention Mechanisms servers
npm run start:week-14

# Start Week 15 Language Model Interface servers
npm run start:week-15
```

## Test Types

### Unit Tests

Unit tests verify the functionality of individual components, including:

- Attention Pattern Analyzer
- Sparse Attention Engine
- Memory-Efficient Attention
- Language Model Interface

### Integration Tests

Integration tests verify that different components can communicate with each other and that the BaseMCPServer inheritance works correctly across components.

### Performance Tests

Performance tests evaluate the components under load, including:

- Large attention matrices (1000x1000+)
- Memory usage with the Memory-Efficient Attention component
- Token counting accuracy in Language Model Interface
- Concurrent requests

## Test Reports

Test reports are generated in the `reports/` directory. Performance test reports include detailed metrics on memory usage, processing time, and other performance indicators.

## Prerequisites

Before running the tests, make sure the required services are running:

```bash
# Start Week 14 Attention Mechanisms servers
npm run start:week-14

# Start Week 15 Language Model Interface servers
npm run start:week-15

# Check the health of the servers
npm run health:week-14
npm run health:week-15
```

## Test Implementation Details

### Attention Mechanisms Tests

- `attention-pattern-analyzer.test.js`: Tests for the Attention Pattern Analyzer component
- `sparse-attention-engine.test.js`: Tests for the Sparse Attention Engine component
- `memory-efficient-attention.test.js`: Tests for the Memory-Efficient Attention component

### Language Model Interface Tests

- `language-model-interface.test.js`: Tests for the Language Model Interface component

### Integration Tests

- `component-integration.test.js`: Tests for integration between components

### Performance Tests

- `performance-tests.js`: Tests for performance under load

## Test Configuration

The tests are configured to run against the following server ports:

- Attention Pattern Analyzer: `http://localhost:8000`
- Sparse Attention Engine: `http://localhost:8001`
- Memory-Efficient Attention: `http://localhost:8002`
- Language Model Interface: `http://localhost:8003`
- Attention Visualization Engine: `http://localhost:8004`
- Cross-Attention Controller: `http://localhost:8005`
- Inference Pipeline Manager: `http://localhost:8006`
- Model Benchmarking Suite: `http://localhost:8007`
- Model Integration Hub: `http://localhost:8008`

## Test Utilities

The tests use the following utilities:

- `run-tests.js`: Script to run the tests
- HTTP request helpers for making requests to the servers
- Sample data generators for creating test data

## Test Coverage

The tests cover the following areas:

1. **Integration Testing**
   - Component communication
   - BaseMCPServer inheritance
   - Cross-component data flow

2. **Real Data Validation**
   - Attention matrices
   - Transformer model outputs
   - Pattern analysis

3. **Performance Under Load**
   - Large attention matrices
   - Memory usage
   - Token counting accuracy
   - Concurrent requests
