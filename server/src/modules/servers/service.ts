import { ObjectId } from 'mongodb';
import { getDatabase } from '../../lib/database';
import { Server, CreateServerInput, UpdateServerInput, COLLECTIONS } from '../../types/database';

export class ServerService {
  private static collection = () => getDatabase().collection<Server>(COLLECTIONS.SERVERS);

  // إنشاء سيرفر جديد
  static async createServer(input: CreateServerInput): Promise<Server> {
    const collection = this.collection();
    
    const server: Omit<Server, '_id'> = {
      userId: new ObjectId(input.userId),
      name: input.name,
      apiUrl: input.apiUrl,
      description: input.description || '',
      isActive: true,
      maxConcurrentJobs: input.maxConcurrentJobs || 10,
      currentJobs: 0,
      status: 'offline',
      settings: {
        timeout: input.settings?.timeout || 30000,
        retryAttempts: input.settings?.retryAttempts || 3,
        proxyEnabled: input.settings?.proxyEnabled || false,
        proxyConfig: input.settings?.proxyConfig,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await collection.insertOne(server);
    return { ...server, _id: result.insertedId };
  }

  // الحصول على جميع السيرفرات للمستخدم
  static async getServersByUserId(userId: string): Promise<Server[]> {
    const collection = this.collection();
    return await collection.find({ userId: new ObjectId(userId) }).toArray();
  }

  // الحصول على سيرفر واحد
  static async getServerById(serverId: string, userId: string): Promise<Server | null> {
    const collection = this.collection();
    return await collection.findOne({ 
      _id: new ObjectId(serverId), 
      userId: new ObjectId(userId) 
    });
  }

  // تحديث سيرفر
  static async updateServer(serverId: string, userId: string, input: UpdateServerInput): Promise<Server | null> {
    const collection = this.collection();
    
    const updateData: any = {
      ...input,
      updatedAt: new Date(),
    };

    if (input.settings) {
      updateData.settings = {
        timeout: input.settings.timeout || 30000,
        retryAttempts: input.settings.retryAttempts || 3,
        proxyEnabled: input.settings.proxyEnabled || false,
        proxyConfig: input.settings.proxyConfig,
      };
    }

    await collection.updateOne(
      { _id: new ObjectId(serverId), userId: new ObjectId(userId) },
      { $set: updateData }
    );

    return await this.getServerById(serverId, userId);
  }

  // حذف سيرفر
  static async deleteServer(serverId: string, userId: string): Promise<boolean> {
    const collection = this.collection();
    const result = await collection.deleteOne({ 
      _id: new ObjectId(serverId), 
      userId: new ObjectId(userId) 
    });
    return result.deletedCount > 0;
  }

  // تفعيل/إلغاء تفعيل سيرفر
  static async toggleServerStatus(serverId: string, userId: string): Promise<Server | null> {
    const collection = this.collection();
    const server = await this.getServerById(serverId, userId);
    
    if (!server) return null;

    await collection.updateOne(
      { _id: new ObjectId(serverId), userId: new ObjectId(userId) },
      { 
        $set: { 
          isActive: !server.isActive,
          updatedAt: new Date()
        } 
      }
    );

    return await this.getServerById(serverId, userId);
  }

  // تحديث حالة السيرفر
  static async updateServerStatus(serverId: string, status: 'online' | 'offline' | 'maintenance'): Promise<void> {
    const collection = this.collection();
    await collection.updateOne(
      { _id: new ObjectId(serverId) },
      { 
        $set: { 
          status,
          lastHealthCheck: new Date(),
          updatedAt: new Date()
        } 
      }
    );
  }

  // الحصول على السيرفرات المتاحة للعمل
  static async getAvailableServers(userId: string): Promise<Server[]> {
    const collection = this.collection();
    return await collection.find({
      userId: new ObjectId(userId),
      isActive: true,
      status: 'online',
      $expr: { $lt: ['$currentJobs', '$maxConcurrentJobs'] }
    }).toArray();
  }

  // زيادة عدد المهام الحالية
  static async incrementCurrentJobs(serverId: string): Promise<void> {
    const collection = this.collection();
    await collection.updateOne(
      { _id: new ObjectId(serverId) },
      { $inc: { currentJobs: 1 } }
    );
  }

  // تقليل عدد المهام الحالية
  static async decrementCurrentJobs(serverId: string): Promise<void> {
    const collection = this.collection();
    await collection.updateOne(
      { _id: new ObjectId(serverId) },
      { $inc: { currentJobs: -1 } }
    );
  }

  // فحص صحة السيرفر
  static async healthCheck(serverId: string): Promise<boolean> {
    try {
      const server = await this.getServerById(serverId, '');
      if (!server) return false;

      // هنا يمكن إضافة منطق فحص صحة السيرفر
      // مثل إرسال طلب HTTP إلى endpoint الصحة
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), server.settings.timeout);
      
      const response = await fetch(`${server.apiUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      const isHealthy = response.ok;
      await this.updateServerStatus(serverId, isHealthy ? 'online' : 'offline');
      
      return isHealthy;
    } catch (error) {
      await this.updateServerStatus(serverId, 'offline');
      return false;
    }
  }

  // الحصول على إحصائيات السيرفرات
  static async getServerStats(userId: string): Promise<{
    total: number;
    online: number;
    offline: number;
    maintenance: number;
    totalJobs: number;
  }> {
    const collection = this.collection();
    const servers = await collection.find({ userId: new ObjectId(userId) }).toArray();
    
    const stats = {
      total: servers.length,
      online: servers.filter(s => s.status === 'online').length,
      offline: servers.filter(s => s.status === 'offline').length,
      maintenance: servers.filter(s => s.status === 'maintenance').length,
      totalJobs: servers.reduce((sum, s) => sum + s.currentJobs, 0),
    };

    return stats;
  }
} 