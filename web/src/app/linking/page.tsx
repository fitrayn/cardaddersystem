'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import Link from 'next/link';

// Country fingerprint defaults
const COUNTRY_PRESETS: Record<string, { tz: string; lang: string; currency?: string }> = {
  EG: { tz: 'Africa/Cairo', lang: 'ar-EG,ar;q=0.9,en-US;q=0.8', currency: 'EGP' },
  SA: { tz: 'Asia/Riyadh', lang: 'ar-SA,ar;q=0.9,en-US;q=0.8', currency: 'SAR' },
  AE: { tz: 'Asia/Dubai', lang: 'ar-AE,ar;q=0.9,en-US;q=0.8', currency: 'AED' },
  MA: { tz: 'Africa/Casablanca', lang: 'ar-MA,ar;q=0.9,fr-FR;q=0.8,en-US;q=0.7', currency: 'MAD' },
  US: { tz: 'America/New_York', lang: 'en-US,en;q=0.9', currency: 'USD' },
  GB: { tz: 'Europe/London', lang: 'en-GB,en;q=0.9', currency: 'GBP' },
  FR: { tz: 'Europe/Paris', lang: 'fr-FR,fr;q=0.9,en-US;q=0.8', currency: 'EUR' },
  DE: { tz: 'Europe/Berlin', lang: 'de-DE,de;q=0.9,en-US;q=0.8', currency: 'EUR' },
  TR: { tz: 'Europe/Istanbul', lang: 'tr-TR,tr;q=0.9,en-US;q=0.8', currency: 'TRY' },
  IN: { tz: 'Asia/Kolkata', lang: 'en-IN,en;q=0.9,hi-IN;q=0.7', currency: 'INR' },
  ID: { tz: 'Asia/Jakarta', lang: 'id-ID,id;q=0.9,en-US;q=0.8', currency: 'IDR' },
  BR: { tz: 'America/Sao_Paulo', lang: 'pt-BR,pt;q=0.9,en-US;q=0.8', currency: 'BRL' },
};

// Curated options per country
const FB_LANGS: Record<string, string[]> = {
  EG: ['ar-EG,ar;q=0.9,en-US;q=0.8', 'en-US,en;q=0.9'],
  SA: ['ar-SA,ar;q=0.9,en-US;q=0.8', 'en-US,en;q=0.9'],
  AE: ['ar-AE,ar;q=0.9,en-US;q=0.8', 'en-US,en;q=0.9'],
  MA: ['ar-MA,ar;q=0.9,fr-FR;q=0.8,en-US;q=0.7', 'fr-FR,fr;q=0.9,en-US;q=0.8'],
  US: ['en-US,en;q=0.9'],
  GB: ['en-GB,en;q=0.9'],
  FR: ['fr-FR,fr;q=0.9,en-US;q=0.8'],
  DE: ['de-DE,de;q=0.9,en-US;q=0.8'],
  TR: ['tr-TR,tr;q=0.9,en-US;q=0.8'],
  IN: ['en-IN,en;q=0.9,hi-IN;q=0.7', 'hi-IN,hi;q=0.9,en-US;q=0.8'],
  ID: ['id-ID,id;q=0.9,en-US;q=0.8'],
  BR: ['pt-BR,pt;q=0.9,en-US;q=0.8'],
};

const FB_TZS: Record<string, string[]> = {
  EG: ['Africa/Cairo'],
  SA: ['Asia/Riyadh'],
  AE: ['Asia/Dubai'],
  MA: ['Africa/Casablanca'],
  US: ['America/New_York', 'America/Chicago', 'America/Los_Angeles'],
  GB: ['Europe/London'],
  FR: ['Europe/Paris'],
  DE: ['Europe/Berlin'],
  TR: ['Europe/Istanbul'],
  IN: ['Asia/Kolkata'],
  ID: ['Asia/Jakarta'],
  BR: ['America/Sao_Paulo'],
};

const FB_CURRENCIES: Record<string, string[]> = {
  EG: ['EGP'],
  SA: ['SAR'],
  AE: ['AED'],
  MA: ['MAD'],
  US: ['USD'],
  GB: ['GBP'],
  FR: ['EUR'],
  DE: ['EUR'],
  TR: ['TRY'],
  IN: ['INR'],
  ID: ['IDR'],
  BR: ['BRL'],
};

type CookieRow = { _id: string; c_user: string | null; createdAt?: string };

type ServerItem = { _id: string; name: string; isActive?: boolean };

