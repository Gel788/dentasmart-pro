'use client';

import { Suspense } from 'react';
import { Protected } from '@/components/protected';
import { Tasks } from '@/components/tasks/tasks';

export default function TasksPage() {
  return <Protected><Suspense fallback={null}><Tasks /></Suspense></Protected>;
}
