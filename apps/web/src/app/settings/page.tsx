'use client';

import { Protected } from '@/components/protected';
import { ClinicSettings } from '@/components/studio/clinic-settings';

export default function SettingsPage() {
  return (
    <Protected>
      <ClinicSettings />
    </Protected>
  );
}
