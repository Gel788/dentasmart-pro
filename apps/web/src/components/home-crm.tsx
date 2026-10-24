'use client';

import { Protected } from '@/components/protected';
import { Today } from '@/components/today/today';
import { useAuth } from '@/lib/auth-context';

/** The working day. Guests never load this: the public front page is the ZAZA landing. */
export default function HomeCrm() {
  const { user } = useAuth();
  return (
    <Protected>
      <Today owner={user?.permissions.includes('analytics.read') ?? false} permissions={user?.permissions ?? []} />
    </Protected>
  );
}
