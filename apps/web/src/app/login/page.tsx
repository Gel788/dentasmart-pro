'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Shield, Calendar, BarChart3 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

const features = [
  { icon: Calendar, text: 'Расписание и умные слоты' },
  { icon: BarChart3, text: 'Аналитика и финансы' },
  { icon: Shield, text: 'Медкарта и планы лечения' },
];

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('owner@demo.local');
  const [password, setPassword] = useState('demo12345');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    router.replace('/dashboard');
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <div className="hidden flex-1 flex-col justify-between bg-[var(--sidebar)] p-12 text-white lg:flex">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--blue)]">
              <Sparkles size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold">DentaSmart Pro</p>
              <p className="text-sm text-white/50">CRM для стоматологических клиник</p>
            </div>
          </div>
          <h2 className="mt-16 max-w-md text-3xl font-bold leading-tight">
            Управляйте клиникой в одном окне
          </h2>
          <p className="mt-4 max-w-sm text-white/60">
            Пациенты, расписание, финансы, склад и маркетинг — без Excel и разрозненных сервисов.
          </p>
          <ul className="mt-10 space-y-4">
            {features.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-white/80">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                  <Icon size={18} className="text-[var(--accent)]" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/30">© DentaSmart Pro · Внутренняя CRM</p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-[var(--bg)] p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <p className="text-xl font-bold ds-gradient-text">DentaSmart Pro</p>
          </div>
          <div className="ds-card p-8 shadow-[var(--shadow-lg)]">
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

            <p className="mt-6 rounded-xl bg-[var(--surface-muted)] px-4 py-3 text-center text-xs text-[var(--muted)]">
              Демо: <span className="font-medium text-[var(--text-secondary)]">owner@demo.local</span> / demo12345
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
