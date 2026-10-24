'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Check, Printer, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import styles from './documents.module.css';

type Row = { id: string; kind: string; number: string; title: string; status: string; createdAt: string; signedAt: string | null; scanUrl: string | null; voidReason: string | null; blocking: boolean; patient: { id: string; name: string }; visit: { id: string; startsAt: string } | null };
type Requisites = { [key: string]: string | null | string[] | undefined; missing?: string[] };
type Tab = 'waiting' | 'all' | 'clinic' | 'tax' | 'egisz';

const TABS: { id: Tab; label: string }[] = [
  { id: 'waiting', label: 'Ждут подписи' },
  { id: 'all', label: 'Все документы' },
  { id: 'tax', label: 'Справка для налоговой' },
  { id: 'clinic', label: 'Реквизиты и лицензия' },
  { id: 'egisz', label: 'ЕРИС и ЕГИСЗ' },
];
const STATE: Record<string, string> = { CREATED: 'к печати', PRINTED: 'ждёт подписи', SIGNED: 'подписан', VOID: 'аннулирован' };
const date = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** All patient papers: what waits for a signature, the archive, the clinic's requisites, the tax certificate. */
export function Documents() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = (TABS.find((item) => item.id === params.get('tab'))?.id ?? 'waiting') as Tab;
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1>Документы</h1>
          <p>Договор, согласия и анкета создаются сами к первому визиту, согласие на вмешательство — к каждой услуге, акт — после приёма. Распечатайте, дайте подписать, отметьте «Подписан».</p>
        </div>
      </header>
      <nav className={styles.tabs} aria-label="Разделы документов">
        {TABS.map((item) => (
          <button key={item.id} type="button" aria-current={tab === item.id ? 'page' : undefined} onClick={() => router.replace(`/documents?tab=${item.id}`)}>{item.label}</button>
        ))}
      </nav>
      {(tab === 'waiting' || tab === 'all') && <Journal waiting={tab === 'waiting'} />}
      {tab === 'clinic' && <ClinicForm />}
      {tab === 'tax' && <TaxForm />}
      {tab === 'egisz' && <Egisz />}
    </div>
  );
}

