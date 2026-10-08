'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/reception');
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
      <p role="status" className="ds-card px-5 py-3 text-sm text-[var(--muted)]">Загрузка…</p>
    </div>
  );
}
