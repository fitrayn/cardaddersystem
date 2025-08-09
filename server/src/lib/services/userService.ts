import { Collection, ObjectId } from 'mongodb';
import { getDb } from '../mongo';
import { User, CreateUserInput, UpdateUserInput, COLLECTIONS } from '../../types/database';
import bcrypt from 'bcrypt';

export class UserService {
  private async getCollection(): Promise<Collection<User>> {
    const db = await getDb();
    return db.collection<User>(COLLECTIONS.USERS);
  }

  async createUser(input: CreateUserInput): Promise<User> {
    const hashedPassword = await bcrypt.hash(input.password, 12);
    
    const user: Omit<User, '_id'> = {
      username: input.username,
      email: input.email,
      password: hashedPassword,
      role: input.role || 'user',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const collection = await this.getCollection();
    const result = await collection.insertOne(user);
    return { ...user, _id: result.insertedId };
  }

  async findUserById(id: string): Promise<User | null> {
    const collection = await this.getCollection();
    return collection.findOne({ _id: new ObjectId(id) });
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const collection = await this.getCollection();
    return collection.findOne({ email });
  }

  async findUserByUsername(username: string): Promise<User | null> {
    const collection = await this.getCollection();
    return collection.findOne({ username });
  }

  async updateUser(id: string, input: UpdateUserInput): Promise<User | null> {
    const updateData: any = { ...input, updatedAt: new Date() };
    
    if (input.password) {
      updateData.password = await bcrypt.hash(input.password, 12);
    }

    const collection = await this.getCollection();
    await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    return this.findUserById(id);
  }

  async deleteUser(id: string): Promise<boolean> {
    const collection = await this.getCollection();
    const result = await collection.deleteOne({ _id: new ObjectId(id) });
    return result.deletedCount > 0;
  }

  async listUsers(limit = 50, skip = 0): Promise<User[]> {
    const collection = await this.getCollection();
    return collection
      .find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  async updateLastLogin(id: string): Promise<void> {
    const collection = await this.getCollection();
    await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { lastLogin: new Date(), updatedAt: new Date() } }
    );
  }

  async verifyPassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.password);
  }

  async countUsers(): Promise<number> {
    const collection = await this.getCollection();
    return collection.countDocuments();
  }
} 