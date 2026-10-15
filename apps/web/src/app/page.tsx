'use client';

import { useEffect, useState } from 'react';
import { Protected } from '@/components/protected';
import { DeskHome, DoctorHome, OwnerHome } from '@/components/studio/homes';
import { api } from '@/lib/api';

export default function HomePage() {
  return (
    <Protected>
      <HomeBody />
    </Protected>
  );
}

function HomeBody() {
  const [data, setData] = useState<{ role: string } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ role: string }>('/workspace/home').then(setData).catch((err: Error) => setError(err.message));
  }, []);
  if (error) return <p>{error}</p>;
  if (!data) return (
    <div className="sd-skel-page">
      <div className="sd-skel" style={{ width: 180, height: 28 }} />
      <div className="sd-skel-metrics">{[0, 1, 2, 3].map((item) => <div key={item} className="sd-skel sd-skel-card" />)}</div>
      <div className="sd-skel" style={{ height: 180 }} />
    </div>
  );
  if (data.role === 'owner') return <OwnerHome data={data as never} />;
  if (data.role === 'doctor') return <DoctorHome data={data as never} />;
  return <DeskHome data={data as never} />;
}
