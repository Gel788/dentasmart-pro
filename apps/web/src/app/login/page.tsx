'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

const hours = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];

const features = [
  'День клиники в одном расписании',
  'Карта, зубы и план лечения',
  'Касса, аванс и долг пациента',
];

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showDemo, setShowDemo] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/reception');
  }, [loading, user, router]);

  useEffect(() => {
    const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    setShowDemo(local);
    if (local) {
      setEmail((value) => value || 'owner@demo.local');
      setPassword((value) => value || 'demo12345');
    }
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <p className="text-sm text-[var(--muted)]">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-[var(--sidebar)] p-12 text-white lg:flex">
        <div className="pointer-events-none absolute inset-y-0 right-10 flex flex-col justify-between py-16 text-right text-[11px] tracking-[0.14em] text-white/25" aria-hidden>
          {hours.map((hour) => (
            <span key={hour}>{hour}</span>
          ))}
        </div>
        <div className="relative max-w-lg">
          <div className="flex items-center gap-3">
            <span className="ds-display flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--accent)] text-lg text-white">
              D
            </span>
            <div>
              <p className="ds-display text-xl text-white">Sedrakoich dent</p>
              <p className="text-sm text-white/45">Клиника в одном окне</p>
            </div>
          </div>
          <h2 className="ds-display mt-20 max-w-md text-4xl leading-[1.12] text-white">
            День начинается с кресла, а не с отчёта
          </h2>
          <p className="mt-4 max-w-sm text-white/60">
            Пациенты, расписание, финансы, склад и маркетинг — без Excel и разрозненных сервисов.
          </p>
          <ul className="mt-10 space-y-3 border-l border-white/15 pl-4">
            {features.map((text) => (
              <li key={text} className="text-sm text-white/80">{text}</li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/30">© Sedrakoich dent · Внутренняя CRM</p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-[var(--bg)] p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <p className="ds-display text-xl">Sedrakoich dent</p>
          </div>
          <div className="ds-card p-8">
            <h1 className="text-2xl font-bold text-[var(--text)]">Добро пожаловать</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">Войдите в рабочую область клиники</p>

            <form onSubmit={onSubmit} className="mt-8 space-y-5">
              <div>
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              </div>
              <div>
                <Label>Пароль</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
              </div>
              {error && (
                <p className="rounded-lg bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p>
              )}
              <Button type="submit" disabled={submitting} className="w-full" size="lg">
                {submitting ? 'Вход…' : 'Войти в систему'}
              </Button>
            </form>

            {showDemo && (
              <p className="mt-6 rounded-xl bg-[var(--surface-muted)] px-4 py-3 text-center text-xs text-[var(--muted)]">
                Демо: <span className="font-medium text-[var(--text-secondary)]">owner@demo.local</span> / demo12345
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
