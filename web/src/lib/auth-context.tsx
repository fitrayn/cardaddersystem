'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiClient } from './api';

interface User {
  id: string;
  email: string;
  role: 'admin' | 'operator';
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Restore token and user on mount
    const savedToken = localStorage.getItem('auth_token');
    const savedUser = localStorage.getItem('auth_user');
    if (savedToken) {
      setToken(savedToken);
      apiClient.setAuthToken(savedToken);
      try {
        if (savedUser) setUser(JSON.parse(savedUser));
      } catch {}
      // Optionally validate token and refresh user profile
      (async () => {
        try {
          const me = await apiClient.get<{ id: string; email: string; role: 'admin' | 'operator' }>(`/api/auth/me`);
          setUser({ id: me.id, email: me.email, role: me.role });
          localStorage.setItem('auth_user', JSON.stringify(me));
        } catch {}
        setIsLoading(false);
      })();
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await apiClient.post<{ token: string }>(`/api/auth/login`, { email, password });
      if (response.token) {
        setToken(response.token);
        apiClient.setAuthToken(response.token);
        localStorage.setItem('auth_token', response.token);
        // Fetch user profile after login
        try {
          const me = await apiClient.get<{ id: string; email: string; role: 'admin' | 'operator' }>(`/api/auth/me`);
          setUser({ id: me.id, email: me.email, role: me.role });
          localStorage.setItem('auth_user', JSON.stringify(me));
        } catch {
          setUser({ id: 'temp-id', email, role: 'operator' });
        }
        return true;
      }
      return false;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'فشل تسجيل الدخول';
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    apiClient.clearAuthToken();
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
  };

  const value: AuthContextType = {
    user,
    token,
    login,
    logout,
    isLoading,
    error
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
} 