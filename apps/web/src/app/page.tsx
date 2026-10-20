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

/** One working day for everyone; the owner also sees a line about the month. */
function HomeBody() {
  const { user } = useAuth();
  return <Today owner={user?.permissions.includes('analytics.read') ?? false} />;
}