export function Journal({ waiting, patientId }: { waiting: boolean; patientId?: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(() => {
    const query = new URLSearchParams({ ...(waiting ? { status: 'waiting' } : {}), ...(patientId ? { patientId } : {}) });
    return api<Row[]>(`/documents?${query}`).then(setRows).catch((err: Error) => setError(err.message));
  }, [waiting, patientId]);
  useEffect(() => { setRows(null); void load(); }, [load]);

  const shown = useMemo(() => {
    const words = query.trim().toLocaleLowerCase('ru-RU');
    return (rows ?? []).filter((row) => !words || `${row.patient.name} ${row.number} ${row.title}`.toLocaleLowerCase('ru-RU').includes(words));
  }, [rows, query]);

  const act = async (id: string, path: 'signed' | 'void', body?: unknown) => {
    setBusy(id);
    setError('');
    try {
      await api(`/documents/${id}/${path}`, { method: 'POST', body: JSON.stringify(body ?? {}) });
      setVoiding(null);
      setReason('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не получилось');
    } finally {
      setBusy('');
    }
  };
  const open = (ids: string[]) => window.open(`/print/documents?ids=${ids.join(',')}`, '_blank', 'noopener');

  return (
    <section className={styles.m}>
      <div className={styles.tools}>
        <label className={styles.search}><Search size={16} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Пациент, номер или документ" aria-label="Поиск документов" /></label>
        {waiting && shown.length > 0 && <button type="button" className={styles.dark} onClick={() => open(shown.slice(0, 30).map((row) => row.id))}><Printer size={16} aria-hidden="true" />Распечатать {Math.min(30, shown.length)}</button>}
      </div>
      {error && <p className={styles.error} role="alert"><AlertTriangle size={16} aria-hidden="true" />{error}</p>}
      {rows === null ? <p className={styles.none}>Загружаем…</p> : shown.length === 0 ? (
        <p className={styles.none}>{waiting ? 'Все документы подписаны.' : 'Документов пока нет. Они появятся, когда пациент придёт на визит.'}</p>
      ) : (
        <ul className={styles.list}>
          {shown.map((row) => (
            <li key={row.id} className={styles.row} data-status={row.status}>
              <span className={styles.k} aria-hidden="true" />
              <div className={styles.what}>
                <b>{row.title}</b>
                <span>№ {row.number} · {date(row.createdAt)} · <Link href={`/patients/${row.patient.id}`}>{row.patient.name}</Link>{row.visit ? <> · <Link href={`/visits/${row.visit.id}`}>визит {date(row.visit.startsAt)}</Link></> : null}</span>
                <span className={styles.state}>{STATE[row.status] ?? row.status}{row.blocking && row.status !== 'SIGNED' && row.status !== 'VOID' ? ' · без него приём не начнётся' : ''}{row.voidReason ? ` · ${row.voidReason}` : ''}</span>
              </div>
              <div className={styles.acts}>
                {row.status !== 'VOID' && <button type="button" className="sd-btn-ghost" onClick={() => open([row.id])}>Печать</button>}
                {row.status !== 'SIGNED' && row.status !== 'VOID' && <button type="button" className="sd-btn" disabled={busy === row.id} onClick={() => void act(row.id, 'signed')}><Check size={16} aria-hidden="true" />Подписан</button>}
                {row.status !== 'VOID' && voiding !== row.id && <button type="button" className={styles.link} onClick={() => { setVoiding(row.id); setReason(''); }}>Аннулировать</button>}
              </div>
              {voiding === row.id && (
                <div className={styles.void}>
                  <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Причина: ошибка в данных, пациент передумал…" aria-label="Причина аннулирования" />
                  <button type="button" className="sd-btn-ghost" onClick={() => setVoiding(null)}>Отмена</button>
                  <button type="button" className="sd-btn" disabled={busy === row.id || reason.trim().length < 5} onClick={() => void act(row.id, 'void', { reason })}>Аннулировать</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const FIELDS: { key: string; label: string; wide?: boolean; type?: string; hint?: string }[] = [
  { key: 'legalName', label: 'Полное наименование', wide: true, hint: 'Как в выписке ЕГРЮЛ, например ООО «Седракович Дент»' },
  { key: 'directorName', label: 'Руководитель (в лице кого)', hint: 'Генерального директора Иванова Ивана Ивановича' },
  { key: 'inn', label: 'ИНН' },
  { key: 'kpp', label: 'КПП' },
  { key: 'ogrn', label: 'ОГРН' },
  { key: 'address', label: 'Адрес', wide: true },
  { key: 'phone', label: 'Телефон' },
  { key: 'email', label: 'Почта' },
  { key: 'website', label: 'Сайт' },
  { key: 'licenseNumber', label: 'Номер лицензии' },
  { key: 'licenseDate', label: 'Дата лицензии', type: 'date' },
  { key: 'licenseIssuer', label: 'Кем выдана', wide: true, hint: 'Департамент здравоохранения города Москвы' },
  { key: 'licenseWorks', label: 'Перечень работ (услуг) по лицензии', wide: true, hint: 'Скопируйте из выписки из реестра лицензий' },
  { key: 'bankName', label: 'Банк' },
  { key: 'bankAccount', label: 'Расчётный счёт' },
  { key: 'bik', label: 'БИК' },
];

function ClinicForm() {
  const { user } = useAuth();
  const canEdit = !!user?.permissions.includes('org.manage');
  const [form, setForm] = useState<Requisites | null>(null);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { api<Requisites>('/documents/clinic').then(setForm).catch((err: Error) => setError(err.message)); }, []);
  if (!form) return <p className={styles.none}>{error || 'Загружаем…'}</p>;
  const value = (key: string) => { const raw = form[key]; const text = typeof raw === 'string' ? raw : ''; return key === 'licenseDate' ? text.slice(0, 10) : text; };
  const save = async () => {
    setError('');
    setSaved('');
    try {
      const body = Object.fromEntries(FIELDS.map((field) => [field.key, value(field.key)]));
      await api('/documents/clinic', { method: 'PUT', body: JSON.stringify(body) });
      setForm(await api<Requisites>('/documents/clinic'));
      setSaved('Сохранено. Новые документы будут выходить с этими данными; уже выданные не меняются.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не сохранилось');
    }
  };
  return (
    <section className={styles.m}>
      <div className={styles.pad}>
        {form.missing && form.missing.length > 0 && <p className={styles.warn}>Не заполнено: {form.missing.join(', ')}. Без этого документы печатаются с пустыми строками.</p>}
        <div className={styles.grid}>
          {FIELDS.map((field) => (
            <label key={field.key} className={field.wide ? styles.wide : undefined}>
              <span>{field.label}</span>
              {field.key === 'licenseWorks'
                ? <textarea rows={4} value={value(field.key)} disabled={!canEdit} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })} placeholder={field.hint} />
                : <input type={field.type ?? 'text'} value={value(field.key)} disabled={!canEdit} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })} placeholder={field.hint} />}
            </label>
          ))}
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {saved && <p className={styles.ok}>{saved}</p>}
        {canEdit ? <button type="button" className="sd-btn" onClick={() => void save()}>Сохранить реквизиты</button> : <p className={styles.none}>Менять реквизиты может владелец клиники.</p>}
      </div>
    </section>
  );
}

function TaxForm() {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<{ id: string; firstName: string; lastName: string; phone: string | null }[]>([]);
  const [patient, setPatient] = useState<{ id: string; name: string } | null>(null);
  const [year, setYear] = useState(String(new Date().getFullYear() - 1));
  const [self, setSelf] = useState(true);
  const [payerName, setPayerName] = useState('');
  const [payerInn, setPayerInn] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (query.trim().length < 2) { setHits([]); return; }
    const handle = setTimeout(() => { api<typeof hits>(`/workspace/search?q=${encodeURIComponent(query)}`).then(setHits).catch(() => setHits([])); }, 160);
    return () => clearTimeout(handle);
  }, [query]);
  const issue = async () => {
    if (!patient) return;
    setBusy(true);
    setError('');
    try {
      const doc = await api<{ id: string }>(`/documents/patient/${patient.id}/tax`, { method: 'POST', body: JSON.stringify({ year: Number(year), payerIsPatient: self, payerName, payerInn }) });
      window.open(`/print/documents?ids=${doc.id}`, '_blank', 'noopener');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Справка не выдана');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={styles.m}>
      <div className={styles.pad}>
        <p className={styles.lead}>Справка по форме ФНС для налогового вычета: сумма оплат пациента за год (наличными, картой и онлайн), без ДМС и бонусов.</p>
        <div className={styles.grid}>
          <label className={styles.wide}>
            <span>Пациент</span>
            {patient ? (
              <div className={styles.chosen}><b>{patient.name}</b><button type="button" className={styles.link} onClick={() => { setPatient(null); setQuery(''); }}>Другой</button></div>
            ) : (
              <>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Фамилия или телефон" />
                {hits.length > 0 && <div className={styles.hits}>{hits.map((hit) => <button key={hit.id} type="button" onClick={() => setPatient({ id: hit.id, name: `${hit.lastName} ${hit.firstName}` })}>{hit.lastName} {hit.firstName}<small>{hit.phone ?? ''}</small></button>)}</div>}
              </>
            )}
          </label>
          <label><span>Год</span><input inputMode="numeric" value={year} onChange={(event) => setYear(event.target.value.replace(/\D/g, '').slice(0, 4))} /></label>
          <label className={styles.check}><input type="checkbox" checked={self} onChange={(event) => setSelf(event.target.checked)} /><span>Платил сам пациент</span></label>
          {!self && <label><span>Кто платил (ФИО)</span><input value={payerName} onChange={(event) => setPayerName(event.target.value)} /></label>}
          <label><span>ИНН налогоплательщика</span><input inputMode="numeric" value={payerInn} onChange={(event) => setPayerInn(event.target.value.replace(/\D/g, '').slice(0, 12))} /></label>
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button type="button" className="sd-btn" disabled={!patient || busy || year.length !== 4} onClick={() => void issue()}><Printer size={16} aria-hidden="true" />{busy ? 'Готовим…' : 'Выдать справку'}</button>
      </div>
    </section>
  );
}

function Egisz() {
  return (
    <section className={styles.m}>
      <div className={`${styles.pad} ${styles.text}`}>
        <h2>ЕРИС</h2>
        <p><b>ЕРИС — Единый радиологический информационный сервис Москвы</b>, часть городской системы ЕМИАС. В нём регистрируются и хранятся рентгеновские и другие лучевые исследования медицинских организаций <b>московской городской системы здравоохранения</b> (приказ ДЗМ № 1160 от 31.12.2019). Подключение идёт через Департамент информационных технологий Москвы, по защищённой сети ДИТ и с квалифицированной электронной подписью.</p>
        <p>Частная клиника, которая работает только платно и не входит в городскую систему (не работает по ОМС и не получает госзаказ ДЗМ), к ЕРИС, как правило, <b>не подключается и не обязана</b>. Если клиника войдёт в систему ОМС Москвы, снимки нужно будет передавать в ЕРИС: тогда понадобятся соглашение с ДИТ, подключение рентген-аппаратов по DICOM к шлюзу ЕРИС и выписка о дозе в каждом исследовании. Точно подтвердить обязанность для вашей клиники лучше письменным запросом в ДЗМ.</p>
        <h2>ЕГИСЗ — это обязательно</h2>
        <p>Для всех клиник с медицинской лицензией обязательна <b>федеральная ЕГИСЗ</b> (постановление Правительства № 140 от 09.02.2022). Что нужно:</p>
        <ul>
          <li>Клиника внесена в ФРМО (реестр медицинских организаций), врачи — в ФРМР (реестр медработников) с должностью и СНИЛС.</li>
          <li>Усиленная квалифицированная электронная подпись (УКЭП) на клинику и на каждого врача.</li>
          <li>Передача медицинских документов в РЭМД в формате СЭМД (например, протокол консультации стоматолога) — через сертифицированную МИС или через шлюз оператора (N3.Здоровье и аналоги).</li>
        </ul>
        <p>Что уже готово в DentaSmart: протокол приёма с диагнозом по МКБ-10, данные врачей и пациентов, журнал документов. Что нужно от клиники для подключения: данные из ФРМО (OID организации), СНИЛС и УКЭП врачей, договор со шлюзом ЕГИСЗ. Когда они будут, подключим передачу протоколов в РЭМД.</p>
        <p className={styles.note}>Тексты документов составлены по постановлению № 659 от 30.05.2026 (с 01.09.2026), закону № 323-ФЗ, формам приказа № 1051н и закону № 152-ФЗ. Перед первым использованием покажите их юристу клиники.</p>
      </div>
    </section>
  );
}
