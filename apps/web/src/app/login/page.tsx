'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

const ROLES = [
  { role: 'owner', email: 'owner@demo.local', title: 'Владелец', text: 'Выручка, загрузка, конверсия планов' },
  { role: 'doctor', email: 'doctor@demo.local', title: 'Врач', text: 'Мой день, формула, планы' },
  { role: 'admin', email: 'admin@demo.local', title: 'Администратор', text: 'Стойка, кресла, долги' },
];

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('owner@demo.local');
  const [password, setPassword] = useState('demo12345');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const enter = async (nextEmail: string) => {
    setEmail(nextEmail);
    setError('');
    setPending(true);
    try {
      await login(nextEmail, 'demo12345');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти');
      setPending(false);
    }
  };

  useEffect(() => {
    const role = new URLSearchParams(window.location.search).get('role');
    const preset = ROLES.find((item) => item.role === role);
    if (preset) void enter(preset.email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading && user) router.replace('/');
  }, [user, loading, router]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти');
      setPending(false);
    }
  };

  return (
    <main className="sd-login">
      <section className="sd-login-hero">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div className="sd-mark">С</div>
          <div>
            <strong style={{ display: 'block', letterSpacing: '-0.04em' }}>Седракович Дент</strong>
            <span style={{ color: '#99f6e4', fontSize: 12 }}>Sedrakovich Dent</span>
          </div>
        </div>
        <div>
          <h1>Карта, формула и три плана на одном экране.</h1>
          <p style={{ color: '#a7f3d0', maxWidth: 420 }}>Демо-клиника в Москве. Пароль для всех ролей — demo12345.</p>
        </div>
      </section>
      <section className="sd-login-panel">
        <form onSubmit={onSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={{ margin: '0 0 8px', letterSpacing: '-0.04em', fontSize: 28 }}>Войти</h2>
          {ROLES.map((role) => (
            <button key={role.role} className="sd-btn-ghost sd-role" type="button" disabled={pending} onClick={() => enter(role.email)}>
              <b>{role.title}</b>
              <div className="sd-muted">{role.text}</div>
            </button>
          ))}
          <label className="sd-field"><span>Почта</span><input className="sd-input" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="sd-field"><span>Пароль</span><input className="sd-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {error && <p className="sd-chip danger">{error}</p>}
          <button className="sd-btn" disabled={pending} type="submit">{pending ? 'Входим…' : 'Продолжить'}</button>
        </form>
      </section>
    </main>
  );
}
