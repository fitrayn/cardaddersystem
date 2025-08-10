'use client';

import React, { useEffect, useState } from 'react';
import { apiClient } from '../lib/api';

interface ServerItem { _id: string; name: string; apiUrl: string; isActive?: boolean; successRate?: number; currentJobs?: number; maxConcurrentJobs?: number; }

export default function ServerManagementCompact() {
  const [servers, setServers] = useState<ServerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get<{ success: boolean; data: ServerItem[] }>(`/api/servers-metrics`);
      setServers(res.data || []);
    } catch (e) {
      console.error('Failed to load servers', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const onSave = async (id: string) => {
    const name = editing[id];
    if (!name || !name.trim()) return;
    try {
      await apiClient.put(`/api/servers/${id}`, { name });
      setEditing(prev => { const c = { ...prev }; delete c[id]; return c; });
      load();
    } catch (e) {
      console.error('Update failed', e);
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm('حذف هذا السيرفر؟')) return;
    try { await apiClient.delete(`/api/servers/${id}`); load(); } catch (e) { console.error('Delete failed', e); }
  };

  return (
    <div className="p-4 border border-slate-200 rounded-lg bg-white">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-slate-800">إدارة السيرفرات</h2>
        <button className="text-sm px-3 py-1 border rounded" onClick={load} disabled={loading}>{loading ? '...' : 'تحديث'}</button>
      </div>
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-100">
              <th className="p-2">الاسم</th>
              <th className="p-2">العنوان</th>
              <th className="p-2">نسبة النجاح</th>
              <th className="p-2">الاستخدام الحالي</th>
              <th className="p-2">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {servers.map(s => (
              <tr key={s._id} className="border-b">
                <td className="p-2">
                  {editing[s._id] !== undefined ? (
                    <div className="flex items-center gap-2">
                      <input className="border rounded px-2 py-1" value={editing[s._id]} onChange={e => setEditing({ ...editing, [s._id]: e.target.value })} />
                      <button className="px-2 py-1 bg-blue-600 text-white rounded" onClick={() => onSave(s._id)}>حفظ</button>
                      <button className="px-2 py-1 border rounded" onClick={() => setEditing(prev => { const c = { ...prev }; delete c[s._id]; return c; })}>إلغاء</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span>{s.name}</span>
                      <button className="text-blue-700" onClick={() => setEditing({ ...editing, [s._id]: s.name })}>تعديل</button>
                    </div>
                  )}
                </td>
                <td className="p-2 text-xs text-slate-600 break-all">{s.apiUrl}</td>
                <td className="p-2">{typeof s.successRate === 'number' ? `${s.successRate}%` : '-'}</td>
                <td className="p-2">{s.currentJobs ?? '-'}/{s.maxConcurrentJobs ?? '-'}</td>
                <td className="p-2">
                  <button className="px-2 py-1 border rounded text-red-600" onClick={() => onDelete(s._id)}>حذف</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
} 