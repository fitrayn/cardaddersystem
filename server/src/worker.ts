#!/usr/bin/env node

import { worker } from './modules/jobs/worker';
import { getRedis } from './lib/redis';
import { getDb } from './lib/mongo';
import { env } from './config/env';

console.log('🚀 Starting Facebook Card Adder Worker...');

// Initialize connections
async function initialize() {
  try {
    // Test MongoDB connection
    const db = await getDb();
    console.log('✅ MongoDB connected');
    
    // Test Redis connection
    const redis = getRedis();
    await redis.ping();
    console.log('✅ Redis connected');
    
    console.log('✅ Worker initialized successfully');
    console.log(`📊 Environment: ${env.NODE_ENV}`);
    console.log(`🔐 Processing jobs for queue: add-card`);
    
    // Keep the process alive
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down worker...');
      await redis.disconnect();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.log('\n🛑 Shutting down worker...');
      await redis.disconnect();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Failed to initialize worker:', error);
    process.exit(1);
  }
}

// Start the worker
initialize().catch(console.error); 