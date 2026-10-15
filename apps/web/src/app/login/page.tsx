'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('owner@demo.local');
  const [password, setPassword] = useState('demo12345');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const enter = async (nextEmail: string, nextPassword = 'demo12345') => {
    setEmail(nextEmail);
    setPassword(nextPassword);
    setError('');
    setPending(true);
    try {
      await login(nextEmail, nextPassword);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти');
      setPending(false);
    }
  };

  useEffect(() => {
    const role = new URLSearchParams(window.location.search).get('role');
    const preset: Record<string, string> = {
      owner: 'owner@demo.local',
      doctor: 'doctor@demo.local',
      admin: 'admin@demo.local',
    };
    if (role && preset[role]) void enter(preset[role]);
    // Только первый заход по ссылке роли.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    const perms = user.permissions ?? [];
    if (perms.includes('analytics.read')) router.replace('/dashboard');
    else if (perms.includes('medical.write')) router.replace('/clinical');
    else router.replace('/reception');
  }, [user, loading, router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setPending(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти');
      setPending(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
      <section className="relative hidden overflow-hidden bg-[#141c22] text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(45,212,191,0.22),transparent_36%),radial-gradient(circle_at_80%_0%,rgba(231,196,138,0.16),transparent_32%)]" />
        <div className="relative">
          <p className="ds-display text-2xl">Седракович Дент</p>
          <p className="mt-2 text-sm text-white/60">CRM для стоматологической клиники</p>
        </div>
        <div className="relative max-w-md">
          <p className="ds-display text-4xl leading-tight">Карта пациента и план лечения — в одном кресле.</p>
          <p className="mt-4 text-sm leading-relaxed text-white/70">
            Формула FDI, аллергии, этапы плана, прайс и запись на визит. Врач ведёт карту, ресепшн — расписание и кассу, владелец — цифры клиники.
          </p>
        </div>
        <p className="relative text-xs text-white/40">Sedrakovich Dent · демо-клиника · Москва</p>
      </section>
      <section className="flex items-center justify-center px-6 py-16">
        <form onSubmit={onSubmit} className="w-full max-w-sm">
          <p className="ds-display mb-6 text-2xl text-[var(--text)] lg:hidden">Седракович Дент</p>
          <p className="ds-kicker">Вход</p>
          <h1 className="ds-display mt-2 text-3xl text-[var(--text)]">Добро пожаловать</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">Войдите под своей ролью. Для обзора клиники подойдёт владелец.</p>
          <label className="mt-8 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Email
            <input className="ds-input mt-1.5" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Пароль
            <input className="ds-input mt-1.5" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <p className="mt-4 rounded-xl bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p>}
          <button
            type="submit"
            disabled={pending || loading}
            className="mt-6 w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            {pending ? 'Входим…' : 'Войти в клинику'}
          </button>
          <div className="mt-6 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Демо в один клик</p>
            <div className="grid gap-2">
              {[
                { role: 'owner', email: 'owner@demo.local', title: 'Владелец', hint: 'Дашборд, финансы, персонал' },
                { role: 'doctor', email: 'doctor@demo.local', title: 'Врач', hint: 'Карта, формула, план лечения' },
                { role: 'admin', email: 'admin@demo.local', title: 'Ресепшн', hint: 'Расписание, запись, касса' },
              ].map((item) => (
                <button
                  key={item.role}
                  type="button"
                  disabled={pending}
                  onClick={() => enter(item.email)}
                  className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left transition hover:border-[var(--accent)]"
                >
                  <span>
                    <span className="block text-sm font-semibold text-[var(--text)]">{item.title}</span>
                    <span className="block text-xs text-[var(--muted)]">{item.hint}</span>
                  </span>
                  <span className="text-xs text-[var(--accent)]">Войти</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-[var(--muted)]">Пароль демо: demo12345. Ссылки: /login?role=owner, doctor или admin.</p>
          </div>
        </form>
      </section>
    </div>
  );
}
