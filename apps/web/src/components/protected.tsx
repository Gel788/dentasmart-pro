'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { FocusProvider } from '@/lib/focus';
import { Shell } from './shell';

export function Protected({ children, bare = false }: { children: React.ReactNode; bare?: boolean }) {
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
          <p className="mt-4 text-sm text-[var(--muted)]">Загрузка Седракович Дент…</p>
        </div>
      </div>
    );
  }

  if (bare) return <>{children}</>;
  return (
    <FocusProvider>
      <Shell>{children}</Shell>
    </FocusProvider>
  );
}
