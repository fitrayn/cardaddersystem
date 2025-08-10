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
  successRate?: number;
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
  const [showAddServer, setShowAddServer] = useState(false);
  const [newServer, setNewServer] = useState<{ name: string; apiUrl: string; description: string }>({
    name: '',
    apiUrl: '',
    description: '',
  });
  const cardsFileRef = useRef<HTMLInputElement>(null);
  const cookiesFileRef = useRef<HTMLInputElement>(null);

  const [cardsRemoveDup, setCardsRemoveDup] = useState(true);
  const [cardsLimit, setCardsLimit] = useState<number | ''>('');
  const [cardsDefaultCountry, setCardsDefaultCountry] = useState('US');

  const [cookiesRemoveDup, setCookiesRemoveDup] = useState(true);
  const [cookiesLimit, setCookiesLimit] = useState<number | ''>('');
  const [cookiesDefaultCountry, setCookiesDefaultCountry] = useState('US');

  // Logs modal state
  const [showLogs, setShowLogs] = useState(false);
  const [logsServerId, setLogsServerId] = useState<string>('');
  const [logs, setLogs] = useState<Array<{ _id: string; success: boolean; reason?: string; country?: string | null; createdAt: string }>>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logsTimer, setLogsTimer] = useState<number | null>(null);

  // Data management modal state
  const [showDataManager, setShowDataManager] = useState(false);
  const [dataTab, setDataTab] = useState<'cards' | 'cookies'>('cards');
  const [cardsList, setCardsList] = useState<any[]>([]);
  const [cookiesList, setCookiesList] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    checkServerConnection();
    if (user) {
      fetchStats();
      fetchServers();
    }
  }, [user]);

  // Poll logs when modal open
  useEffect(() => {
    if (!showLogs || !logsServerId) {
      if (logsTimer) {
        window.clearInterval(logsTimer);
        setLogsTimer(null);
      }
      return;
    }
    // immediate fetch
    void fetchLogs();
    const t = window.setInterval(fetchLogs, 3000);
    setLogsTimer(t as number);
    return () => {
      clearInterval(t);
      setLogsTimer(null);
    };
  }, [showLogs, logsServerId]);

  const fetchLogs = async () => {
    if (!logsServerId) return;
    try {
      setLogsLoading(true);
      setLogsError(null);
      const qs = `?serverId=${encodeURIComponent(logsServerId)}&limit=50`;
      const resp = await apiClient.get<{ items: any[]; total: number }>(`/api/jobs/logs${qs}`);
      setLogs((resp.items || []).map((x: any) => ({
        _id: String(x._id),
        success: !!x.success,
        reason: x.reason,
        country: x.country ?? null,
        createdAt: x.createdAt,
      })));
    } catch (err) {
      setLogsError(err instanceof Error ? err.message : 'فشل جلب اللوجز');
    } finally {
      setLogsLoading(false);
    }
  };

  const fetchCards = async () => {
    try {
      setDataLoading(true);
      setDataError(null);
      const resp = await apiClient.get<{ items: any[]; total: number }>(`/api/cards?limit=100`);
      setCardsList(resp.items || []);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'فشل جلب البطاقات');
    } finally {
      setDataLoading(false);
    }
  };

  const fetchCookies = async () => {
    try {
      setDataLoading(true);
      setDataError(null);
      const resp = await apiClient.get<{ items: any[]; total: number }>(`/api/cookies?limit=100`);
      setCookiesList(resp.items || []);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'فشل جلب الكوكيز');
    } finally {
      setDataLoading(false);
    }
  };

  const deleteCard = async (id: string) => {
    try {
      await apiClient.delete(`/api/cards/${id}`);
      setCardsList(prev => prev.filter((x) => String(x._id) !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل حذف البطاقة');
    }
  };

  const deleteCookie = async (id: string) => {
    try {
      await apiClient.delete(`/api/cookies/${id}`);
      setCookiesList(prev => prev.filter((x) => String(x._id) !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل حذف الكوكي');
    }
  };

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
      const response = await apiClient.get<{ data: Server[] }>('/api/servers-metrics');
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

      const lines = cardsText.trim().split('\n').filter(line => line.trim());
      let cards = lines.map(line => {
        const parts = line.split('|');
        if (parts.length >= 4) {
          return {
            number: parts[0].trim(),
            exp_month: parts[1].trim(),
            exp_year: parts[2].trim(),
            cvv: parts[3].trim(),
            country: (parts[4]?.trim() || cardsDefaultCountry)
          };
        }
        return null;
             }).filter((c): c is {number:string;exp_month:string;exp_year:string;cvv:string;country:string} => !!c);

      if (cardsRemoveDup) {
        const seen = new Set<string>();
        cards = cards.filter(c => { if (seen.has(c.number)) return false; seen.add(c.number); return true; });
      }

      if (typeof cardsLimit === 'number' && cardsLimit > 0) {
        cards = cards.slice(0, cardsLimit);
      }

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

      const lines = cookiesText.trim().split('\n').filter(line => line.trim());
      let cookies = lines.map(line => {
        const cookieObj: any = {};
        const pairs = line.split(';');
        pairs.forEach(pair => {
          const [key, value] = pair.trim().split('=');
          if (key && value) { cookieObj[key.trim()] = value.trim(); }
        });
        return {
          c_user: cookieObj.c_user || '',
          xs: cookieObj.xs || '',
          fr: cookieObj.fr || '',
          datr: cookieObj.datr || '',
          country: cookieObj.country || cookiesDefaultCountry
        };
      }).filter(c => c.c_user && c.xs);

      if (cookiesRemoveDup) {
        const seen = new Set<string>();
        cookies = cookies.filter(c => { if (seen.has(c.c_user)) return false; seen.add(c.c_user); return true; });
      }

      if (typeof cookiesLimit === 'number' && cookiesLimit > 0) {
        cookies = cookies.slice(0, cookiesLimit);
      }

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
      // open logs for selected server
      setLogsServerId(selectedServerId);
      setShowLogs(true);
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

  const addServer = async () => {
    try {
      setUploading(true);
      setMessage(null);
      setError(null);

      if (!newServer.name.trim() || !newServer.apiUrl.trim()) {
        setError('يرجى إدخال اسم السيرفر ورابطه');
        return;
      }

      await apiClient.post('/api/servers', {
        name: newServer.name.trim(),
        apiUrl: newServer.apiUrl.trim(),
        description: newServer.description.trim() || undefined,
      });

      setMessage('تم إضافة السيرفر بنجاح');
      setShowAddServer(false);
      setNewServer({ name: '', apiUrl: '', description: '' });
      fetchServers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل في إضافة السيرفر');
    } finally {
      setUploading(false);
    }
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                <label className="flex items-center gap-2 text-gray-300"><input type="checkbox" checked={cardsRemoveDup} onChange={(e)=>setCardsRemoveDup(e.target.checked)} /> إزالة التكرارات</label>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">حد أقصى</label>
                  <input type="number" min={1} value={cardsLimit} onChange={(e)=>setCardsLimit(e.target.value? parseInt(e.target.value) : '')} className="w-full p-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">البلد الافتراضي</label>
                  <input type="text" value={cardsDefaultCountry} onChange={(e)=>setCardsDefaultCountry(e.target.value || 'US')} className="w-full p-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" />
                </div>
              </div>
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                <label className="flex items-center gap-2 text-gray-300"><input type="checkbox" checked={cookiesRemoveDup} onChange={(e)=>setCookiesRemoveDup(e.target.checked)} /> إزالة التكرارات</label>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">حد أقصى</label>
                  <input type="number" min={1} value={cookiesLimit} onChange={(e)=>setCookiesLimit(e.target.value? parseInt(e.target.value) : '')} className="w-full p-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">البلد الافتراضي</label>
                  <input type="text" value={cookiesDefaultCountry} onChange={(e)=>setCookiesDefaultCountry(e.target.value || 'US')} className="w-full p-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" />
                </div>
              </div>
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
          {/* Add Server Card */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-600 p-6 hover:border-teal-400 transition-all duration-300 hover:scale-105 group">
            <div className="text-teal-400 text-3xl mb-4">🖥️</div>
            <h3 className="text-xl font-semibold text-gray-200 mb-2">إضافة سيرفر</h3>
            <p className="text-gray-400 mb-4">أضف اسم السيرفر ورابط الـ API</p>
            <button 
              onClick={() => setShowAddServer(true)}
              disabled={uploading}
              className="bg-teal-600 hover:bg-teal-700 disabled:bg-gray-600 text-white font-medium py-2 px-4 rounded-md transition-all duration-300 hover:scale-105 disabled:hover:scale-100 hover:shadow-lg hover:shadow-teal-500/50"
            >
              إضافة سيرفر جديد
            </button>
          </div>

          {/* Logs Card */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-600 p-6 hover:border-lime-400 transition-all duration-300 hover:scale-105 group">
            <div className="text-lime-400 text-3xl mb-4">📜</div>
            <h3 className="text-xl font-semibold text-gray-200 mb-2">عرض اللوجز</h3>
            <p className="text-gray-400 mb-4">متابعة نتائج الربط حسب السيرفر</p>
            <button 
              onClick={() => { setLogsServerId(selectedServerId || servers[0]?._id || ''); setShowLogs(true); }}
              className="bg-lime-600 hover:bg-lime-700 text-white font-medium py-2 px-4 rounded-md transition-all duration-300 hover:scale-105"
            >
              فتح اللوجز
            </button>
          </div>

          {/* Data Manager Card */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-600 p-6 hover:border-yellow-400 transition-all duration-300 hover:scale-105 group">
            <div className="text-yellow-400 text-3xl mb-4">🗂️</div>
            <h3 className="text-xl font-semibold text-gray-200 mb-2">إدارة البيانات</h3>
            <p className="text-gray-400 mb-4">عرض/حذف البطاقات والكوكيز</p>
            <button 
              onClick={() => { setShowDataManager(true); setDataTab('cards'); fetchCards(); fetchCookies(); }}
              className="bg-yellow-600 hover:bg-yellow-700 text-white font-medium py-2 px-4 rounded-md transition-all duration-300 hover:scale-105"
            >
              فتح الإدارة
            </button>
          </div>

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
                        <div className="text-right">
                        <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                          server.status === 'online' ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {server.status === 'online' ? 'متصل' : 'غير متصل'}
                          </div>
                          <div className="text-xs text-gray-300 mt-1">نسبة النجاح: {server.successRate ?? 0}%</div>
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

        {/* Add Server Modal */}
        {showAddServer && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800/90 backdrop-blur-sm rounded-lg p-6 w-full max-w-md border border-gray-600">
              <h3 className="text-xl font-semibold text-gray-200 mb-4">إضافة سيرفر جديد</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">اسم السيرفر</label>
                  <input
                    type="text"
                    value={newServer.name}
                    onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
                    className="w-full p-3 border border-gray-600 rounded-md bg-gray-700 text-gray-200 placeholder-gray-500 focus:border-teal-400 focus:outline-none"
                    placeholder="مثال: سيرفر أوروبا"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">رابط API</label>
                  <input
                    type="url"
                    value={newServer.apiUrl}
                    onChange={(e) => setNewServer({ ...newServer, apiUrl: e.target.value })}
                    className="w-full p-3 border border-gray-600 rounded-md bg-gray-700 text-gray-200 placeholder-gray-500 focus:border-teal-400 focus:outline-none"
                    placeholder="https://api.example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">الوصف (اختياري)</label>
                  <textarea
                    value={newServer.description}
                    onChange={(e) => setNewServer({ ...newServer, description: e.target.value })}
                    className="w-full p-3 border border-gray-600 rounded-md bg-gray-700 text-gray-200 placeholder-gray-500 focus:border-teal-400 focus:outline-none"
                    placeholder="وصف السيرفر..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={addServer}
                  disabled={uploading || !newServer.name || !newServer.apiUrl}
                  className="bg-teal-600 hover:bg-teal-700 disabled:bg-gray-600 text-white font-medium py-2 px-4 rounded-md transition-all duration-300 hover:scale-105 disabled:hover:scale-100"
                >
                  {uploading ? 'جاري الإضافة...' : 'إضافة السيرفر'}
                </button>
                <button
                  onClick={() => setShowAddServer(false)}
                  className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-md transition-all duration-300 hover:scale-105"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Logs Modal */}
        {showLogs && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800/90 backdrop-blur-sm rounded-lg p-6 w-full max-w-2xl border border-gray-600">
              <h3 className="text-xl font-semibold text-gray-200 mb-4">اللوجز</h3>

              <div className="mb-4 flex gap-3 items-center">
                <label className="text-sm text-gray-300">السيرفر:</label>
                <select
                  value={logsServerId}
                  onChange={(e) => setLogsServerId(e.target.value)}
                  className="p-2 bg-gray-700 text-gray-200 border border-gray-600 rounded-md"
                >
                  <option value="">اختر السيرفر</option>
                  {servers.map(s => (
                    <option key={s._id} value={s._id}>{s.name}</option>
                  ))}
                </select>
                <button onClick={fetchLogs} className="bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 px-3 rounded">تحديث</button>
              </div>

              {logsError && <div className="mb-3 text-red-400 text-sm">{logsError}</div>}

              <div className="max-h-80 overflow-y-auto space-y-2">
                {logsLoading && <div className="text-gray-400">جاري التحميل...</div>}
                {!logsLoading && logs.length === 0 && <div className="text-gray-400">لا توجد سجلات</div>}
                {logs.map(item => (
                  <div key={item._id} className="p-3 rounded border border-gray-600 bg-gray-700/50 flex justify-between items-center">
                    <div>
                      <div className={item.success ? 'text-green-400' : 'text-red-400'}>
                        {item.success ? 'ناجح' : 'فشل'} - {item.reason || (item.success ? 'تمت الإضافة' : 'غير معروف')}
                      </div>
                      <div className="text-xs text-gray-400">{new Date(item.createdAt).toLocaleString('ar-SA')} {item.country ? `- ${item.country}` : ''}</div>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${item.success ? 'bg-green-500' : 'bg-red-500'}`} />
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mt-6 justify-end">
                <button onClick={() => setShowLogs(false)} className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-md">إغلاق</button>
              </div>
            </div>
          </div>
        )}

        {/* Data Manager Modal */}
        {showDataManager && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800/90 backdrop-blur-sm rounded-lg p-6 w-full max-w-3xl border border-gray-600">
              <h3 className="text-xl font-semibold text-gray-200 mb-4">إدارة البيانات</h3>

              <div className="flex gap-3 mb-4">
                <button onClick={() => setDataTab('cards')} className={`py-2 px-3 rounded ${dataTab==='cards' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'}`}>البطاقات</button>
                <button onClick={() => setDataTab('cookies')} className={`py-2 px-3 rounded ${dataTab==='cookies' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'}`}>الكوكيز</button>
                <button onClick={() => { if (dataTab==='cards') fetchCards(); else fetchCookies(); }} className="ml-auto bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 px-3 rounded">تحديث</button>
              </div>

              {dataError && <div className="mb-3 text-red-400 text-sm">{dataError}</div>}

              <div className="max-h-96 overflow-y-auto">
                {dataLoading && <div className="text-gray-400">جاري التحميل...</div>}

                {dataTab==='cards' && !dataLoading && (
                  <table className="w-full text-sm text-gray-300">
                    <thead>
                      <tr className="text-left text-gray-400">
                        <th className="p-2">ID</th>
                        <th className="p-2">تاريخ الإضافة</th>
                        <th className="p-2">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cardsList.map((c: any) => (
                        <tr key={String(c._id)} className="border-t border-gray-700">
                          <td className="p-2 font-mono text-xs">{String(c._id)}</td>
                          <td className="p-2">{c.createdAt ? new Date(c.createdAt).toLocaleString('ar-SA') : '-'}</td>
                          <td className="p-2">
                            <button onClick={() => deleteCard(String(c._id))} className="bg-red-600 hover:bg-red-700 text-white text-xs py-1 px-2 rounded">حذف</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {dataTab==='cookies' && !dataLoading && (
                  <table className="w-full text-sm text-gray-300">
                    <thead>
                      <tr className="text-left text-gray-400">
                        <th className="p-2">ID</th>
                        <th className="p-2">c_user</th>
                        <th className="p-2">تاريخ الإضافة</th>
                        <th className="p-2">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cookiesList.map((c: any) => (
                        <tr key={String(c._id)} className="border-t border-gray-700">
                          <td className="p-2 font-mono text-xs">{String(c._id)}</td>
                          <td className="p-2">{c.c_user || '-'}</td>
                          <td className="p-2">{c.createdAt ? new Date(c.createdAt).toLocaleString('ar-SA') : '-'}</td>
                          <td className="p-2">
                            <button onClick={() => deleteCookie(String(c._id))} className="bg-red-600 hover:bg-red-700 text-white text-xs py-1 px-2 rounded">حذف</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="flex gap-2 mt-6 justify-end">
                <button onClick={() => setShowDataManager(false)} className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-md">إغلاق</button>
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