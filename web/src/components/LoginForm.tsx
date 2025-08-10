'use client';

import { useState } from 'react';
import { useAuth } from '../lib/auth-context';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading, error } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(email, password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-black">
      <div className="max-w-md w-full">
        <div className="rounded-lg border golden-border card-dark p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold golden-text mb-2">تسجيل الدخول</h1>
            <p className="label-dim">أدخل بياناتك للوصول للنظام</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="border border-red-700/60 bg-red-900/20 rounded-md p-4">
                <div className="text-red-400 font-medium">خطأ:</div>
                <div className="text-red-300">{error}</div>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium label-dim mb-2">البريد الإلكتروني</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 border rounded-md input-dark focus:outline-none focus:ring-2 focus:ring-[var(--gold-hex)] focus:border-[var(--gold-hex)]"
                placeholder="أدخل بريدك الإلكتروني"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium label-dim mb-2">كلمة المرور</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2 border rounded-md input-dark focus:outline-none focus:ring-2 focus:ring-[var(--gold-hex)] focus:border-[var(--gold-hex)]"
                placeholder="أدخل كلمة المرور"
              />
            </div>

            <button type="submit" disabled={isLoading} className="w-full btn-gold font-medium py-2 px-4 rounded-md">
              {isLoading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm label-dim">
            <p>للحصول على حساب جديد، راجع المسؤول</p>
          </div>
        </div>
      </div>
    </div>
  );
} 