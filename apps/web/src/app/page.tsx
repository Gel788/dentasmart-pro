'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      router.replace(user ? '/reception' : '/login');
    }
  }, [user, loading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
      <p role="status" className="ds-card px-5 py-3 text-sm text-[var(--muted)]">Загрузка…</p>
    </div>
  );
}
