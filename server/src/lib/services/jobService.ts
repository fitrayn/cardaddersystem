import { Collection, ObjectId } from 'mongodb';
import { getDb } from '../mongo';
import { Job, CreateJobInput, COLLECTIONS } from '../../types/database';

export class JobService {
  private async getCollection(): Promise<Collection<Job>> {
    const db = await getDb();
    return db.collection<Job>(COLLECTIONS.JOBS);
  }

  async createJob(input: CreateJobInput): Promise<Job> {
    const job: Omit<Job, '_id'> = {
      userId: new ObjectId(input.userId),
      type: input.type,
      status: 'pending',
      progress: 0,
      totalItems: 0,
      processedItems: 0,
      failedItems: 0,
      data: input.data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const collection = await this.getCollection();
    const result = await collection.insertOne(job);
    return { ...job, _id: result.insertedId };
  }

  async findJobById(id: string): Promise<Job | null> {
    const collection = await this.getCollection();
    return collection.findOne({ _id: new ObjectId(id) });
  }

  async updateJobStatus(id: string, status: Job['status'], progress?: number): Promise<void> {
    const collection = await this.getCollection();
    const updateData: any = { status, updatedAt: new Date() };
    if (progress !== undefined) {
      updateData.progress = progress;
    }

    await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );
  }

  async listJobs(limit = 50, skip = 0): Promise<Job[]> {
    const collection = await this.getCollection();
    return collection
      .find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  async getJobsByStatus(status: Job['status']): Promise<Job[]> {
    const collection = await this.getCollection();
    return collection.find({ status }).sort({ createdAt: -1 }).toArray();
  }

  async countJobs(status?: Job['status']): Promise<number> {
    const collection = await this.getCollection();
    const filter = status ? { status } : {};
    return collection.countDocuments(filter);
  }

  async deleteJob(id: string): Promise<boolean> {
    const collection = await this.getCollection();
    const result = await collection.deleteOne({ _id: new ObjectId(id) });
    return result.deletedCount > 0;
  }
} 