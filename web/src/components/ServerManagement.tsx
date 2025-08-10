'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth-context';
import { apiClient } from '../lib/api';

interface Server {
  _id: string;
  name: string;
  apiUrl: string;
  description?: string;
  isActive: boolean;
  maxConcurrentJobs: number;
  currentJobs: number;
  status: 'online' | 'offline' | 'maintenance';
  lastHealthCheck?: string;
  createdAt: string;
  updatedAt: string;
}

interface CreateServerInput {
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

interface ApiResponse<T> {
  data?: T;
  message?: string;
  success?: boolean;
}

export default function ServerManagement() {
  const { user } = useAuth();
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [formData, setFormData] = useState<CreateServerInput>({
    name: '',
    apiUrl: '',
    description: '',
    maxConcurrentJobs: 10,
  });

  useEffect(() => {
    fetchServers();
  }, []);

  const fetchServers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get<ApiResponse<Server[]>>('/api/servers');
      setServers(response.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل في جلب السيرفرات');
    } finally {
      setLoading(false);
    }
  };

  const handleAddServer = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await apiClient.post<ApiResponse<Server>>('/api/servers', formData);
      setMessage('تم إضافة السيرفر بنجاح');
      setShowAddModal(false);
      setFormData({ name: '', apiUrl: '', description: '', maxConcurrentJobs: 10 });
      fetchServers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل في إضافة السيرفر');
    } finally {
      setLoading(false);
    }
  };

  const handleEditServer = async () => {
    if (!selectedServer) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const response = await apiClient.put<ApiResponse<Server>>(`/api/servers/${selectedServer._id}`, formData);
      setMessage('تم تحديث السيرفر بنجاح');
      setShowEditModal(false);
      setSelectedServer(null);
      setFormData({ name: '', apiUrl: '', description: '', maxConcurrentJobs: 10 });
      fetchServers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل في تحديث السيرفر');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteServer = async (serverId: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا السيرفر؟')) return;
    
    try {
      setLoading(true);
      setError(null);
      
      await apiClient.delete<ApiResponse<void>>(`/api/servers/${serverId}`);
      setMessage('تم حذف السيرفر بنجاح');
      fetchServers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل في حذف السيرفر');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleServer = async (serverId: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await apiClient.patch<ApiResponse<{ message: string }>>(`/api/servers/${serverId}/toggle`);
      setMessage(response.message || 'تم تغيير حالة السيرفر بنجاح');
      fetchServers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل في تغيير حالة السيرفر');
    } finally {
      setLoading(false);
    }
  };

  const handleHealthCheck = async (serverId: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await apiClient.post<ApiResponse<{ message: string }>>(`/api/servers/${serverId}/health-check`);
      setMessage(response.message || 'تم فحص صحة السيرفر بنجاح');
      fetchServers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل في فحص صحة السيرفر');
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (server: Server) => {
    setSelectedServer(server);
    setFormData({
      name: server.name,
      apiUrl: server.apiUrl,
      description: server.description || '',
      maxConcurrentJobs: server.maxConcurrentJobs,
    });
    setShowEditModal(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'text-green-400';
      case 'offline': return 'text-red-400';
      case 'maintenance': return 'text-yellow-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'online': return 'متصل';
      case 'offline': return 'غير متصل';
      case 'maintenance': return 'صيانة';
      default: return 'غير معروف';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-black p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-blue-400 to-purple-400 mb-2">
              إدارة السيرفرات
            </h1>
            <p className="text-xl text-gray-300">
              إدارة السيرفرات التي تنفذ عمليات ربط البطاقات
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-md transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-blue-500/50"
          >
            إضافة سيرفر جديد
          </button>
        </div>

        {/* Messages */}
        {message && (
          <div className="bg-green-900/50 border border-green-400 rounded-md p-4 mb-6 backdrop-blur-sm">
            <div className="text-green-400 font-medium">نجح:</div>
            <div className="text-green-300">{message}</div>
          </div>
        )}

        {error && (
          <div className="bg-red-900/50 border border-red-400 rounded-md p-4 mb-6 backdrop-blur-sm">
            <div className="text-red-400 font-medium">خطأ:</div>
            <div className="text-red-300">{error}</div>
          </div>
        )}

        {/* Servers List */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {servers.map((server) => (
              <div key={server._id} className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-600 p-6 hover:border-blue-400 transition-all duration-300">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-200 mb-1">{server.name}</h3>
                    <p className="text-gray-400 text-sm">{server.apiUrl}</p>
                  </div>
                  <div className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(server.status)}`}>
                    {getStatusText(server.status)}
                  </div>
                </div>

                {server.description && (
                  <p className="text-gray-300 text-sm mb-4">{server.description}</p>
                )}

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-gray-700/50 p-3 rounded-md">
                    <div className="text-sm text-gray-400">المهام الحالية</div>
                    <div className="font-semibold text-gray-200">{server.currentJobs}/{server.maxConcurrentJobs}</div>
                  </div>
                  <div className="bg-gray-700/50 p-3 rounded-md">
                    <div className="text-sm text-gray-400">الحالة</div>
                    <div className="font-semibold text-gray-200">
                      {server.isActive ? 'مفعل' : 'معطل'}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => openEditModal(server)}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-3 rounded-md transition-all duration-300 hover:scale-105"
                  >
                    تعديل
                  </button>
                  <button
                    onClick={() => handleToggleServer(server._id)}
                    className={`text-sm font-medium py-2 px-3 rounded-md transition-all duration-300 hover:scale-105 ${
                      server.isActive 
                        ? 'bg-yellow-600 hover:bg-yellow-700 text-white' 
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                  >
                    {server.isActive ? 'إلغاء التفعيل' : 'تفعيل'}
                  </button>
                  <button
                    onClick={() => handleHealthCheck(server._id)}
                    className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium py-2 px-3 rounded-md transition-all duration-300 hover:scale-105"
                  >
                    فحص الصحة
                  </button>
                  <button
                    onClick={() => handleDeleteServer(server._id)}
                    className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 px-3 rounded-md transition-all duration-300 hover:scale-105"
                  >
                    حذف
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && servers.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 text-xl mb-4">لا توجد سيرفرات</div>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-all duration-300 hover:scale-105"
            >
              إضافة أول سيرفر
            </button>
          </div>
        )}

        {/* Add Server Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800/90 backdrop-blur-sm rounded-lg p-6 w-full max-w-md border border-gray-600">
              <h3 className="text-xl font-semibold text-gray-200 mb-4">إضافة سيرفر جديد</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">اسم السيرفر</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full p-3 border border-gray-600 rounded-md bg-gray-700 text-gray-200 placeholder-gray-500 focus:border-blue-400 focus:outline-none"
                    placeholder="مثال: سيرفر أوروبا"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">رابط API</label>
                  <input
                    type="url"
                    value={formData.apiUrl}
                    onChange={(e) => setFormData({ ...formData, apiUrl: e.target.value })}
                    className="w-full p-3 border border-gray-600 rounded-md bg-gray-700 text-gray-200 placeholder-gray-500 focus:border-blue-400 focus:outline-none"
                    placeholder="https://api.example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">الوصف (اختياري)</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full p-3 border border-gray-600 rounded-md bg-gray-700 text-gray-200 placeholder-gray-500 focus:border-blue-400 focus:outline-none"
                    placeholder="وصف السيرفر..."
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">الحد الأقصى للمهام المتزامنة</label>
                  <input
                    type="number"
                    value={formData.maxConcurrentJobs}
                    onChange={(e) => setFormData({ ...formData, maxConcurrentJobs: parseInt(e.target.value) || 10 })}
                    className="w-full p-3 border border-gray-600 rounded-md bg-gray-700 text-gray-200 placeholder-gray-500 focus:border-blue-400 focus:outline-none"
                    min="1"
                    max="100"
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={handleAddServer}
                  disabled={loading || !formData.name || !formData.apiUrl}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-medium py-2 px-4 rounded-md transition-all duration-300 hover:scale-105 disabled:hover:scale-100"
                >
                  {loading ? 'جاري الإضافة...' : 'إضافة السيرفر'}
                </button>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-md transition-all duration-300 hover:scale-105"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Server Modal */}
        {showEditModal && selectedServer && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800/90 backdrop-blur-sm rounded-lg p-6 w-full max-w-md border border-gray-600">
              <h3 className="text-xl font-semibold text-gray-200 mb-4">تعديل السيرفر</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">اسم السيرفر</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full p-3 border border-gray-600 rounded-md bg-gray-700 text-gray-200 placeholder-gray-500 focus:border-blue-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">رابط API</label>
                  <input
                    type="url"
                    value={formData.apiUrl}
                    onChange={(e) => setFormData({ ...formData, apiUrl: e.target.value })}
                    className="w-full p-3 border border-gray-600 rounded-md bg-gray-700 text-gray-200 placeholder-gray-500 focus:border-blue-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">الوصف (اختياري)</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full p-3 border border-gray-600 rounded-md bg-gray-700 text-gray-200 placeholder-gray-500 focus:border-blue-400 focus:outline-none"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">الحد الأقصى للمهام المتزامنة</label>
                  <input
                    type="number"
                    value={formData.maxConcurrentJobs}
                    onChange={(e) => setFormData({ ...formData, maxConcurrentJobs: parseInt(e.target.value) || 10 })}
                    className="w-full p-3 border border-gray-600 rounded-md bg-gray-700 text-gray-200 placeholder-gray-500 focus:border-blue-400 focus:outline-none"
                    min="1"
                    max="100"
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={handleEditServer}
                  disabled={loading || !formData.name || !formData.apiUrl}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-medium py-2 px-4 rounded-md transition-all duration-300 hover:scale-105 disabled:hover:scale-100"
                >
                  {loading ? 'جاري التحديث...' : 'تحديث السيرفر'}
                </button>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-md transition-all duration-300 hover:scale-105"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 