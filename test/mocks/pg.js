// Mock PostgreSQL for testing
module.exports = {
  Pool: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ 
        rows: [{ count: 100, total_events: 1000 }], 
        rowCount: 1,
        fields: []
      }),
      release: jest.fn()
    }),
    query: jest.fn().mockResolvedValue({ 
      rows: [{ success: true, id: 1 }], 
      rowCount: 1 
    }),
    end: jest.fn().mockResolvedValue(undefined),
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0
  })),
  Client: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    end: jest.fn().mockResolvedValue(undefined)
  }))
};