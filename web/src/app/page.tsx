'use client';

import { useAuth } from '../lib/auth-context';
import LoginForm from '../components/LoginForm';
import Dashboard from '../components/Dashboard';
import Link from 'next/link';

export default function Home() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
          <p className="text-sm text-slate-600">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold text-slate-800">لوحة التحكم</h1>
        <div className="flex gap-2">
          <Link href="/linking" className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700">بدء المهام</Link>
          <a href="/" className="px-4 py-2 rounded border border-slate-300 text-slate-700 hover:bg-slate-100">تحديث</a>
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white">
        <Dashboard />
      </div>
    </div>
  );
}
