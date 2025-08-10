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
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[var(--gold-hex)] mx-auto mb-3"></div>
          <p className="text-sm label-dim">جاري التحميل...</p>
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
        <h1 className="text-xl font-semibold golden-text">لوحة التحكم</h1>
        <div className="flex gap-2">
          <Link href="/linking" className="px-4 py-2 rounded btn-gold">بدء المهام</Link>
          <Link href="/" className="px-4 py-2 rounded border golden-border">تحديث</Link>
        </div>
      </div>
      <div className="rounded-lg border golden-border card-dark">
        <Dashboard />
      </div>
    </div>
  );
}
