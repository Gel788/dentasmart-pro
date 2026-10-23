'use client';

import { Suspense } from 'react';
import { Protected } from '@/components/protected';
import { Reports } from '@/components/reports/reports';

export default function ReportsPage() {
  return <Protected><Suspense fallback={null}><Reports /></Suspense></Protected>;
}
