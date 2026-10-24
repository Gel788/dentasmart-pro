'use client';

import { Suspense } from 'react';
import { Protected } from '@/components/protected';
import { Documents } from '@/components/documents/documents';

export default function DocumentsPage() {
  return <Protected><Suspense fallback={null}><Documents /></Suspense></Protected>;
}
