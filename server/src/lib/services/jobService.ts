import { Collection, ObjectId } from 'mongodb';
import { getDatabase } from '../database';
import { Job, CreateJobInput, COLLECTIONS } from '../../types/database';

export class JobService {
  private collection: Collection<Job>;

  constructor() {
    this.collection = getDatabase().collection<Job>(COLLECTIONS.JOBS);
  }

  async createJob(input: CreateJobInput): Promise<Job> {
    const job: Omit<Job, '_id'> = {
      userId: new ObjectId(input.userId),
      type: input.type,
      status: 'pending',
      progress: 0,
      totalItems: this.calculateTotalItems(input),
      processedItems: 0,
      failedItems: 0,
      data: input.data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await this.collection.insertOne(job);
    return { ...job, _id: result.insertedId };
  }

  private calculateTotalItems(input: CreateJobInput): number {
    switch (input.type) {
      case 'add_cards':
        return input.data.cards?.length || 0;
      case 'update_cards':
        return input.data.cardIds?.length || 0;
      case 'delete_cards':
        return input.data.cardIds?.length || 0;
      default:
        return 0;
    }
  }

  async findJobById(id: string): Promise<Job | null> {
    return this.collection.findOne({ _id: new ObjectId(id) });
  }

  async findJobsByUserId(userId: string, limit = 50, skip = 0): Promise<Job[]> {
    return this.collection
      .find({ userId: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  async updateJobStatus(id: string, status: Job['status'], progress?: number): Promise<Job | null> {
    const updateData: any = { 
      status, 
      updatedAt: new Date() 
    };

    if (progress !== undefined) {
      updateData.progress = progress;
    }

    if (status === 'processing' && !updateData.startedAt) {
      updateData.startedAt = new Date();
    }

    if (status === 'completed' || status === 'failed') {
      updateData.completedAt = new Date();
    }

    await this.collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    return this.findJobById(id);
  }

  async updateJobProgress(id: string, processedItems: number, failedItems: number): Promise<Job | null> {
    const job = await this.findJobById(id);
    if (!job) return null;

    const progress = job.totalItems > 0 ? Math.round((processedItems / job.totalItems) * 100) : 0;

    await this.collection.updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          processedItems, 
          failedItems, 
          progress, 
          updatedAt: new Date() 
        } 
      }
    );

    return this.findJobById(id);
  }

  async setJobError(id: string, error: string): Promise<Job | null> {
    await this.collection.updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          error, 
          status: 'failed', 
          completedAt: new Date(),
          updatedAt: new Date() 
        } 
      }
    );

    return this.findJobById(id);
  }

  async deleteJob(id: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ _id: new ObjectId(id) });
    return result.deletedCount > 0;
  }

  async listJobs(limit = 50, skip = 0): Promise<Job[]> {
    return this.collection
      .find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  async getPendingJobs(): Promise<Job[]> {
    return this.collection
      .find({ status: 'pending' })
      .sort({ createdAt: 1 })
      .toArray();
  }

  async countJobsByStatus(status: Job['status']): Promise<number> {
    return this.collection.countDocuments({ status });
  }

  async countJobsByUserId(userId: string): Promise<number> {
    return this.collection.countDocuments({ userId: new ObjectId(userId) });
  }

  async getJobStats(): Promise<{
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    const stats = await this.collection.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    const result = {
      total: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };

    stats.forEach(stat => {
      result[stat._id as keyof typeof result] = stat.count;
      result.total += stat.count;
    });

    return result;
  }
} 