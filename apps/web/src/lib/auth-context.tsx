'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, clearToken, getToken, setToken } from './api';

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
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const GUEST: AuthState = {
  id: 'guest',
  email: 'test@sedrakoich.local',
  organization: { id: 'demo', name: 'Sedrakoich dent', slug: 'demo' },
  employee: { id: 'guest', firstName: 'Тест', lastName: 'клиники' },
  permissions: [],
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    if (!getToken()) {
      setUser(GUEST);
      setLoading(false);
      return;
    }
    try {
      const me = await api<AuthState>('/auth/me');
      setUser(me);
    } catch {
      clearToken();
      setUser(GUEST);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const login = async (email: string, password: string) => {
    const res = await api<{ accessToken: string; refreshToken?: string; user: AuthState }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(res.accessToken);
    if (res.refreshToken) localStorage.setItem('dsp_refresh', res.refreshToken);
    setUser(res.user);
  };

  const logout = () => {
    clearToken();
    localStorage.removeItem('dsp_refresh');
    setUser(GUEST);
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
