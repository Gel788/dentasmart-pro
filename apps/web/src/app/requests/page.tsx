'use client';

import { Protected } from '@/components/protected';
import { Requests } from '@/components/requests/requests';

export default function RequestsPage() {
  return <Protected><Requests /></Protected>;
}
