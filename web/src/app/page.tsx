'use client';

import { useAuth } from '../lib/auth-context';
import LoginForm from '../components/LoginForm';
import Dashboard from '../components/Dashboard';
import Link from 'next/link';

export default function Home() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-xl text-gray-600">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  return (
    <div className="min-h-screen">
      <div className="p-4 flex justify-end">
        <Link href="/linking" className="px-4 py-2 rounded bg-green-600 text-white">بدء المهام</Link>
      </div>
      <Dashboard />
    </div>
  );
}
