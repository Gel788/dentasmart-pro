'use client';

import dynamic from 'next/dynamic';
import { useLayoutEffect, useState } from 'react';
import { getToken } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Landing } from './landing';

const HomeCrm = dynamic(() => import('@/components/home-crm'), { ssr: false });

/** Guests get the marketing page. A signed-in clinic lands in the working day, same as before. */
export function HomeGate() {
  const { user, loading } = useAuth();
  const [app, setApp] = useState(false);

  useLayoutEffect(() => {
    if (getToken()) setApp(true);
  }, []);

  useLayoutEffect(() => {
    if (loading) return;
    setApp(Boolean(user));
  }, [loading, user]);

  if (app) return <HomeCrm />;
  return <Landing />;
}