type GenerateTempResponse = { batchId: string; count: number; preview: Array<{ last4: string; exp_month: string; exp_year: string; cardholder_name: string }>} ;

type EnqueueMappedResponse = { enqueued: number; jobs: Array<{ cookieId: string; jobId: string }>} ;

type ProgressResponse = { results: Record<string, { progress: number; status: string } | null> };

// Toasts
type Toast = { id: string; type: 'success' | 'error' | 'info'; message: string };

export default function LinkingPage() {
  const { user, isLoading, token } = useAuth() as any;

  const [cookies, setCookies] = useState<CookieRow[]>([]);
  const [cookiesTotal, setCookiesTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(50);
  const [search, setSearch] = useState<string>('');

  const [selectedCookieIds, setSelectedCookieIds] = useState<string[]>([]);
  const [servers, setServers] = useState<ServerItem[]>([]);
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>([]);

  const [bin, setBin] = useState('');
  const [quantity, setQuantity] = useState<number>(0);
  const [country, setCountry] = useState('US');
  const [expStart, setExpStart] = useState<string>(''); // YYYY-MM
  const [expEnd, setExpEnd] = useState<string>('');   // YYYY-MM

  // Fingerprint preferences
  const [useAutoFingerprint, setUseAutoFingerprint] = useState(true);
  const [timezone, setTimezone] = useState('');
  const [acceptLanguage, setAcceptLanguage] = useState('');
  const [currency, setCurrency] = useState<string>('');

  // Derived options for dropdowns
  const languageOptions = useMemo(() => FB_LANGS[country] || ['en-US,en;q=0.9'], [country]);
  const timezoneOptions = useMemo(() => FB_TZS[country] || ['UTC'], [country]);
  const currencyOptions = useMemo(() => FB_CURRENCIES[country] || ['USD', 'EUR'], [country]);

  const [batchId, setBatchId] = useState<string | null>(null);
  const [preview, setPreview] = useState<GenerateTempResponse['preview']>([]);

  const [jobMap, setJobMap] = useState<Record<string, string>>({}); // cookieId -> jobId
  const [progressMap, setProgressMap] = useState<Record<string, number>>({}); // cookieId -> progress
  const [statusMap, setStatusMap] = useState<Record<string, string>>({}); // cookieId -> status
  const [messageMap, setMessageMap] = useState<Record<string, string>>({}); // cookieId -> message

  const [busy, setBusy] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const sseAbortRef = useRef<AbortController | null>(null);

  const [toasts, setToasts] = useState<Toast[]>([]);

  // Templates (localStorage)
  type Template = { name: string; bin: string; country: string; expStart?: string; expEnd?: string; serverIds: string[]; timezone?: string; acceptLanguage?: string; currency?: string; useAuto?: boolean };
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateName, setTemplateName] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem('linking_templates');
      if (raw) setTemplates(JSON.parse(raw));
    } catch {}
  }, []);

  // Auto-fill fingerprint when country changes
  useEffect(() => {
    if (!useAutoFingerprint) return;
    const tz = (timezoneOptions[0]) || (COUNTRY_PRESETS[country]?.tz) || 'UTC';
    const lang = (languageOptions[0]) || (COUNTRY_PRESETS[country]?.lang) || 'en-US,en;q=0.9';
    const cur = (currencyOptions[0]) || (COUNTRY_PRESETS[country]?.currency) || '';
    setTimezone(tz);
    setAcceptLanguage(lang);
    setCurrency(cur);
  }, [country, useAutoFingerprint, languageOptions, timezoneOptions, currencyOptions]);

  const saveTemplates = (list: Template[]) => {
    setTemplates(list);
    try { localStorage.setItem('linking_templates', JSON.stringify(list)); } catch {}
  };

  const addToast = (type: Toast['type'], message: string) => {
    const id = String(Date.now() + Math.random());
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  useEffect(() => {
    // Load cookies with pagination
    (async () => {
      try {
        const res = await apiClient.get<{ items: CookieRow[]; total: number; page: number; limit: number }>(`/api/cookies?limit=${limit}&page=${page}`);
        const items = res.items || [];
        const filtered = search ? items.filter(i => (i.c_user || '').includes(search)) : items;
        setCookies(filtered);
        setCookiesTotal(res.total || filtered.length);
      } catch (e) {
        console.error('Failed to load cookies', e);
        addToast('error', 'فشل تحميل الكوكيز');
      }
    })();
  }, [page, limit, search]);

  useEffect(() => {
    // Load available servers
    (async () => {
      try {
        const res = await apiClient.get<{ success: boolean; data: ServerItem[] }>(`/api/servers`);
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
      addToast('info', 'أدخل BIN وحدد الكوكيز أولاً');
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
      addToast('success', 'تم توليد البطاقات المؤقتة');
    } catch (e) {
      console.error(e);
      addToast('error', 'فشل توليد البطاقات');
    } finally {
      setBusy(false);
    }
  };

  // Options
  const [rateLimitPerServer, setRateLimitPerServer] = useState<number>(10);
  const [healthCheck, setHealthCheck] = useState<boolean>(true);

  const startSSE = useCallback(async (mapping: Record<string, string>) => {
    // Close previous
    try { if (sseAbortRef.current) sseAbortRef.current.abort(); } catch {}

    const ctrl = new AbortController();
    sseAbortRef.current = ctrl;

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/jobs/events`, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: ctrl.signal as any,
      });
      if (!res.ok || !res.body) {
        addToast('error', 'تعذر الاشتراك بتقدم المهام');
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      const pump = async () => {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const chunk of parts) {
          if (chunk.startsWith('event: progress')) {
            const dataLine = chunk.split('\n').find(l => l.startsWith('data: '));
            if (dataLine) {
              try {
                const payload = JSON.parse(dataLine.slice(6));
                const { jobId: sseJobId, progress: sseProgress, status: sseStatus, message: sseMessage } = payload;
                // Map jobId -> cookieId
                const cookieId = Object.entries(mapping).find(([, jid]) => jid === String(sseJobId))?.[0];
                if (cookieId) {
                  setProgressMap(prev => ({ ...prev, [cookieId]: typeof sseProgress === 'number' ? sseProgress : (prev[cookieId] || 0) }));
                  setStatusMap(prev => ({ ...prev, [cookieId]: sseStatus || prev[cookieId] || 'unknown' }));
                  if (sseMessage) setMessageMap(prev => ({ ...prev, [cookieId]: sseMessage }));
                }
              } catch {}
            }
          }
        }
        await pump();
      };
      pump();
    } catch (e) {
      console.error('SSE error', e);
    }
  }, [token]);

  const startLinking = async () => {
    if (!batchId) {
      addToast('info', 'يرجى توليد البطاقات أولاً');
      return;
    }
    if (selectedCookieIds.length === 0) {
      addToast('info', 'يرجى تحديد الكوكيز');
      return;
    }
    if (selectedServerIds.length === 0) {
      const proceed = confirm('لم يتم اختيار سيرفرات. سوف يتم الاستخدام الافتراضي. هل تريد المتابعة؟');
      if (!proceed) return;
    }
    setBusy(true);
    try {
      const prefs: any = {
        country,
        timezone,
        acceptLanguage,
      };
      if (currency) prefs.currency = currency;

      const res = await apiClient.post<EnqueueMappedResponse>(`/api/jobs/enqueue-mapped`, {
        batchId,
        cookieIds: selectedCookieIds,
        serverIds: selectedServerIds,
        rateLimitPerServer,
        healthCheck,
        preferences: prefs,
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
      // Stop old polling if any
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      // Start SSE subscription
      startSSE(mapping);
      addToast('success', `تم بدء الربط لعدد ${res.enqueued}`);
    } catch (e) {
      console.error(e);
      addToast('error', 'فشل بدء عملية الربط');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      try { if (sseAbortRef.current) sseAbortRef.current.abort(); } catch {}
    };
  }, []);

  const assignedLast4 = (idx: number) => preview[idx]?.last4 || '';

  const totalPages = Math.max(1, Math.ceil(cookiesTotal / limit));

  const applyTemplate = (tpl: Template) => {
    setBin(tpl.bin);
    setCountry(tpl.country || 'US');
    setExpStart(tpl.expStart || '');
    setExpEnd(tpl.expEnd || '');
    setSelectedServerIds(tpl.serverIds || []);
    setUseAutoFingerprint(tpl.useAuto ?? true);
    if (tpl.timezone) setTimezone(tpl.timezone);
    if (tpl.acceptLanguage) setAcceptLanguage(tpl.acceptLanguage);
    if (tpl.currency) setCurrency(tpl.currency);
    addToast('success', `تم تطبيق القالب: ${tpl.name}`);
  };

  const saveCurrentAsTemplate = () => {
    if (!templateName.trim()) { addToast('info', 'أدخل اسمًا للقالب'); return; }
    const tpl: Template = { name: templateName.trim(), bin, country, expStart, expEnd, serverIds: selectedServerIds, timezone, acceptLanguage, currency, useAuto: useAutoFingerprint };
    const list = [...templates.filter(t => t.name !== tpl.name), tpl];
    saveTemplates(list);
    setTemplateName('');
    addToast('success', 'تم حفظ القالب');
  };

  return (
    <div className="min-h-screen">
      {/* Toasts */}
      <div className="fixed bottom-4 right-4 space-y-2 z-50">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-2 rounded shadow text-white ${t.type === 'success' ? 'bg-green-600' : t.type === 'error' ? 'bg-red-600' : 'bg-blue-600'}`}>{t.message}</div>
        ))}
      </div>

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-slate-800">بدء المهام (ربط بطاقة واحدة لكل كوكيز)</h1>
        <Link href="/" className="text-blue-700 hover:underline">الرجوع</Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-lg border border-slate-200 bg-white">
          <h2 className="font-semibold mb-3 text-slate-800">اختيار السيرفرات</h2>
          <div className="space-y-2 max-h-56 overflow-auto">
            {servers.map(s => (
              <label key={s._id} className="flex items-center gap-2 text-slate-700">
                <input type="checkbox" checked={selectedServerIds.includes(String(s._id))} onChange={() => toggleServer(String(s._id))} />
                <span>{s.name}</span>
              </label>
            ))}
            {servers.length === 0 && <div className="text-sm text-slate-500">لا توجد سيرفرات متاحة</div>}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <label className="flex items-center justify-between gap-2 text-slate-700"><span>Rate/server</span><input className="w-20 border rounded px-2 py-1" type="number" min={1} max={100} value={rateLimitPerServer} onChange={e => setRateLimitPerServer(Number(e.target.value || 1))} /></label>
            <label className="flex items-center gap-2 text-slate-700"><input type="checkbox" checked={healthCheck} onChange={e => setHealthCheck(e.target.checked)} /> صحة السيرفر</label>
          </div>
          <div className="mt-4">
            <h3 className="font-medium mb-2 text-slate-800">القوالب</h3>
            <div className="flex items-center gap-2 mb-2">
              <input className="flex-1 border rounded px-3 py-1 text-sm" placeholder="اسم القالب" value={templateName} onChange={e => setTemplateName(e.target.value)} />
              <button className="px-3 py-1 rounded bg-gray-800 text-white text-sm" onClick={saveCurrentAsTemplate}>حفظ</button>
            </div>
            <div className="space-y-1 max-h-32 overflow-auto text-sm">
              {templates.map(tpl => (
                <div key={tpl.name} className="flex items-center justify-between">
                  <button className="text-blue-700 hover:underline" onClick={() => applyTemplate(tpl)}>{tpl.name}</button>
                  <button className="text-red-600" onClick={() => saveTemplates(templates.filter(x => x.name !== tpl.name))}>حذف</button>
                </div>
              ))}
              {templates.length === 0 && <div className="text-gray-500">لا توجد قوالب محفوظة</div>}
            </div>
          </div>
        </div>

        <div className="p-4 rounded-lg border border-slate-200 bg-white">
          <h2 className="font-semibold mb-3 text-slate-800">البصمة (الدولة/اللغة/المنطقة الزمنية)</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-slate-700">الدولة (ISO-2)</label>
                <select className="w-full border rounded px-3 py-2" value={country} onChange={(e) => setCountry(e.target.value)}>
                  {Object.keys(COUNTRY_PRESETS).map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 mt-6">
                <input type="checkbox" checked={useAutoFingerprint} onChange={e => setUseAutoFingerprint(e.target.checked)} />
                استخدام القيم التلقائية حسب الدولة
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-slate-700">Accept-Language</label>
                <select className="w-full border rounded px-3 py-2" value={acceptLanguage} onChange={(e) => setAcceptLanguage(e.target.value)} disabled={useAutoFingerprint}>
                  {languageOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-700">Timezone (IANA)</label>
                <select className="w-full border rounded px-3 py-2" value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={useAutoFingerprint}>
                  {timezoneOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-700">Currency (اختياري)</label>
                <select className="w-full border rounded px-3 py-2" value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={useAutoFingerprint}>
                  <option value="">(None)</option>
                  {currencyOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="rounded border border-slate-200 p-3 bg-slate-50 text-xs text-slate-700">
              <div className="font-medium mb-1">معاينة البصمة</div>
              <div>Country: {country}</div>
              <div>Timezone: {timezone || '(auto)'}</div>
              <div>Accept-Language: {acceptLanguage || '(auto)'}</div>
              <div>Currency: {currency || '(none)'}</div>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-lg border border-slate-200 bg-white">
          <h2 className="font-semibold mb-3 text-slate-800">توليد البطاقات (مؤقتًا)</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-slate-700">BIN</label>
              <input className="w-full border rounded px-3 py-2" placeholder="مثال: 411111" value={bin} onChange={(e) => setBin(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm text-slate-700">العدد (يساوي عدد الكوكيز المحددة)</label>
              <input className="w-full border rounded px-3 py-2" type="number" readOnly value={quantity} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-slate-700">Exp Start (YYYY-MM)</label>
                <input className="w-full border rounded px-3 py-2" placeholder="2026-01" value={expStart} onChange={(e) => setExpStart(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm text-slate-700">Exp End (YYYY-MM)</label>
                <input className="w-full border rounded px-3 py-2" placeholder="2029-12" value={expEnd} onChange={(e) => setExpEnd(e.target.value)} />
              </div>
            </div>
            <button disabled={busy} onClick={generateCards} className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50 hover:bg-blue-700">توليد البطاقات</button>
            {batchId && (
              <div className="text-sm text-green-700">تم التوليد. Batch: {batchId} (عدد {preview.length})</div>
            )}
          </div>
        </div>
      </div>

      {/* Control section: Start linking */}
      <div className="p-4 rounded-lg border border-slate-200 bg-white mb-6">
        <h2 className="font-semibold mb-3 text-slate-800">التحكم</h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled={!batchId || selectedCookieIds.length === 0 || busy}
            onClick={startLinking}
            className="px-4 py-2 rounded bg-green-600 text-white disabled:opacity-50 hover:bg-green-700"
          >
            بدء الربط
          </button>
          {!batchId && <span className="text-sm text-slate-600">قم بتوليد البطاقات أولًا</span>}
          {selectedCookieIds.length === 0 && <span className="text-sm text-slate-600">حدد الكوكيز</span>}
        </div>
      </div>

      <div className="p-4 rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-800">الكوكيز</h2>
          <div className="flex items-center gap-3 text-sm">
            <label className="flex items-center gap-2 text-slate-700"><span>بحث</span><input className="border rounded px-2 py-1" placeholder="c_user" value={search} onChange={e => setSearch(e.target.value)} /></label>
            <label className="flex items-center gap-2 text-slate-700"><span>صفحة</span><input className="w-16 border rounded px-2 py-1" type="number" min={1} max={totalPages} value={page} onChange={e => setPage(Math.max(1, Math.min(Number(e.target.value || 1), totalPages)))} /></label>
            <label className="flex items-center gap-2 text-slate-700"><span>عدد/صفحة</span><select className="border rounded px-2 py-1" value={limit} onChange={e => setLimit(Number(e.target.value))}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label>
            <label className="flex items-center gap-2 text-slate-700"><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} /> تحديد الكل</label>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm text-slate-800">
            <thead>
              <tr className="bg-slate-100 text-slate-900">
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
                const message = messageMap[id] ?? '';
                return (
                  <tr key={id} className="border-b">
                    <td className="p-2 text-center">
                      <input type="checkbox" checked={checked} onChange={() => toggleCookie(id)} />
                    </td>
                    <td className="p-2 font-mono text-xs text-slate-900">{id}</td>
                    <td className="p-2 text-slate-800">{c.c_user || '-'}</td>
                    <td className="p-2 text-slate-800">{batchId ? (last4 ? `**** **** **** ${last4}` : '-') : '-'}</td>
                    <td className="p-2 text-slate-800">{serverName || '-'}</td>
                    <td className="p-2">
                      <div className="w-40 bg-slate-200 rounded h-2 overflow-hidden">
                        <div className="bg-blue-600 h-2" style={{ width: `${prog}%` }} />
                      </div>
                      <div className="text-xs text-slate-800 mt-1">{prog}%</div>
                    </td>
                    <td className="p-2 text-xs text-slate-800">{status}{message ? ` - ${message}` : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-end gap-2 mt-3 text-sm">
          <button className="px-3 py-1 border rounded" onClick={() => setPage(p => Math.max(1, p - 1))}>السابق</button>
          <span>{page} / {totalPages}</span>
          <button className="px-3 py-1 border rounded" onClick={() => setPage(p => Math.min(totalPages, p + 1))}>التالي</button>
        </div>
      </div>
    </div>
  );
} 