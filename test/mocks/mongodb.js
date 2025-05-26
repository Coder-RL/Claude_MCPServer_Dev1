// Mock MongoDB for testing
module.exports = {
  MongoClient: {
    connect: jest.fn().mockResolvedValue({
      db: jest.fn(() => ({
        collection: jest.fn(() => ({
          findOne: jest.fn().mockResolvedValue({ _id: 'test-id', data: 'test' }),
          find: jest.fn(() => ({
            toArray: jest.fn().mockResolvedValue([{ _id: 'test-id', data: 'test' }]),
            limit: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            sort: jest.fn().mockReturnThis()
          })),
          insertOne: jest.fn().mockResolvedValue({ 
            insertedId: 'test-id',
            acknowledged: true 
          }),
          insertMany: jest.fn().mockResolvedValue({ 
            insertedIds: ['id1', 'id2'],
            insertedCount: 2,
            acknowledged: true 
          }),
          updateOne: jest.fn().mockResolvedValue({ 
            modifiedCount: 1,
            matchedCount: 1,
            acknowledged: true 
          }),
          updateMany: jest.fn().mockResolvedValue({ 
            modifiedCount: 2,
            matchedCount: 2,
            acknowledged: true 
          }),
          deleteOne: jest.fn().mockResolvedValue({ 
            deletedCount: 1,
            acknowledged: true 
          }),
          deleteMany: jest.fn().mockResolvedValue({ 
            deletedCount: 2,
            acknowledged: true 
          }),
          countDocuments: jest.fn().mockResolvedValue(10),
          createIndex: jest.fn().mockResolvedValue('index_name'),
          aggregate: jest.fn(() => ({
            toArray: jest.fn().mockResolvedValue([{ total: 100 }])
          }))
        }))
      })),
      close: jest.fn().mockResolvedValue(undefined),
      isConnected: jest.fn().mockReturnValue(true)
    })
  },
  ObjectId: jest.fn((id) => id || 'mock-object-id')
};