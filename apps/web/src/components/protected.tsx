'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Shell } from './shell';

export function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
          <p className="mt-4 text-sm text-[var(--muted)]">Загрузка Sedrakoich dent…</p>
        </div>
      </div>
    );
  }

  return <Shell>{children}</Shell>;
}
