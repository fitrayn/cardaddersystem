import { ObjectId } from 'mongodb';

// User Types
export interface User {
  _id?: ObjectId;
  username: string;
  email: string;
  password: string;
  role: 'admin' | 'user' | 'operator';
  isActive: boolean;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
  role?: 'admin' | 'user' | 'operator';
}

export interface UpdateUserInput {
  username?: string;
  email?: string;
  password?: string;
  role?: 'admin' | 'user' | 'operator';
  isActive?: boolean;
}

// Card Types
export interface Card {
  _id?: ObjectId;
  userId: ObjectId;
  cardNumber: string;
  cardType: 'visa' | 'mastercard' | 'amex' | 'discover';
  expiryMonth: number;
  expiryYear: number;
  cvv: string;
  cardholderName: string;
  billingAddress: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  isActive: boolean;
  lastUsed?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCardInput {
  userId: string;
  cardNumber: string;
  cardType: 'visa' | 'mastercard' | 'amex' | 'discover';
  expiryMonth: number;
  expiryYear: number;
  cvv: string;
  cardholderName: string;
  billingAddress: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
}

export interface UpdateCardInput {
  cardType?: 'visa' | 'mastercard' | 'amex' | 'discover';
  expiryMonth?: number;
  expiryYear?: number;
  cvv?: string;
  cardholderName?: string;
  billingAddress?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  isActive?: boolean;
}

// Job Types
export interface Job {
  _id?: ObjectId;
  userId: ObjectId;
  type: 'add_cards' | 'update_cards' | 'delete_cards';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  totalItems: number;
  processedItems: number;
  failedItems: number;
  data: {
    cards?: CreateCardInput[];
    cardIds?: string[];
    updates?: UpdateCardInput[];
  };
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateJobInput {
  userId: string;
  type: 'add_cards' | 'update_cards' | 'delete_cards';
  data: {
    cards?: CreateCardInput[];
    cardIds?: string[];
    updates?: UpdateCardInput[];
  };
}

// Stats Types
export interface Stats {
  _id?: ObjectId;
  userId: ObjectId;
  date: Date;
  totalCards: number;
  activeCards: number;
  cardsAdded: number;
  cardsUpdated: number;
  cardsDeleted: number;
  jobsCompleted: number;
  jobsFailed: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StatsSummary {
  totalUsers: number;
  totalCards: number;
  activeCards: number;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  topCountries: Array<{
    country: string;
    count: number;
  }>;
  commonErrors: Array<{
    error: string;
    count: number;
  }>;
}

// Server Types
export interface Server {
  _id?: ObjectId;
  userId: ObjectId;
  name: string;
  apiUrl: string;
  description?: string;
  isActive: boolean;
  maxConcurrentJobs: number;
  currentJobs: number;
  lastHealthCheck?: Date;
  status: 'online' | 'offline' | 'maintenance';
  settings: {
    timeout: number; // milliseconds
    retryAttempts: number;
    proxyEnabled: boolean;
    proxyConfig?: {
      host: string;
      port: number;
      username?: string;
      password?: string;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateServerInput {
  userId: string;
  name: string;
  apiUrl: string;
  description?: string;
  maxConcurrentJobs?: number;
  settings?: {
    timeout?: number;
    retryAttempts?: number;
    proxyEnabled?: boolean;
    proxyConfig?: {
      host: string;
      port: number;
      username?: string;
      password?: string;
    };
  };
}

export interface UpdateServerInput {
  name?: string;
  apiUrl?: string;
  description?: string;
  isActive?: boolean;
  maxConcurrentJobs?: number;
  status?: 'online' | 'offline' | 'maintenance';
  settings?: {
    timeout?: number;
    retryAttempts?: number;
    proxyEnabled?: boolean;
    proxyConfig?: {
      host: string;
      port: number;
      username?: string;
      password?: string;
    };
  };
}

// Collection Names
export const COLLECTIONS = {
  USERS: 'users',
  CARDS: 'cards',
  JOBS: 'jobs',
  STATS: 'stats',
  SERVERS: 'servers',
} as const; 