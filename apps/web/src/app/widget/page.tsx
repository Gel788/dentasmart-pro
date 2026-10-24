'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Copy, ExternalLink } from 'lucide-react';
import { Protected } from '@/components/protected';
import { useAuth } from '@/lib/auth-context';

/** Where the clinic gets the booking widget: a link to send patients and the code for its own site. */
export default function WidgetPage() {
  return <Protected><WidgetSetup /></Protected>;
}

function WidgetSetup() {
  const { user } = useAuth();
  const slug = user?.organization.slug ?? '';
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
  const [origin, setOrigin] = useState('');
  const [assistant, setAssistant] = useState<boolean | null>(null);
  const [model, setModel] = useState('');
  const [copied, setCopied] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    if (!slug) return;
    fetch(`${apiBase}/public/widget/${slug}/assistant`).then((r) => r.json()).then((data) => { setAssistant(!!data.enabled); setModel(data.model ?? ''); }).catch(() => setAssistant(false));
  }, [apiBase, slug]);

  const link = origin && slug ? `${origin}/book/${slug}` : '';
  const embed = origin && slug ? `<script src="${origin}/widget/dentasmart-widget.js" data-clinic="${slug}" data-api="${apiBase}"></script>` : '';
  const copy = (text: string, what: string) => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(what); window.setTimeout(() => setCopied(''), 2000); }).catch(() => setCopied(''));
  };

  return (
    <div className="sd-stack" style={{ maxWidth: 860 }}>
      <div className="sd-h">
        <div>
          <h1>Виджет записи</h1>
          <p>Пациент описывает, что беспокоит, или сам выбирает время. Клиника получает заявку и подтверждает её в разделе «Запись с сайта».</p>
        </div>
        <Link className="sd-btn-ghost" href="/requests">Заявки с сайта</Link>
      </div>

      <section className="sd-card" style={{ padding: 16, display: 'grid', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>ИИ-помощник</h2>
        {assistant === null ? <p className="sd-muted">Проверяем…</p> : assistant ? (
          <p>Включён, модель <code>{model}</code>. Перед чатом пациент даёт согласие на обработку сообщений за рубежом; телефоны и почты в сообщениях скрываются, имя и телефон спрашивает только форма.</p>
        ) : (
          <p>Выключен: на сервере не задан ключ <code>POLZA_API_KEY</code> (Polza AI). Виджет работает без чата — пациент сам выбирает услугу и время.</p>
        )}
      </section>

      <section className="sd-card" style={{ padding: 16, display: 'grid', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Ссылка для пациентов</h2>
        <p className="sd-muted">Для соцсетей, мессенджеров и визиток.</p>
        <div className="sd-inline">
          <input className="sd-input" readOnly value={link} aria-label="Ссылка на запись" onFocus={(event) => event.target.select()} />
          <button className="sd-btn-ghost" type="button" onClick={() => copy(link, 'link')}><Copy size={16} />{copied === 'link' ? 'Скопировано' : 'Копировать'}</button>
          {link && <a className="sd-btn-ghost" href={link} target="_blank" rel="noreferrer"><ExternalLink size={16} />Открыть</a>}
        </div>
      </section>

      <section className="sd-card" style={{ padding: 16, display: 'grid', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Код для сайта клиники</h2>
        <p className="sd-muted">Вставьте на страницу, где должна быть запись. Виджет появится сразу под кодом.</p>
        <textarea className="sd-input" readOnly rows={3} value={embed} aria-label="Код виджета" style={{ height: 'auto', padding: 12, fontFamily: 'var(--font-body)' }} onFocus={(event) => event.target.select()} />
        <div><button className="sd-btn-ghost" type="button" onClick={() => copy(embed, 'embed')}><Copy size={16} />{copied === 'embed' ? 'Скопировано' : 'Копировать код'}</button></div>
        <p className="sd-muted">Сейчас сервер работает по http. Для сайта на https нужен домен с сертификатом у CRM, иначе браузер заблокирует запросы виджета.</p>
      </section>
    </div>
  );
}
