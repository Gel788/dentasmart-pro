'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Protected } from '@/components/protected';
import { api } from '@/lib/api';

type Profile = { name: string; phone: string | null; email: string | null; inn: string | null; branches: number; cabinets: number; doctors: number; services: number };

const STEPS = ['Клиника', 'Кресла', 'Врачи', 'Часы', 'Напоминания', 'Готово'];

export default function OnboardingPage() {
  return <Protected bare><Setup /></Protected>;
}

function Setup() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', inn: '' });
  const [hours, setHours] = useState('09:00–21:00');
  const [channel, setChannel] = useState('WhatsApp');
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api<Profile>('/showcase/onboarding').then((data) => {
      setProfile(data);
      setForm({ name: data.name, phone: data.phone ?? '', email: data.email ?? '', inn: data.inn ?? '' });
    }).catch((err: Error) => setError(err.message));
  }, []);

  const save = async () => {
    const next = await api<Profile>('/showcase/onboarding', { method: 'POST', body: JSON.stringify(form) });
    setProfile((current) => current ? { ...current, ...next } : current);
    setSaved('Название и контакты записаны в карточку клиники.');
    setStep(1);
  };

  return (
    <div className="wow-setup">
      <div className="wow-setup-card">
        <p className="wow-kicker">Около 10 минут · шаг {step + 1} из {STEPS.length}</p>
        <div className="wow-progress"><i style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
        <div className="wow-steps">{STEPS.map((label, index) => <span key={label} className={index === step ? 'on' : index < step ? 'done' : ''}>{label}</span>)}</div>
        {error && <p className="sd-chip danger">{error}</p>}
        {step === 0 && (
          <section>
            <h1>Как называется клиника</h1>
            <label>Название<input className="sd-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            <label>Телефон<input className="sd-input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
            <label>Почта<input className="sd-input" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
            <label>ИНН<input className="sd-input" value={form.inn} onChange={(event) => setForm({ ...form, inn: event.target.value })} /></label>
            <button className="sd-btn" type="button" onClick={() => void save().catch((err: Error) => setError(err.message))}>Дальше</button>
          </section>
        )}
        {step === 1 && (
          <section>
            <h1>{profile?.cabinets ?? 0} кресла уже в базе</h1>
            <p>Филиалов: {profile?.branches ?? 0}. Новые кресла добавляются в расписании, мастер их не стирает.</p>
            {saved && <p className="wow-note">{saved}</p>}
            <button className="sd-btn" type="button" onClick={() => setStep(2)}>Дальше</button>
          </section>
        )}
        {step === 2 && (
          <section>
            <h1>{profile?.doctors ?? 0} врача</h1>
            <p>В прайсе {profile?.services ?? 0} услуг. Врачи входят под своими почтами, цели месяца уже считаются.</p>
            <button className="sd-btn" type="button" onClick={() => setStep(3)}>Дальше</button>
          </section>
        )}
        {step === 3 && (
          <section>
            <h1>Часы стойки</h1>
            <div className="wow-choice">
              {['09:00–21:00', '08:00–20:00', '10:00–22:00'].map((option) => (
                <button key={option} className={hours === option ? 'on' : ''} type="button" onClick={() => setHours(option)}>{option}</button>
              ))}
            </div>
            <p className="sd-muted">Выбор хранится на этом компьютере и задаёт тон утренней сводки.</p>
            <button className="sd-btn" type="button" onClick={() => { localStorage.setItem('sd_hours', hours); setStep(4); }}>Дальше</button>
          </section>
        )}
        {step === 4 && (
          <section>
            <h1>Куда писать пациентам</h1>
            <div className="wow-choice">
              {['WhatsApp', 'Telegram', 'SMS'].map((option) => (
                <button key={option} className={channel === option ? 'on' : ''} type="button" onClick={() => setChannel(option)}>{option}</button>
              ))}
            </div>
            <p className="sd-muted">Канал для автопилота. Отправка в мессенджер в этой версии демонстрационная.</p>
            <button className="sd-btn" type="button" onClick={() => { localStorage.setItem('sd_channel', channel); setStep(5); }}>Дальше</button>
          </section>
        )}
        {step === 5 && (
          <section>
            <h1>{form.name || 'Клиника'} готова</h1>
            <p>Стойка работает {hours}. Напоминания: {channel}. Можно открыть утро.</p>
            <button className="sd-btn" type="button" onClick={() => router.push('/briefing')}>К утренней сводке</button>
          </section>
        )}
        {step > 0 && step < 5 && <button className="sd-btn-ghost" type="button" onClick={() => setStep((value) => value - 1)}>Назад</button>}
      </div>
    </div>
  );
}
