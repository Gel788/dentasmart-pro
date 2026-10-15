'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ClinicalRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/patients'); }, [router]);
  return null;
}
