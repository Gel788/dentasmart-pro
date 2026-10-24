'use client';

import { Protected } from '@/components/protected';
import { Today } from '@/components/today/today';
import { useAuth } from '@/lib/auth-context';

export default function HomePage() {
  return (
    <Protected>
      <HomeBody />
    </Protected>
  );
}

/** One working day for everyone, shaped by role: a doctor sees their own patients, reception the desk's
 * actions, the owner also the month; money and quick actions follow each person's permissions. */
function HomeBody() {
  const { user } = useAuth();
  return <Today owner={user?.permissions.includes('analytics.read') ?? false} permissions={user?.permissions ?? []} />;
}
