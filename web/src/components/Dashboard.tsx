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
  const [showCardsInput, setShowCardsInput] = useState(false);
  const [showCookiesInput, setShowCookiesInput] = useState(false);
  const [cardsText, setCardsText] = useState('');
  const [cookiesText, setCookiesText] = useState('');
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string>('');
  const [showServerSelection, setShowServerSelection] = useState(false);

  const cardsFileRef = useRef<HTMLInputElement>(null);
  const cookiesFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkServerConnection();
    if (user) {
      fetchStats();
      fetchServers();
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

  const fetchServers = async () => {
    try {
      const response = await apiClient.get<{ data: Server[] }>('/api/servers/available');
      setServers(response.data || []);
    } catch (err) {
      console.error('Failed to fetch servers:', err);
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

  const uploadCardsText = async () => {
    try {
      setUploading(true);
      setMessage(null);
      setError(null);

      // Parse cards text
      const lines = cardsText.trim().split('\n').filter(line => line.trim());
      const cards = lines.map(line => {
        const parts = line.split('|');
        if (parts.length >= 4) {
          return {
            number: parts[0].trim(),
            exp_month: parts[1].trim(),
            exp_year: parts[2].trim(),
            cvv: parts[3].trim(),
            country: parts[4]?.trim() || 'US'
          };
        }
        return null;
      }).filter(card => card !== null);

      if (cards.length === 0) {
        setError('لم يتم العثور على بطاقات صحيحة في النص');
        return;
      }

      const response = await apiClient.post('/api/upload/cards/json', cards);
      const result = response as { inserted: number };
      setMessage(`تم رفع ${cards.length} بطاقة بنجاح!`);
      setCardsText('');
      setShowCardsInput(false);
      fetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل رفع البطاقات');
    } finally {
      setUploading(false);
    }
  };

  const uploadCookiesText = async () => {
    try {
      setUploading(true);
      setMessage(null);
      setError(null);

      // Parse cookies text
      const lines = cookiesText.trim().split('\n').filter(line => line.trim());
      const cookies = lines.map(line => {
        // Parse cookie string like: dpr=1.25; datr=9uZ-aLwoegltfChjgu-Fp0DH; c_user=61576495205670; xs=39%3ANcSkc6sIF__heg%3A2%3A1753147138%3A-1%3A-1%3A%3AAcWWXmk0z_J0BqPXOqqhSEtEuPr6QhUevQzrIpZ8cA
        const cookieObj: any = {};
        const pairs = line.split(';');
        
        pairs.forEach(pair => {
          const [key, value] = pair.trim().split('=');
          if (key && value) {
            cookieObj[key.trim()] = value.trim();
          }
        });

        return {
          c_user: cookieObj.c_user || '',
          xs: cookieObj.xs || '',
          fr: cookieObj.fr || '',
          datr: cookieObj.datr || '',
          country: cookieObj.country || 'US'
        };
      }).filter(cookie => cookie.c_user && cookie.xs);

      if (cookies.length === 0) {
        setError('لم يتم العثور على كوكيز صحيحة في النص');
        return;
      }

      const response = await apiClient.post('/api/upload/cookies/json', cookies);
      const result = response as { inserted: number };
      setMessage(`تم رفع ${cookies.length} كوكيز بنجاح!`);
      setCookiesText('');
      setShowCookiesInput(false);
      fetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل رفع الكوكيز');
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
    if (servers.length === 0) {
      setError('لا توجد سيرفرات متاحة. يرجى إضافة سيرفر أولاً.');
      return;
    }

    if (!selectedServerId) {
      setShowServerSelection(true);
      return;
    }

    try {
      setUploading(true);
      setMessage(null);
      setError(null);

      const response = await apiClient.post('/api/jobs/enqueue-simple', {
        serverId: selectedServerId
      });
      const result = response as { enqueued: number };
      setMessage(`تم بدء المهام بنجاح! تم إضافة ${result.enqueued} مهمة.`);
      setSelectedServerId('');
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-black p-8 relative overflow-hidden">
      {/* Subtle Scanning Lines */}
      <div className="fixed inset-0 pointer-events-none z-5">
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-green-400/30 to-transparent animate-pulse"></div>
        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-blue-400/30 to-transparent animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      <div className="max-w-7xl mx-auto relative z-20">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-blue-400 to-purple-400 mb-2">
              نظام إضافة البطاقات
            </h1>
            <p className="text-xl text-gray-300">
              مرحباً {user?.email} - {user?.role === 'admin' ? 'مدير' : 'مشغل'}
            </p>
          </div>
          <button
            onClick={logout}
            className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-md transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-red-500/50"
          >
            تسجيل الخروج
          </button>
        </div>

        {/* Messages */}
        {message && (
          <div className="bg-green-900/50 border border-green-400 rounded-md p-4 mb-6 backdrop-blur-sm">
            <div className="text-green-400 font-medium">نجح:</div>
            <div className="text-green-300">{message}</div>
          </div>
        )}

        {/* Server Status Card */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-600 p-6 mb-8 hover:border-green-400 transition-all duration-300">
          <h2 className="text-2xl font-semibold text-gray-200 mb-4 flex items-center">
            <span className="mr-2">🔌</span>
            حالة الخادم
          </h2>
          
          <div className="flex items-center gap-4 mb-4">
            <div className={`w-4 h-4 rounded-full ${
              isConnected ? 'bg-green-500 shadow-lg shadow-green-500/50' : 'bg-red-500 shadow-lg shadow-red-500/50'
            }`}></div>
            <span className={`font-medium ${
              isConnected ? 'text-green-400' : 'text-red-400'
            }`}>
              {isConnected ? 'متصل' : 'غير متصل'}
            </span>
          </div>

          {loading && (
            <div className="text-gray-400 flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-400 mr-2"></div>
              جاري التحقق من الاتصال...
            </div>
          )}

          {error && (
            <div className="bg-red-900/50 border border-red-400 rounded-md p-4 mb-4">
              <div className="text-red-400 font-medium">خطأ في الاتصال:</div>
              <div className="text-red-300">{error}</div>
            </div>
          )}

          {serverStatus && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-gray-700/50 p-4 rounded-md border border-gray-600 hover:border-green-400 transition-all duration-300">
                <div className="text-sm text-gray-400">الحالة</div>
                <div className="font-semibold text-gray-200">{serverStatus.status}</div>
              </div>
              <div className="bg-gray-700/50 p-4 rounded-md border border-gray-600 hover:border-blue-400 transition-all duration-300">
                <div className="text-sm text-gray-400">آخر تحديث</div>
                <div className="font-semibold text-gray-200">
                  {new Date(serverStatus.timestamp).toLocaleString('ar-SA')}
                </div>
              </div>
              <div className="bg-gray-700/50 p-4 rounded-md border border-gray-600 hover:border-purple-400 transition-all duration-300">
                <div className="text-sm text-gray-400">وقت التشغيل</div>
                <div className="font-semibold text-gray-200">
                  {Math.floor(serverStatus.uptime / 3600)} ساعة
                </div>
              </div>
            </div>
          )}

          <button
            onClick={testConnection}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-medium py-2 px-4 rounded-md transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-blue-500/50 disabled:hover:scale-100"
          >
            {loading ? 'جاري التحقق...' : 'اختبار الاتصال'}
          </button>
        </div>

        {/* Stats Overview */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-600 p-6 hover:border-blue-400 transition-all duration-300 hover:scale-105">
              <div className="text-blue-400 text-3xl mb-2">💳</div>
              <div className="text-2xl font-bold text-gray-200">{stats.totalCards}</div>
              <div className="text-gray-400">إجمالي البطاقات</div>
            </div>
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-600 p-6 hover:border-green-400 transition-all duration-300 hover:scale-105">
              <div className="text-green-400 text-3xl mb-2">🍪</div>
              <div className="text-2xl font-bold text-gray-200">{stats.totalCookies}</div>
              <div className="text-gray-400">إجمالي الكوكيز</div>
            </div>
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-600 p-6 hover:border-purple-400 transition-all duration-300 hover:scale-105">
              <div className="text-purple-400 text-3xl mb-2">⚡</div>
              <div className="text-2xl font-bold text-gray-200">{stats.totalJobs}</div>
              <div className="text-gray-400">إجمالي المهام</div>
            </div>
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-600 p-6 hover:border-orange-400 transition-all duration-300 hover:scale-105">
              <div className="text-orange-400 text-3xl mb-2">📊</div>
              <div className="text-2xl font-bold text-gray-200">{stats.successRate}%</div>
              <div className="text-gray-400">معدل النجاح</div>
            </div>
          </div>
        )}

        {/* Cards Input Modal */}
        {showCardsInput && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800/90 backdrop-blur-sm rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto border border-gray-600">
              <h3 className="text-xl font-semibold text-gray-200 mb-4">إدخال البطاقات</h3>
              <p className="text-gray-400 mb-4">
                أدخل البطاقات بالشكل التالي: رقم_البطاقة|الشهر|السنة|CVV|البلد(اختياري)
              </p>
              <textarea
                value={cardsText}
                onChange={(e) => setCardsText(e.target.value)}
                placeholder="6259693800226810|03|2029|108
6259693800224484|03|2029|118
6259693800227867|03|2029|453"
                className="w-full h-64 p-3 border border-gray-600 rounded-md font-mono text-sm bg-gray-700 text-gray-200 placeholder-gray-500 focus:border-green-400 focus:outline-none transition-all duration-300"
              />
              <div className="flex gap-2 mt-4">
                <button
                  onClick={uploadCardsText}
                  disabled={uploading || !cardsText.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-medium py-2 px-4 rounded-md transition-all duration-300 hover:scale-105 disabled:hover:scale-100"
                >
                  {uploading ? 'جاري الرفع...' : 'رفع البطاقات'}
                </button>
                <button
                  onClick={() => setShowCardsInput(false)}
                  className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-md transition-all duration-300 hover:scale-105"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cookies Input Modal */}
        {showCookiesInput && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800/90 backdrop-blur-sm rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto border border-gray-600">
              <h3 className="text-xl font-semibold text-gray-200 mb-4">إدخال الكوكيز</h3>
              <p className="text-gray-400 mb-4">
                أدخل الكوكيز بالشكل التالي: dpr=1.25; datr=9uZ-aLwoegltfChjgu-Fp0DH; c_user=61576495205670; xs=39%3ANcSkc6sIF__heg%3A2%3A1753147138%3A-1%3A-1%3A%3AAcWWXmk0z_J0BqPXOqqhSEtEuPr6QhUevQzrIpZ8cA
              </p>
              <textarea
                value={cookiesText}
                onChange={(e) => setCookiesText(e.target.value)}
                placeholder="dpr=1.25; datr=9uZ-aLwoegltfChjgu-Fp0DH; c_user=61576495205670; xs=39%3ANcSkc6sIF__heg%3A2%3A1753147138%3A-1%3A-1%3A%3AAcWWXmk0z_J0BqPXOqqhSEtEuPr6QhUevQzrIpZ8cA"
                className="w-full h-64 p-3 border border-gray-600 rounded-md font-mono text-sm bg-gray-700 text-gray-200 placeholder-gray-500 focus:border-green-400 focus:outline-none transition-all duration-300"
              />
              <div className="flex gap-2 mt-4">
                <button
                  onClick={uploadCookiesText}
                  disabled={uploading || !cookiesText.trim()}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-medium py-2 px-4 rounded-md transition-all duration-300 hover:scale-105 disabled:hover:scale-100"
                >
                  {uploading ? 'جاري الرفع...' : 'رفع الكوكيز'}
                </button>
                <button
                  onClick={() => setShowCookiesInput(false)}
                  className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-md transition-all duration-300 hover:scale-105"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-600 p-6 hover:border-blue-400 transition-all duration-300 hover:scale-105 group">
            <div className="text-blue-400 text-3xl mb-4">📤</div>
            <h3 className="text-xl font-semibold text-gray-200 mb-2">رفع البطاقات</h3>
            <p className="text-gray-400 mb-4">رفع ملف CSV أو إدخال البطاقات مباشرة</p>
            <div className="flex gap-2">
              <button 
                onClick={() => setShowCardsInput(true)}
                disabled={uploading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-medium py-2 px-4 rounded-md transition-all duration-300 hover:scale-105 disabled:hover:scale-100 hover:shadow-lg hover:shadow-blue-500/50"
              >
                إدخال مباشر
              </button>
              <button 
                onClick={handleUploadCards}
                disabled={uploading}
                className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 text-white font-medium py-2 px-4 rounded-md transition-all duration-300 hover:scale-105 disabled:hover:scale-100 hover:shadow-lg hover:shadow-blue-500/50"
              >
                ملف CSV
              </button>
            </div>
            <input
              ref={cardsFileRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleCardsFileChange}
              className="hidden"
            />
          </div>

          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-600 p-6 hover:border-green-400 transition-all duration-300 hover:scale-105 group">
            <div className="text-green-400 text-3xl mb-4">🍪</div>
            <h3 className="text-xl font-semibold text-gray-200 mb-2">رفع الكوكيز</h3>
            <p className="text-gray-400 mb-4">رفع ملف CSV أو إدخال الكوكيز مباشرة</p>
            <div className="flex gap-2">
              <button 
                onClick={() => setShowCookiesInput(true)}
                disabled={uploading}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-medium py-2 px-4 rounded-md transition-all duration-300 hover:scale-105 disabled:hover:scale-100 hover:shadow-lg hover:shadow-green-500/50"
              >
                إدخال مباشر
              </button>
              <button 
                onClick={handleUploadCookies}
                disabled={uploading}
                className="bg-green-500 hover:bg-green-600 disabled:bg-gray-600 text-white font-medium py-2 px-4 rounded-md transition-all duration-300 hover:scale-105 disabled:hover:scale-100 hover:shadow-lg hover:shadow-green-500/50"
              >
                ملف CSV
              </button>
            </div>
            <input
              ref={cookiesFileRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleCookiesFileChange}
              className="hidden"
            />
          </div>

          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-600 p-6 hover:border-purple-400 transition-all duration-300 hover:scale-105 group">
            <div className="text-purple-400 text-3xl mb-4">🚀</div>
            <h3 className="text-xl font-semibold text-gray-200 mb-2">بدء المهام</h3>
            <p className="text-gray-400 mb-4">بدء معالجة إضافة البطاقات</p>
            <button 
              onClick={startJobs}
              disabled={uploading}
              className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white font-medium py-2 px-4 rounded-md transition-all duration-300 hover:scale-105 disabled:hover:scale-100 hover:shadow-lg hover:shadow-purple-500/50"
            >
              {uploading ? 'جاري البدء...' : servers.length > 0 ? 'بدء المهام' : 'إضافة سيرفر أولاً'}
            </button>
          </div>

          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-600 p-6 hover:border-orange-400 transition-all duration-300 hover:scale-105 group">
            <div className="text-orange-400 text-3xl mb-4">📊</div>
            <h3 className="text-xl font-semibold text-gray-200 mb-2">التقارير</h3>
            <p className="text-gray-400 mb-4">عرض التقارير والإحصائيات</p>
            <button 
              onClick={viewReports}
              className="bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-md transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-orange-500/50"
            >
              عرض التقارير
            </button>
          </div>

          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-600 p-6 hover:border-red-400 transition-all duration-300 hover:scale-105 group">
            <div className="text-red-400 text-3xl mb-4">⚙️</div>
            <h3 className="text-xl font-semibold text-gray-200 mb-2">إعدادات النظام</h3>
            <p className="text-gray-400 mb-4">تكوين إعدادات النظام والوكلاء</p>
            <button 
              onClick={openSettings}
              className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-md transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-red-500/50"
            >
              الإعدادات
            </button>
          </div>

          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-600 p-6 hover:border-indigo-400 transition-all duration-300 hover:scale-105 group">
            <div className="text-indigo-400 text-3xl mb-4">🔍</div>
            <h3 className="text-xl font-semibold text-gray-200 mb-2">مراقبة المهام</h3>
            <p className="text-gray-400 mb-4">مراقبة حالة المهام الجارية</p>
            <button 
              onClick={monitorJobs}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-md transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-indigo-500/50"
            >
              مراقبة المهام
            </button>
          </div>
        </div>

        {/* Server Selection Modal */}
        {showServerSelection && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800/90 backdrop-blur-sm rounded-lg p-6 w-full max-w-md border border-gray-600">
              <h3 className="text-xl font-semibold text-gray-200 mb-4">اختر السيرفر</h3>
              
              {servers.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-gray-400 text-lg mb-4">لا توجد سيرفرات متاحة</div>
                  <p className="text-gray-500 mb-4">يجب إضافة سيرفر واحد على الأقل لبدء المهام</p>
                  <button
                    onClick={() => {
                      setShowServerSelection(false);
                      // يمكن إضافة رابط لإدارة السيرفرات هنا
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-all duration-300 hover:scale-105"
                  >
                    إدارة السيرفرات
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {servers.map((server) => (
                    <div
                      key={server._id}
                      className={`p-4 border rounded-md cursor-pointer transition-all duration-300 ${
                        selectedServerId === server._id
                          ? 'border-blue-400 bg-blue-900/20'
                          : 'border-gray-600 hover:border-gray-500 bg-gray-700/50'
                      }`}
                      onClick={() => setSelectedServerId(server._id)}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-semibold text-gray-200">{server.name}</div>
                          <div className="text-sm text-gray-400">{server.apiUrl}</div>
                          <div className="text-xs text-gray-500">
                            المهام: {server.currentJobs}/{server.maxConcurrentJobs}
                          </div>
                        </div>
                        <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                          server.status === 'online' ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {server.status === 'online' ? 'متصل' : 'غير متصل'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => {
                    if (selectedServerId) {
                      setShowServerSelection(false);
                      startJobs();
                    }
                  }}
                  disabled={!selectedServerId}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-medium py-2 px-4 rounded-md transition-all duration-300 hover:scale-105 disabled:hover:scale-100"
                >
                  بدء المهام
                </button>
                <button
                  onClick={() => setShowServerSelection(false)}
                  className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-md transition-all duration-300 hover:scale-105"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-12 text-gray-500">
          <p>تم تطوير هذا النظام باستخدام Next.js و Fastify</p>
          <p className="mt-2">جميع الحقوق محفوظة © 2024</p>
        </div>
      </div>
    </div>
  );
} 