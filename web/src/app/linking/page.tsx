'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import Link from 'next/link';

type CookieRow = { _id: string; c_user: string | null; createdAt?: string };

type ServerItem = { _id: string; name: string; isActive?: boolean };

type GenerateTempResponse = { batchId: string; count: number; preview: Array<{ last4: string; exp_month: string; exp_year: string; cardholder_name: string }>} ;

type EnqueueMappedResponse = { enqueued: number; jobs: Array<{ cookieId: string; jobId: string }>} ;

type ProgressResponse = { results: Record<string, { progress: number; status: string } | null> };

export default function LinkingPage() {
  const { user, isLoading } = useAuth();

  const [cookies, setCookies] = useState<CookieRow[]>([]);
  const [selectedCookieIds, setSelectedCookieIds] = useState<string[]>([]);
  const [servers, setServers] = useState<ServerItem[]>([]);
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>([]);

  const [bin, setBin] = useState('');
  const [quantity, setQuantity] = useState<number>(0);
  const [country, setCountry] = useState('US');
  const [expStart, setExpStart] = useState<string>(''); // YYYY-MM
  const [expEnd, setExpEnd] = useState<string>('');   // YYYY-MM

  const [batchId, setBatchId] = useState<string | null>(null);
  const [preview, setPreview] = useState<GenerateTempResponse['preview']>([]);

  const [jobMap, setJobMap] = useState<Record<string, string>>({}); // cookieId -> jobId
  const [progressMap, setProgressMap] = useState<Record<string, number>>({}); // cookieId -> progress
  const [statusMap, setStatusMap] = useState<Record<string, string>>({}); // cookieId -> status

  const [busy, setBusy] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!user && !isLoading) {
      // Not logged in; show limited UI
    }
  }, [user, isLoading]);

  useEffect(() => {
    // Load cookies
    (async () => {
      try {
        const res = await apiClient.get<{ items: CookieRow[]; total: number; page: number; limit: number }>(`/api/cookies?limit=1000&page=1`);
        setCookies(res.items || []);
      } catch (e) {
        console.error('Failed to load cookies', e);
      }
    })();
    // Load available servers
    (async () => {
      try {
        const res = await apiClient.get<{ success: boolean; data: ServerItem[] }>(`/api/servers/available`);
        setServers(res?.data || []);
      } catch (e) {
        console.error('Failed to load servers', e);
      }
    })();
  }, []);

  useEffect(() => {
    // Keep quantity in sync with selection
    setQuantity(selectedCookieIds.length || 0);
  }, [selectedCookieIds.length]);

  const allSelected = useMemo(() => selectedCookieIds.length > 0 && selectedCookieIds.length === cookies.length, [selectedCookieIds, cookies.length]);

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedCookieIds([]);
    } else {
      setSelectedCookieIds(cookies.map(c => String(c._id)));
    }
  };

  const toggleCookie = (id: string) => {
    setSelectedCookieIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleServer = (id: string) => {
    setSelectedServerIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const generateCards = async () => {
    if (!bin || (selectedCookieIds.length === 0)) {
      alert('أدخل BIN وحدد الكوكيز أولاً');
      return;
    }
    setBusy(true);
    try {
      const payload: any = { bin, quantity: selectedCookieIds.length, country };
      if (expStart) payload.expStart = expStart;
      if (expEnd) payload.expEnd = expEnd;
      const res = await apiClient.post<GenerateTempResponse>(`/api/cards/generate-temp`, payload);
      setBatchId(res.batchId);
      setPreview(res.preview || []);
    } catch (e) {
      console.error(e);
      alert('فشل توليد البطاقات');
    } finally {
      setBusy(false);
    }
  };

  const startLinking = async () => {
    if (!batchId) {
      alert('يرجى توليد البطاقات أولاً');
      return;
    }
    if (selectedCookieIds.length === 0) {
      alert('يرجى تحديد الكوكيز');
      return;
    }
    if (selectedServerIds.length === 0) {
      const proceed = confirm('لم يتم اختيار سيرفرات. سوف يتم الاستخدام الافتراضي. هل تريد المتابعة؟');
      if (!proceed) return;
    }
    setBusy(true);
    try {
      const res = await apiClient.post<EnqueueMappedResponse>(`/api/jobs/enqueue-mapped`, {
        batchId,
        cookieIds: selectedCookieIds,
        serverIds: selectedServerIds,
      });
      const mapping: Record<string, string> = {};
      res.jobs.forEach(j => { mapping[j.cookieId] = j.jobId; });
      setJobMap(mapping);
      // Initialize progress
      const initProgress: Record<string, number> = {};
      const initStatus: Record<string, string> = {};
      selectedCookieIds.forEach(cid => { initProgress[cid] = 0; initStatus[cid] = 'waiting'; });
      setProgressMap(initProgress);
      setStatusMap(initStatus);
      // Start polling
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const jobIds = Object.values(mapping).filter(Boolean);
        if (jobIds.length === 0) return;
        try {
          const pr = await apiClient.post<ProgressResponse>(`/api/jobs/progress`, { jobIds });
          const newProgress = { ...progressMap };
          const newStatus = { ...statusMap };
          for (const [jobId, info] of Object.entries(pr.results || {})) {
            if (!info) continue;
            // find cookie for this jobId
            const cookieId = Object.entries(mapping).find(([, jid]) => jid === jobId)?.[0];
            if (!cookieId) continue;
            newProgress[cookieId] = typeof info.progress === 'number' ? info.progress : newProgress[cookieId] || 0;
            newStatus[cookieId] = info.status || newStatus[cookieId] || 'unknown';
          }
          setProgressMap(newProgress);
          setStatusMap(newStatus);
        } catch (e) {
          console.error('poll error', e);
        }
      }, 2500) as any;
    } catch (e) {
      console.error(e);
      alert('فشل بدء عملية الربط');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const assignedLast4 = (idx: number) => preview[idx]?.last4 || '';

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">بدء المهام (ربط بطاقة واحدة لكل كوكيز)</h1>
        <Link href="/" className="text-blue-600 hover:underline">الرجوع</Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-lg border border-gray-200 bg-white/70">
          <h2 className="font-semibold mb-3">اختيار السيرفرات</h2>
          <div className="space-y-2 max-h-56 overflow-auto">
            {servers.map(s => (
              <label key={s._id} className="flex items-center gap-2">
                <input type="checkbox" checked={selectedServerIds.includes(String(s._id))} onChange={() => toggleServer(String(s._id))} />
                <span>{s.name}</span>
              </label>
            ))}
            {servers.length === 0 && <div className="text-sm text-gray-500">لا توجد سيرفرات متاحة</div>}
          </div>
        </div>

        <div className="p-4 rounded-lg border border-gray-200 bg-white/70">
          <h2 className="font-semibold mb-3">توليد البطاقات (مؤقتًا)</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm">BIN</label>
              <input className="w-full border rounded px-3 py-2" placeholder="مثال: 411111" value={bin} onChange={(e) => setBin(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm">العدد (يساوي عدد الكوكيز المحددة)</label>
              <input className="w-full border rounded px-3 py-2" type="number" readOnly value={quantity} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm">الدولة</label>
                <input className="w-full border rounded px-3 py-2" value={country} onChange={(e) => setCountry(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm">Exp Start (YYYY-MM)</label>
                <input className="w-full border rounded px-3 py-2" placeholder="2026-01" value={expStart} onChange={(e) => setExpStart(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm">Exp End (YYYY-MM)</label>
                <input className="w-full border rounded px-3 py-2" placeholder="2029-12" value={expEnd} onChange={(e) => setExpEnd(e.target.value)} />
              </div>
            </div>
            <button disabled={busy} onClick={generateCards} className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50">توليد البطاقات</button>
            {batchId && (
              <div className="text-sm text-green-700">تم التوليد. Batch: {batchId} (عدد {preview.length})</div>
            )}
          </div>
        </div>

        <div className="p-4 rounded-lg border border-gray-200 bg-white/70">
          <h2 className="font-semibold mb-3">التحكم</h2>
          <div className="space-y-3">
            <button disabled={!batchId || selectedCookieIds.length === 0 || busy} onClick={startLinking} className="px-4 py-2 rounded bg-green-600 text-white disabled:opacity-50">بدء الربط</button>
            <div className="text-xs text-gray-600">اختر سيرفرات متعددة ليتم التوزيع عليها بالترتيب (Round-robin)</div>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-lg border border-gray-200 bg-white/70">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">الكوكيز</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} /> تحديد الكل
          </label>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="p-2">تحديد</th>
                <th className="p-2">Cookie ID</th>
                <th className="p-2">c_user</th>
                <th className="p-2">البطاقة</th>
                <th className="p-2">السيرفر</th>
                <th className="p-2">التقدم</th>
                <th className="p-2">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {cookies.map((c, idx) => {
                const id = String(c._id);
                const checked = selectedCookieIds.includes(id);
                const last4 = assignedLast4(idx);
                const serverName = selectedServerIds.length > 0 ? servers.find(s => String(s._id) === selectedServerIds[idx % selectedServerIds.length])?.name : '-';
                const prog = progressMap[id] ?? 0;
                const status = statusMap[id] ?? '-';
                return (
                  <tr key={id} className="border-b">
                    <td className="p-2 text-center">
                      <input type="checkbox" checked={checked} onChange={() => toggleCookie(id)} />
                    </td>
                    <td className="p-2 font-mono text-xs">{id}</td>
                    <td className="p-2">{c.c_user || '-'}</td>
                    <td className="p-2">{batchId ? (last4 ? `**** **** **** ${last4}` : '-') : '-'}</td>
                    <td className="p-2">{serverName || '-'}</td>
                    <td className="p-2">
                      <div className="w-40 bg-gray-200 rounded h-2 overflow-hidden">
                        <div className="bg-blue-600 h-2" style={{ width: `${prog}%` }} />
                      </div>
                      <div className="text-xs text-gray-600 mt-1">{prog}%</div>
                    </td>
                    <td className="p-2 text-xs">{status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
} 