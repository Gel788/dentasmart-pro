'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, clearToken, ensureAssetToken, getToken, setAssetToken, setToken } from './api';

interface AuthState {
  id: string;
  email: string;
  organization: { id: string; name: string; slug: string };
  employee?: { id: string; firstName: string; lastName: string } | null;
  permissions: string[];
}

interface AuthContextValue {
  user: AuthState | null;
  loading: boolean;
  login: (email: string, password: string, code?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api<AuthState>('/auth/me');
      await ensureAssetToken();
      setUser(me);
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const login = async (email: string, password: string, code?: string) => {
    const res = await api<{ accessToken: string; refreshToken?: string; assetToken?: string; user: AuthState }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, ...(code ? { code } : {}) }),
    });
    setToken(res.accessToken);
    if (res.refreshToken) localStorage.setItem('dsp_refresh', res.refreshToken);
    setAssetToken(res.assetToken);
    setUser(res.user);
  };

  const logout = () => {
    clearToken();
    localStorage.removeItem('dsp_refresh');
    setUser(null);
    if (typeof window !== 'undefined') window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth вне AuthProvider');
  return ctx;
}
