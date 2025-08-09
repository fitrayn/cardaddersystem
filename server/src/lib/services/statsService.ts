import { Collection, ObjectId } from 'mongodb';
import { getDb } from '../mongo';
import { Stats, StatsSummary, COLLECTIONS } from '../../types/database';

export class StatsService {
  private async getCollection(): Promise<Collection<Stats>> {
    const db = await getDb();
    return db.collection<Stats>(COLLECTIONS.STATS);
  }

  async createStats(userId: string, date: Date): Promise<Stats> {
    const stats: Omit<Stats, '_id'> = {
      userId: new ObjectId(userId),
      date,
      totalCards: 0,
      activeCards: 0,
      cardsAdded: 0,
      cardsUpdated: 0,
      cardsDeleted: 0,
      jobsCompleted: 0,
      jobsFailed: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const collection = await this.getCollection();
    const result = await collection.insertOne(stats);
    return { ...stats, _id: result.insertedId };
  }

  async findStatsByUserId(userId: string, date: Date): Promise<Stats | null> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const collection = await this.getCollection();
    return collection.findOne({
      userId: new ObjectId(userId),
      date: { $gte: startOfDay, $lte: endOfDay }
    });
  }

  async updateStats(userId: string, date: Date, updates: Partial<Omit<Stats, '_id' | 'userId' | 'date' | 'createdAt'>>): Promise<Stats | null> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const collection = await this.getCollection();
    const updateData = { ...updates, updatedAt: new Date() };

    await collection.updateOne(
      {
        userId: new ObjectId(userId),
        date: { $gte: startOfDay, $lte: endOfDay }
      },
      { $set: updateData }
    );

    return this.findStatsByUserId(userId, date);
  }

  async incrementStats(userId: string, date: Date, field: keyof Omit<Stats, '_id' | 'userId' | 'date' | 'createdAt' | 'updatedAt'>, value: number = 1): Promise<void> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const collection = await this.getCollection();
    await collection.updateOne(
      {
        userId: new ObjectId(userId),
        date: { $gte: startOfDay, $lte: endOfDay }
      },
      { 
        $inc: { [field]: value },
        $set: { updatedAt: new Date() }
      }
    );
  }

  async getStatsSummary(): Promise<StatsSummary> {
    const db = await getDb();
    
    // Get total users
    const totalUsers = await db.collection(COLLECTIONS.USERS).countDocuments();
    
    // Get total cards
    const totalCards = await db.collection(COLLECTIONS.CARDS).countDocuments();
    
    // Get active cards
    const activeCards = await db.collection(COLLECTIONS.CARDS).countDocuments({ isActive: true });
    
    // Get job stats
    const jobStats = await db.collection(COLLECTIONS.JOBS).aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    const totalJobs = jobStats.reduce((sum: number, stat: any) => sum + stat.count, 0);
    const completedJobs = jobStats.find((stat: any) => stat._id === 'completed')?.count || 0;
    const failedJobs = jobStats.find((stat: any) => stat._id === 'failed')?.count || 0;

    // Get top countries
    const topCountries = await db.collection(COLLECTIONS.CARDS).aggregate([
      { $group: { _id: '$billingAddress.country', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $project: { country: '$_id', count: 1, _id: 0 } }
    ]).toArray();

    // Get common errors from failed jobs
    const commonErrors = await db.collection(COLLECTIONS.JOBS).aggregate([
      { $match: { status: 'failed', error: { $exists: true, $ne: null } } },
      { $group: { _id: '$error', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $project: { error: '$_id', count: 1, _id: 0 } }
    ]).toArray();

    return {
      totalUsers,
      totalCards,
      activeCards,
      totalJobs,
      completedJobs,
      failedJobs,
      topCountries: topCountries as Array<{ country: string; count: number }>,
      commonErrors: commonErrors as Array<{ error: string; count: number }>,
    };
  }

  async getUserStats(userId: string, days: number = 30): Promise<Stats[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const collection = await this.getCollection();
    return collection
      .find({
        userId: new ObjectId(userId),
        date: { $gte: startDate }
      })
      .sort({ date: 1 })
      .toArray();
  }

  async getDailyStats(days: number = 30): Promise<Array<{
    date: string;
    totalCards: number;
    activeCards: number;
    cardsAdded: number;
    cardsUpdated: number;
    cardsDeleted: number;
    jobsCompleted: number;
    jobsFailed: number;
  }>> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const collection = await this.getCollection();
    const result = await collection.aggregate([
      { $match: { date: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          totalCards: { $sum: '$totalCards' },
          activeCards: { $sum: '$activeCards' },
          cardsAdded: { $sum: '$cardsAdded' },
          cardsUpdated: { $sum: '$cardsUpdated' },
          cardsDeleted: { $sum: '$cardsDeleted' },
          jobsCompleted: { $sum: '$jobsCompleted' },
          jobsFailed: { $sum: '$jobsFailed' },
        }
      },
      { $sort: { _id: 1 } }
    ]).toArray();

    return result.map((item: any) => ({
      date: item._id,
      totalCards: item.totalCards,
      activeCards: item.activeCards,
      cardsAdded: item.cardsAdded,
      cardsUpdated: item.cardsUpdated,
      cardsDeleted: item.cardsDeleted,
      jobsCompleted: item.jobsCompleted,
      jobsFailed: item.jobsFailed,
    }));
  }
} 