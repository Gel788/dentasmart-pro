'use client';

import { useState } from 'react';
import { Protected } from '@/components/protected';
import { ClinicSettings } from '@/components/studio/clinic-settings';
import { api } from '@/lib/api';

export default function SettingsPage() {
  return (
    <Protected>
      <ClinicSettings />
      <TwoFactor />
    </Protected>
  );
}

function TwoFactor() {
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  return (
    <section className="sd-card sd-stack" style={{ marginTop: 16 }}>
      <strong>Вход с кодом</strong>
      <div className="cfg-new">
        <button className="sd-btn-ghost" type="button" onClick={() => void api<{ secret: string }>('/auth/2fa/setup', { method: 'POST' }).then((row) => setSecret(row.secret))}>Секрет</button>
        {secret && <span className="sd-muted">{secret}</span>}
        <input className="sd-input" placeholder="Код" value={code} onChange={(event) => setCode(event.target.value)} />
        <button className="sd-btn" type="button" onClick={() => void api('/auth/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) }).then(() => setNote('Включено')).catch((err: Error) => setNote(err.message))}>Включить</button>
      </div>
      {note && <p className="sd-muted">{note}</p>}
    </section>
  );
}
