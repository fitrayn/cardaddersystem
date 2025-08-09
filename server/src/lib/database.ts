import { MongoClient, Db } from 'mongodb';
import { env } from '../config/env';

let client: MongoClient;
let db: Db;

export async function connectToDatabase(): Promise<Db> {
  if (db) {
    return db;
  }

  try {
    client = new MongoClient(env.MONGODB_URI);
    await client.connect();
    
    db = client.db();
    
    // Create collections and indexes
    await setupCollections();
    
    console.log('✅ Connected to MongoDB successfully');
    return db;
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
    throw error;
  }
}

export async function setupCollections(): Promise<void> {
  if (!db) {
    throw new Error('Database not connected');
  }

  // Users collection
  const usersCollection = db.collection('users');
  await usersCollection.createIndex({ email: 1 }, { unique: true });
  await usersCollection.createIndex({ username: 1 }, { unique: true });

  // Cards collection
  const cardsCollection = db.collection('cards');
  await cardsCollection.createIndex({ userId: 1 });
  await cardsCollection.createIndex({ cardNumber: 1 }, { unique: true });
  await cardsCollection.createIndex({ createdAt: -1 });

  // Jobs collection
  const jobsCollection = db.collection('jobs');
  await jobsCollection.createIndex({ userId: 1 });
  await jobsCollection.createIndex({ status: 1 });
  await jobsCollection.createIndex({ createdAt: -1 });

  // Stats collection
  const statsCollection = db.collection('stats');
  await statsCollection.createIndex({ userId: 1 });
  await statsCollection.createIndex({ date: 1 });

  console.log('✅ Database collections and indexes created');
}

export function getDatabase(): Db {
  if (!db) {
    throw new Error('Database not connected. Call connectToDatabase() first.');
  }
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (client) {
    await client.close();
    console.log('✅ Database connection closed');
  }
} 