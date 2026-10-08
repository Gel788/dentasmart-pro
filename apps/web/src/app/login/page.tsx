'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/reception');
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
      <p role="status" className="text-sm text-[var(--muted)]">Открываем клинику…</p>
    </div>
  );
}
