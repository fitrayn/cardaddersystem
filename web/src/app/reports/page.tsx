'use client';

import React, { useEffect, useState } from 'react';
import { apiClient } from '../../lib/api';
import Link from 'next/link';

type Summary = { totalCards: number; totalCookies: number; totalJobs: number; successRate: number };

type TopCountry = { country: string; count: number };

type CommonError = { error: string; count: number };

export default function ReportsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [topCountries, setTopCountries] = useState<TopCountry[]>([]);
  const [commonErrors, setCommonErrors] = useState<CommonError[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const s = await apiClient.get<Summary>('/api/stats/summary');
        const c = await apiClient.get<{ items: TopCountry[] }>('/api/stats/top-countries');
        const e = await apiClient.get<{ items: CommonError[] }>('/api/stats/common-errors');
        setSummary(s);
        setTopCountries(c.items || []);
        setCommonErrors(e.items || []);
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-600">جاري التحميل...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">التقارير</h1>
        <Link className="text-blue-700 hover:underline" href="/">الرجوع</Link>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-white border border-slate-200 rounded">
            <div className="text-xs text-slate-500">إجمالي الكروت</div>
            <div className="text-2xl font-bold text-slate-800">{summary.totalCards}</div>
          </div>
          <div className="p-4 bg-white border border-slate-200 rounded">
            <div className="text-xs text-slate-500">إجمالي الكوكيز</div>
            <div className="text-2xl font-bold text-slate-800">{summary.totalCookies}</div>
          </div>
          <div className="p-4 bg-white border border-slate-200 rounded">
            <div className="text-xs text-slate-500">إجمالي المهام</div>
            <div className="text-2xl font-bold text-slate-800">{summary.totalJobs}</div>
          </div>
          <div className="p-4 bg-white border border-slate-200 rounded">
            <div className="text-xs text-slate-500">نسبة النجاح</div>
            <div className="text-2xl font-bold text-slate-800">{summary.successRate}%</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-4 bg-white border border-slate-200 rounded">
          <h2 className="font-semibold text-slate-800 mb-3">الدول الأكثر استخداماً</h2>
          <div className="space-y-2">
            {topCountries.map((i) => (
              <div key={i.country} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">{i.country}</span>
                <span className="text-slate-900 font-medium">{i.count}</span>
              </div>
            ))}
            {topCountries.length === 0 && <div className="text-slate-500 text-sm">لا توجد بيانات</div>}
          </div>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded">
          <h2 className="font-semibold text-slate-800 mb-3">الأخطاء الشائعة</h2>
          <div className="space-y-2">
            {commonErrors.map((i) => (
              <div key={i.error} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">{i.error}</span>
                <span className="text-slate-900 font-medium">{i.count}</span>
              </div>
            ))}
            {commonErrors.length === 0 && <div className="text-slate-500 text-sm">لا توجد بيانات</div>}
          </div>
        </div>
      </div>
    </div>
  );
} 