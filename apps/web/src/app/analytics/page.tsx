'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** The old analytics board: its figures now live in the reports, with a period and definitions. */
export default function AnalyticsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/reports'); }, [router]);
  return null;
}
