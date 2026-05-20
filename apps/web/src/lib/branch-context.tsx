'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from './api';
import { useAuth } from './auth-context';

export interface BranchOption {
  id: string;
  name: string;
  cabinets: { id: string; name: string; purpose: string }[];
}

interface BranchContextValue {
  branches: BranchOption[];
  branchId: string;
  branch: BranchOption | null;
  setBranchId: (id: string) => void;
  loading: boolean;
  refresh: () => Promise<void>;
}

const STORAGE_KEY = 'dsp_branch_id';

const BranchContext = createContext<BranchContextValue | null>(null);

export function BranchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [branchId, setBranchIdState] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setBranches([]);
      setBranchIdState('');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await api<BranchOption[]>('/branches');
      setBranches(list);
      const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      const valid = list.find((b) => b.id === stored);
      const next = valid?.id ?? list[0]?.id ?? '';
      setBranchIdState(next);
      if (next && typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, next);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setBranchId = useCallback((id: string) => {
    setBranchIdState(id);
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const branch = useMemo(
    () => branches.find((b) => b.id === branchId) ?? null,
    [branches, branchId],
  );

  return (
    <BranchContext.Provider value={{ branches, branchId, branch, setBranchId, loading, refresh }}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error('useBranch вне BranchProvider');
  return ctx;
}
