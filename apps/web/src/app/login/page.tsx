'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { isDemo } from '@/lib/demo/mode';

const ROLES = [
  { role: 'owner', email: 'owner@demo.local', title: 'Владелец', text: 'Выручка, загрузка, конверсия планов' },
  { role: 'doctor', email: 'doctor@demo.local', title: 'Врач', text: 'Мой день, формула, планы' },
  { role: 'admin', email: 'admin@demo.local', title: 'Администратор', text: 'Стойка, кресла, долги' },
];

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  // The demo prefills its shared password; a live clinic signs in with its own.
  const demo = isDemo();
  const [email, setEmail] = useState(demo ? 'owner@demo.local' : '');
  const [password, setPassword] = useState(demo ? 'demo12345' : '');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [needCode, setNeedCode] = useState(false);
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);

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
    if (!demo) return;
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
      await login(email, password, needCode ? code : undefined);
    } catch (err) {
      if (err instanceof ApiError && err.body.requires2fa) {
        setNeedCode(true);
        setCode('');
      }
      setError(err instanceof Error ? err.message : 'Не удалось войти');
      setPending(false);
    }
  };

  return (
    <main className="sd-login">
      <section className="sd-login-hero">
        <div className="sd-login-brand">
          <span className="sd-mark" aria-hidden>С</span>
          <span>
            <strong>Седракович Дент</strong>
            <small>стоматология</small>
          </span>
        </div>
        <div className="sd-login-copy">
          <h1>Карта, формула и&nbsp;план лечения на одном экране.</h1>
          <p>{demo ? 'Демо-клиника в Москве. Пароль для всех ролей — demo12345.' : 'Рабочее место врачей и администраторов клиники.'}</p>
        </div>
        <Formula />
      </section>
      <section className="sd-login-panel">
        <form className="sd-login-form" onSubmit={onSubmit}>
          <div className="sd-login-mobile-brand">
            <span className="sd-mark" aria-hidden>С</span>
            <strong>Седракович Дент</strong>
          </div>
          <div className="sd-login-title">
            <h2>Вход</h2>
            <p>{needCode ? 'Введите шестизначный код из приложения-аутентификатора.' : 'Рабочая почта и пароль клиники.'}</p>
          </div>
          {demo && (
            <div className="sd-login-roles">
              {ROLES.map((role) => (
                <button key={role.role} className="sd-role" type="button" disabled={pending} onClick={() => enter(role.email)}>
                  <b>{role.title}</b>
                  <span>{role.text}</span>
                </button>
              ))}
            </div>
          )}
          <label className="sd-login-field">
            <span>Почта</span>
            <input type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@clinic.ru" />
          </label>
          <label className="sd-login-field">
            <span>Пароль</span>
            <span className="sd-login-pass">
              <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" onClick={() => setShowPassword((on) => !on)} aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'} aria-pressed={showPassword}>
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            </span>
          </label>
          {needCode && (
            <label className="sd-login-field">
              <span>Код из приложения</span>
              <input
                className="sd-login-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </label>
          )}
          {error && <p role="alert" className="sd-login-error">{error}</p>}
          <button className="sd-login-submit" disabled={pending} type="submit">
            {pending ? 'Входим…' : needCode ? 'Подтвердить' : 'Войти'}
            {!pending && <ArrowRight />}
          </button>
          <p className="sd-login-help">Нет доступа или забыли пароль — попросите администратора клиники.</p>
        </form>
      </section>
    </main>
  );
}

const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const MARKED: Record<number, 'done' | 'plan'> = { 16: 'done', 26: 'plan', 36: 'plan', 46: 'done', 11: 'done', 24: 'plan' };

/** The dental chart as the clinic knows it: FDI numbers, two jaws, a few teeth treated and planned. */
function Formula() {
  const row = (teeth: number[]) => (
    <div className="sd-formula-row">
      {teeth.map((tooth) => <span key={tooth} data-mark={MARKED[tooth]}>{tooth}</span>)}
    </div>
  );
  return (
    <figure className="sd-formula" aria-hidden>
      {row(UPPER)}
      {row(LOWER)}
      <figcaption><i data-mark="done" />вылечено<i data-mark="plan" />в плане</figcaption>
    </figure>
  );
}
