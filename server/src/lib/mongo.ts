import { MongoClient, Db } from 'mongodb';
import { env } from '../config/env';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getDb(): Promise<Db> {
  if (db) return db;
  client = new MongoClient(env.MONGODB_URI);
  await client.connect();
  db = client.db();
  return db;
}

export async function closeDb() {
  await client?.close();
  client = null;
  db = null;
} 