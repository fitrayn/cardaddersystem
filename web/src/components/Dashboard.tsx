'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../lib/auth-context';
import { apiClient, API_ENDPOINTS } from '../lib/api';

interface ServerStatus {
  status: string;
  timestamp: string;
  uptime: number;
}

interface StatsSummary {
  totalCards: number;
  totalCookies: number;
  totalJobs: number;
  successRate: number;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const cardsFileRef = useRef<HTMLInputElement>(null);
  const cookiesFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkServerConnection();
    if (user) {
      fetchStats();
    }
  }, [user]);

  const checkServerConnection = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const status = await apiClient.get<ServerStatus>(API_ENDPOINTS.HEALTH);
      setServerStatus(status);
      setIsConnected(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الاتصال بالخادم');
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const statsData = await apiClient.get<StatsSummary>(API_ENDPOINTS.STATS_SUMMARY);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const testConnection = () => {
    checkServerConnection();
  };

  const handleUploadCards = () => {
    cardsFileRef.current?.click();
  };

  const handleUploadCookies = () => {
    cookiesFileRef.current?.click();
  };

  const uploadFile = async (file: File, endpoint: string, type: string) => {
    try {
      setUploading(true);
      setMessage(null);
      setError(null);

      const formData = new FormData();
      formData.append('file', file);

      const response = await apiClient.post(endpoint, formData);

      const result = response as { inserted: number };
      setMessage(`تم رفع ${type} بنجاح! تم إضافة ${result.inserted} عنصر.`);
      fetchStats(); // Refresh stats
    } catch (err) {
      setError(err instanceof Error ? err.message : `فشل رفع ${type}`);
    } finally {
      setUploading(false);
    }
  };

  const handleCardsFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadFile(file, '/api/upload/cards/csv', 'البطاقات');
    }
  };

  const handleCookiesFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadFile(file, '/api/upload/cookies/csv', 'الكوكيز');
    }
  };

  const startJobs = async () => {
    try {
      setUploading(true);
      setMessage(null);
      setError(null);

      const response = await apiClient.post('/api/jobs/enqueue-simple', {});
      const result = response as { enqueued: number };
      setMessage(`تم بدء المهام بنجاح! تم إضافة ${result.enqueued} مهمة.`);
      fetchStats(); // Refresh stats
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل بدء المهام');
    } finally {
      setUploading(false);
    }
  };

  const viewReports = () => {
    setMessage('سيتم إضافة صفحة التقارير قريباً...');
  };

  const openSettings = () => {
    setMessage('سيتم إضافة صفحة الإعدادات قريباً...');
  };

  const monitorJobs = () => {
    setMessage('سيتم إضافة صفحة مراقبة المهام قريباً...');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              نظام إضافة البطاقات
            </h1>
            <p className="text-xl text-gray-600">
              مرحباً {user?.email} - {user?.role === 'admin' ? 'مدير' : 'مشغل'}
            </p>
          </div>
          <button
            onClick={logout}
            className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            تسجيل الخروج
          </button>
        </div>

        {/* Messages */}
        {message && (
          <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-6">
            <div className="text-green-800 font-medium">نجح:</div>
            <div className="text-green-600">{message}</div>
          </div>
        )}

        {/* Server Status Card */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            حالة الخادم
          </h2>
          
          <div className="flex items-center gap-4 mb-4">
            <div className={`w-4 h-4 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-red-500'
            }`}></div>
            <span className={`font-medium ${
              isConnected ? 'text-green-600' : 'text-red-600'
            }`}>
              {isConnected ? 'متصل' : 'غير متصل'}
            </span>
          </div>

          {loading && (
            <div className="text-gray-600">جاري التحقق من الاتصال...</div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
              <div className="text-red-800 font-medium">خطأ في الاتصال:</div>
              <div className="text-red-600">{error}</div>
            </div>
          )}

          {serverStatus && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-gray-50 p-4 rounded-md">
                <div className="text-sm text-gray-600">الحالة</div>
                <div className="font-semibold text-gray-800">{serverStatus.status}</div>
              </div>
              <div className="bg-gray-50 p-4 rounded-md">
                <div className="text-sm text-gray-600">آخر تحديث</div>
                <div className="font-semibold text-gray-800">
                  {new Date(serverStatus.timestamp).toLocaleString('ar-SA')}
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-md">
                <div className="text-sm text-gray-600">وقت التشغيل</div>
                <div className="font-semibold text-gray-800">
                  {Math.floor(serverStatus.uptime / 3600)} ساعة
                </div>
              </div>
            </div>
          )}

          <button
            onClick={testConnection}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            {loading ? 'جاري التحقق...' : 'اختبار الاتصال'}
          </button>
        </div>

        {/* Stats Overview */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="text-blue-600 text-3xl mb-2">💳</div>
              <div className="text-2xl font-bold text-gray-800">{stats.totalCards}</div>
              <div className="text-gray-600">إجمالي البطاقات</div>
            </div>
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="text-green-600 text-3xl mb-2">🍪</div>
              <div className="text-2xl font-bold text-gray-800">{stats.totalCookies}</div>
              <div className="text-gray-600">إجمالي الكوكيز</div>
            </div>
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="text-purple-600 text-3xl mb-2">⚡</div>
              <div className="text-2xl font-bold text-gray-800">{stats.totalJobs}</div>
              <div className="text-gray-600">إجمالي المهام</div>
            </div>
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="text-orange-600 text-3xl mb-2">📊</div>
              <div className="text-2xl font-bold text-gray-800">{stats.successRate}%</div>
              <div className="text-gray-600">معدل النجاح</div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="text-blue-600 text-3xl mb-4">📤</div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">رفع البطاقات</h3>
            <p className="text-gray-600 mb-4">رفع ملف CSV يحتوي على بيانات البطاقات</p>
            <button 
              onClick={handleUploadCards}
              disabled={uploading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              {uploading ? 'جاري الرفع...' : 'رفع البطاقات'}
            </button>
            <input
              ref={cardsFileRef}
              type="file"
              accept=".csv"
              onChange={handleCardsFileChange}
              className="hidden"
            />
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="text-green-600 text-3xl mb-4">🍪</div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">رفع الكوكيز</h3>
            <p className="text-gray-600 mb-4">رفع ملف CSV يحتوي على بيانات الكوكيز</p>
            <button 
              onClick={handleUploadCookies}
              disabled={uploading}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              {uploading ? 'جاري الرفع...' : 'رفع الكوكيز'}
            </button>
            <input
              ref={cookiesFileRef}
              type="file"
              accept=".csv"
              onChange={handleCookiesFileChange}
              className="hidden"
            />
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="text-purple-600 text-3xl mb-4">🚀</div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">بدء المهام</h3>
            <p className="text-gray-600 mb-4">بدء معالجة إضافة البطاقات</p>
            <button 
              onClick={startJobs}
              disabled={uploading}
              className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              {uploading ? 'جاري البدء...' : 'بدء المهام'}
            </button>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="text-orange-600 text-3xl mb-4">📊</div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">التقارير</h3>
            <p className="text-gray-600 mb-4">عرض التقارير والإحصائيات</p>
            <button 
              onClick={viewReports}
              className="bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              عرض التقارير
            </button>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="text-red-600 text-3xl mb-4">⚙️</div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">إعدادات النظام</h3>
            <p className="text-gray-600 mb-4">تكوين إعدادات النظام والوكلاء</p>
            <button 
              onClick={openSettings}
              className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              الإعدادات
            </button>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="text-indigo-600 text-3xl mb-4">🔍</div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">مراقبة المهام</h3>
            <p className="text-gray-600 mb-4">مراقبة حالة المهام الجارية</p>
            <button 
              onClick={monitorJobs}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              مراقبة المهام
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-gray-500">
          <p>تم تطوير هذا النظام باستخدام Next.js و Fastify</p>
          <p className="mt-2">جميع الحقوق محفوظة © 2024</p>
        </div>
      </div>
    </div>
  );
} 