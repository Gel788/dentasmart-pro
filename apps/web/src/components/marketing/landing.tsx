'use client';

import { FormEvent, useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Golos_Text, Unbounded } from 'next/font/google';
import styles from './landing.module.css';

const golos = Golos_Text({ subsets: ['cyrillic', 'latin'], weight: ['400', '500', '600', '700'], display: 'swap' });
const unbounded = Unbounded({ subsets: ['cyrillic', 'latin'], weight: ['500', '600', '700'], display: 'swap' });

const LEADS_KEY = 'zaza.leads.v1';
const SPLASH_KEY = 'zaza.splash';

const PLANS = {
  econom: {
    label: 'Эконом',
    hint: 'база',
    lines: [
      { title: 'Лечение кариеса', tooth: 'зуб 16', price: '8 400 ₽' },
    ],
    note: 'Пример. Состав берётся из прайса клиники.',
  },
  optimum: {
    label: 'Оптимум',
    hint: 'рекомендуем',
    lines: [
      { title: 'Лечение кариеса', tooth: 'зуб 16', price: '8 400 ₽' },
      { title: 'Коронка керамическая', tooth: 'зуб 16', price: '28 000 ₽' },
    ],
    note: 'Пример. В расшифровке — работа врача и каждый расходник.',
  },
  premium: {
    label: 'Премиум',
    hint: 'максимум',
    lines: [
      { title: 'Лечение каналов', tooth: 'зуб 16', price: '14 000 ₽' },
      { title: 'Коронка керамическая', tooth: 'зуб 16', price: '32 000 ₽' },
    ],
    note: 'Пример. Три варианта собирает автоплан, врач правит до показа.',
  },
} as const;

type TierId = keyof typeof PLANS;
type Offer = 'doctor' | 'clinic' | 'network' | 'ai';

const OFFERS: { id: Offer; label: string }[] = [
  { id: 'doctor', label: 'Врач' },
  { id: 'clinic', label: 'Клиника' },
  { id: 'network', label: 'Сеть' },
  { id: 'ai', label: 'ИИ-опция' },
];

function money(year: number, monthly: boolean) {
  const value = monthly ? Math.round(year / 12) : year;
  const text = value.toLocaleString('ru-RU');
  return { text, unit: monthly ? '₽ / мес' : '₽ / год', note: monthly ? `при оплате ${year.toLocaleString('ru-RU')} ₽ за год` : 'оплата за год' };
}

function Arch({ eager }: { eager?: boolean }) {
  return (
    <img
      className={styles.archImg}
      src="/marketing/anterior.webp"
      alt=""
      width={1188}
      height={640}
      loading={eager ? 'eager' : 'lazy'}
    />
  );
}

function Enamel({ id }: { id: string }) {
  const fill = `url(#${id})`;
  const shine = `url(#${id}-s)`;
  return (
    <svg className={styles.enamelSvg} viewBox="0 0 86 40" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#efe4d0" />
          <stop offset="38%" stopColor="#fffdf8" />
          <stop offset="100%" stopColor="#f5f8f8" />
        </linearGradient>
        <linearGradient id={`${id}-s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g fill={fill} stroke="rgba(109, 86, 52, 0.22)" strokeWidth="0.45">
        <path d="M10 6.5c3.2-2.4 8.2-1.6 9.4 3.2 1.2 6.2.4 14-2.2 22.2-.7 2.2-3.4 3.1-4.8.6C9.2 24 6.2 16 6 11.2 5.8 8 7.2 6.8 10 6.5z" />
        <path d="M22 7.2c4.2-2.8 12.4-2.2 15.2 2.6 1.6 6.4.8 14.2-1.6 21.4-1.2 3.2-5.6 4.2-8.2 1.2-2.8-2.6-6.6-10.4-7.2-18.2-.4-4.6-.6-6.4 1.8-7z" />
        <path d="M48.2 7.4c2.4-2.8 10.8-3.2 14.6 1.8 2.2 6.6 1.2 15.2-1.8 22.2-1.4 3-5.8 3.6-8.2.8-2.6-2.8-6.2-11-6.6-18.6-.2-4.4-.2-6.2 2-6.2z" />
        <path d="M74.6 6.4c3.4-1.6 8.6.2 9.2 4.8.6 6.4-1.2 14.6-4.2 22.4-1 2.4-4.2 2.6-5.4.2-2.4-6.8-4.6-15.2-4-21.6.4-3.6 1.6-5.2 4.4-5.8z" />
      </g>
      <g fill={shine}>
        <ellipse cx="11" cy="14" rx="2.2" ry="5.5" />
        <ellipse cx="29" cy="15" rx="3.1" ry="6.2" />
        <ellipse cx="55" cy="15" rx="3.1" ry="6.2" />
        <ellipse cx="76" cy="14" rx="2.2" ry="5.4" />
      </g>
    </svg>
  );
}

function Splash({ onDone }: { onDone: () => void }) {
  return (
    <div
      className={styles.splash}
      role="dialog"
      aria-label="ZAZA"
      onAnimationEnd={(event) => { if (event.target === event.currentTarget) onDone(); }}
      onClick={onDone}
    >
      <div className={styles.splashInner}>
        <div className={`${styles.word} ${unbounded.className}`} aria-hidden>
          {['Z', 'A', 'Z', 'A'].map((letter, index) => (
            <div key={letter + index} className={styles.letter} style={{ ['--i' as string]: index }}>
              <i className={styles.cavity} />
              <div className={`${styles.half} ${styles.top}`}>
                <span className={styles.glyph}>{letter}</span>
                <span className={styles.teeth}><Enamel id={`zaza-e-${index}-t`} /></span>
              </div>
              <div className={`${styles.half} ${styles.bot}`}>
                <span className={styles.glyph}>{letter}</span>
                <span className={`${styles.teeth} ${styles.teethLower}`}><Enamel id={`zaza-e-${index}-b`} /></span>
              </div>
            </div>
          ))}
        </div>
        <button type="button" className={styles.skip} onClick={(event) => { event.stopPropagation(); onDone(); }}>Пропустить</button>
      </div>
    </div>
  );
}

export function Landing() {
  const [splash, setSplash] = useState(true);
  const [openNav, setOpenNav] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [monthly, setMonthly] = useState(false);
  const [tier, setTier] = useState<TierId>('optimum');
  const [offer, setOffer] = useState<Offer>('clinic');
  const [sent, setSent] = useState<{ name: string; phone: string; clinic: string; tariff: string } | null>(null);
  const [error, setError] = useState('');

  const finishSplash = useCallback(() => {
    try { sessionStorage.setItem(SPLASH_KEY, '1'); } catch { /* private mode */ }
    document.documentElement.dataset.zazaSplash = 'off';
    setSplash(false);
  }, []);

  useLayoutEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let seen = false;
    try { seen = sessionStorage.getItem(SPLASH_KEY) === '1'; } catch { seen = false; }
    if (reduce || seen || document.documentElement.dataset.zazaSplash === 'off') setSplash(false);
  }, []);

  useEffect(() => {
    if (!splash) return;
    const timer = window.setTimeout(() => finishSplash(), 2480);
    return () => window.clearTimeout(timer);
  }, [splash, finishSplash]);

  useEffect(() => {
    const root = document.getElementById('zaza');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!root || reduce) return;
    root.dataset.animate = 'on';
    const nodes = [...root.querySelectorAll(`.${styles.reveal}`)];
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) entry.target.classList.add(styles.on);
    }, { threshold: 0.18 });
    nodes.forEach((node) => io.observe(node));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const chooseOffer = (next: Offer) => {
    setOffer(next);
    document.getElementById('request')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const phone = String(form.get('phone') ?? '').trim();
    const clinic = String(form.get('clinic') ?? '').trim();
    const tariff = String(form.get('tariff') ?? offer);
    const digits = phone.replace(/\D/g, '');
    if (name.length < 2 || clinic.length < 2 || digits.length < 10) {
      setError('Напишите имя, телефон и название клиники.');
      return;
    }
    const row = { name, phone, clinic, tariff, at: new Date().toISOString() };
    let prev: unknown[] = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(LEADS_KEY) || '[]') as unknown;
      if (Array.isArray(parsed)) prev = parsed;
    } catch { prev = []; }
    try { localStorage.setItem(LEADS_KEY, JSON.stringify([row, ...prev].slice(0, 50))); } catch { /* private mode still shows success */ }
    setError('');
    setSent({ name, phone, clinic, tariff: OFFERS.find((item) => item.id === tariff)?.label ?? tariff });
  };

  const plan = PLANS[tier];
  const doctor = money(27000, monthly);
  const clinic = money(45000, monthly);

  return (
    <div id="zaza" className={`${styles.root} ${golos.className}`}>
      {splash && <Splash onDone={finishSplash} />}
      <header className={`${styles.header} ${scrolled ? styles.scrolled : ''}`}>
        <a className={`${styles.brand} ${unbounded.className}`} href="#top">ZAZA <small>для клиник</small></a>
        <nav className={`${styles.nav} ${openNav ? styles.open : ''}`} aria-label="Разделы">
          <a href="#product" onClick={() => setOpenNav(false)}>Продукт</a>
          <a href="#move" onClick={() => setOpenNav(false)}>Переезд</a>
          <a href="#pricing" onClick={() => setOpenNav(false)}>Тарифы</a>
          <a href="#author" onClick={() => setOpenNav(false)}>Автор</a>
          <a href="#faq" onClick={() => setOpenNav(false)}>Вопросы</a>
          <a className={styles.navCta} href="#request" onClick={() => setOpenNav(false)}>Запросить доступ</a>
        </nav>
        <div className={styles.headerActions}>
          <button type="button" className={styles.menuBtn} aria-expanded={openNav} onClick={() => setOpenNav((value) => !value)}>Меню</button>
          <a className={`${styles.btn} ${styles.btnGhost}`} href="/login?role=owner">Демо</a>
          <a className={`${styles.btn} ${styles.btnPrimary} ${styles.headerCta}`} href="#request">Запросить доступ</a>
        </div>
      </header>

      <main id="top">
        <section className={styles.hero}>
          <div>
            <p className={styles.kicker}>CRM для стоматологий</p>
            <h1 className={`${styles.display} ${unbounded.className}`}>План, который пациент подписывает</h1>
            <p className={styles.lead}>ZAZA ведёт лечение от карты зубов до оплаты. Три варианта плана, расшифровка цены и маршрут после подписи. Клиника настраивает сама, без программиста.</p>
            <div className={styles.heroActions}>
              <a className={`${styles.btn} ${styles.btnPrimary}`} href="#request">Запросить доступ</a>
              <a className={`${styles.btn} ${styles.btnGhost}`} href="/login?role=owner">Попробовать демо</a>
            </div>
            <p className={styles.heroNote}>Демо открывается сразу: владелец, врач или администратор.</p>
          </div>
          <article className={styles.screen} aria-label="Пример плана лечения">
            <div className={styles.chrome}><span className={styles.dots} aria-hidden><i /><i /><i /></span><span>План лечения</span><span>пример</span></div>
            <Arch eager />
            <div className={styles.tiers} role="tablist" aria-label="Варианты плана">
              {(Object.keys(PLANS) as TierId[]).map((id) => (
                <button key={id} type="button" role="tab" aria-selected={tier === id} className={`${styles.tier} ${tier === id ? styles.on : ''}`} onClick={() => setTier(id)}>
                  {id === 'optimum' && <em>рекомендуем</em>}
                  <b>{PLANS[id].label}</b>
                  <span>{PLANS[id].hint}</span>
                </button>
              ))}
            </div>
            <ul className={styles.lines}>
              {plan.lines.map((line) => (
                <li key={line.title}><span>{line.title}<small>{line.tooth}</small></span><b className={styles.money}>{line.price}</b></li>
              ))}
            </ul>
            <div className={styles.screenFoot}>{plan.note}</div>
          </article>
        </section>

        <p className={styles.strip}>
          <span><b>Формула</b> со статусами</span>
          <span><b>Автоплан</b> в трёх вариантах</span>
          <span><b>Маршрут</b> после подписи</span>
          <span><b>Переезд</b> из SQNS, IDENT, АдминДенты</span>
        </p>

        <section className={styles.section} id="product">
          <h2 className={`${styles.display} ${unbounded.className}`}>Что уже работает в клинике</h2>
          <p className={styles.sub}>Ниже только то, что есть в продукте. Демо — это та же система, не ролик.</p>

          <article className={`${styles.grid} ${styles.reveal}`}>
            <div>
              <div className={styles.tag}>Автоплан</div>
              <h3 className={`${styles.display} ${unbounded.className}`}>Три варианта за минуту</h3>
              <p>Врач отмечает находки на формуле или надиктовывает их. ZAZA собирает семью планов: эконом, оптимум и премиум. Оптимум помечен как рекомендуемый. Владелец может выключить автоплан в настройках.</p>
            </div>
            <div className={styles.tierStack} aria-hidden>
              <div><b>Эконом</b><span>необходимый объём</span></div>
              <div className={styles.pick}><b>Оптимум</b><span>рекомендуем</span></div>
              <div><b>Премиум</b><span>максимум</span></div>
            </div>
          </article>

          <article className={`${styles.grid} ${styles.reverse} ${styles.reveal}`}>
            <div>
              <div className={styles.tag}>Формула</div>
              <h3 className={`${styles.display} ${unbounded.className}`}>Зубы, которые узнаёт врач</h3>
              <p>Постоянные зубы нарисованы с анатомических моделей: вид сбоку и жевательная поверхность, отдельные корни, статусы на самом зубе. Кариес, пломба, коронка, имплант, каналы, удаление и мост садятся на силуэт. Рядом — объёмная презентация плана, её можно крутить перед пациентом.</p>
            </div>
            <div className={styles.screen}>
              <div className={styles.chrome}><span>Формула</span><span>вид сбоку</span></div>
              <Arch />
              <div className={styles.screenFoot}>Клик по зубу открывает находки и услугу. Поверхности M, D, O, B, L. В печати формула едет вместе с планом.</div>
            </div>
          </article>

          <article className={`${styles.grid} ${styles.reveal}`}>
            <div>
              <div className={styles.tag}>После подписи</div>
              <h3 className={`${styles.display} ${unbounded.className}`}>Маршрут, а не файл в ящике</h3>
              <p>Подписанный план становится маршрутом. У каждого этапа четыре оси: визит, материалы, лаборатория и оплата. Система показывает, что блокирует следующий шаг. Материалы уходят в резерв, лаборатория получает заказ, визит встаёт в расписание.</p>
            </div>
            <div className={styles.route} aria-hidden>
              <div className={styles.stage}><i className={`${styles.dot} ${styles.done}`} /><span><b>Санация</b><span>визит проведён</span></span><span>оплачено</span></div>
              <div className={styles.stage}><i className={`${styles.dot} ${styles.wait}`} /><span><b>Ортопедия</b><span>ждёт лабораторию</span></span><span>в работе</span></div>
              <div className={styles.stage}><i className={styles.dot} /><span><b>Контроль</b><span>визит ещё не назначен</span></span><span>дальше</span></div>
            </div>
          </article>

          <article className={`${styles.grid} ${styles.reverse} ${styles.reveal}`}>
            <div>
              <div className={styles.tag}>Цена</div>
              <h3 className={`${styles.display} ${unbounded.className}`}>Пациент видит, из чего сумма</h3>
              <p>В плане на экране, в презентации и в PDF под услугой — работа врача и каждый расходник: имя, количество, цена и сумма. Строки сходятся с ценой услуги. Себестоимость и маржа остаются у владельца и не попадают в документ для пациента. Показ расшифровки включается на плане.</p>
            </div>
            <table className={styles.table}>
              <thead><tr><th>Коронка керамическая</th><th>Кол.</th><th>Сумма</th></tr></thead>
              <tbody>
                <tr><td>Работа врача</td><td>1</td><td className={styles.money}>18 400 ₽</td></tr>
                <tr><td>Цирконий</td><td>1</td><td className={styles.money}>7 200 ₽</td></tr>
                <tr><td>Цемент</td><td>1</td><td className={styles.money}>2 400 ₽</td></tr>
                <tr><td><b>Итого</b></td><td></td><td className={styles.money}><b>28 000 ₽</b></td></tr>
              </tbody>
            </table>
          </article>

          <article className={`${styles.grid} ${styles.reveal}`}>
            <div>
              <div className={styles.tag}>Расписание и деньги</div>
              <h3 className={`${styles.display} ${unbounded.className}`}>День клиники на одном экране</h3>
              <p>Расписание: карточки визитов по врачам, неделя, свободные окна и загрузка колонки. Касса, счета и смены. Радар показывает незакрытые планы и долги. Склад знает остатки, партии и сроки. Лаборатория и стерилизация живут рядом, в снабжении.</p>
            </div>
            <div className={styles.screen} aria-hidden>
              <div className={styles.screenHead}><span>Вторник</span><span>свободное окно 14:30</span></div>
              <ul className={styles.lines}>
                <li><span>09:00 · терапия<small>осмотр и план</small></span><b>кресло 1</b></li>
                <li><span>11:30 · ортопедия<small>примерка</small></span><b>кресло 2</b></li>
                <li><span>16:00 · гигиена<small>окно свободно</small></span><b>—</b></li>
              </ul>
            </div>
          </article>

          <article className={`${styles.grid} ${styles.reverse} ${styles.reveal}`}>
            <div>
              <div className={styles.tag}>Голос</div>
              <h3 className={`${styles.display} ${unbounded.className}`}>«Привет, ЗаЗа»</h3>
              <p>Голосом можно спросить цифры, должников, карточку пациента, оплаты, задачи и склад. Изменение не применяется молча: его видно на экране и его нужно подтвердить. Без ключа говорит голос устройства. Если на сервере есть ключ SpeechKit, отвечает Яндекс.</p>
            </div>
            <div className={styles.screen}>
              <div className={styles.screenHead}><span>ЗаЗа</span><span>слушает</span></div>
              <p style={{ margin: '8px 0 0' }}>«Кто должен за октябрь?»</p>
              <p className={styles.heroNote}>Ответ приходит списком, не абзацем в чат. Команду на запись врач подтверждает.</p>
            </div>
          </article>
        </section>

        <section className={styles.band} id="move">
          <h2 className={`${styles.display} ${unbounded.className}`}>Как переехать за 1 день</h2>
          <p className={styles.sub}>Пациенты и расписание из SQNS, IDENT или АдминДенты. Колонки можно поправить до записи. Файл с живыми фамилиями в демо не нужен: есть учебный пример SQNS.</p>
          <div className={styles.steps}>
            <article className={styles.step}><i>01</i><b>Выгрузка</b><p>Заберите файл пациентов и расписания из текущей программы.</p></article>
            <article className={styles.step}><i>02</i><b>Загрузка</b><p>Откройте «Переезд» и положите файл. ZAZA узнаёт SQNS, IDENT и АдминДенту.</p></article>
            <article className={styles.step}><i>03</i><b>Проверка</b><p>Поправьте колонки, посмотрите отчёт и подтвердите запись.</p></article>
            <article className={styles.step}><i>04</i><b>Приём</b><p>Карточки на месте. Расписание можно смотреть в тот же день.</p></article>
          </div>
        </section>

        <section className={styles.section}>
          <article className={`${styles.grid} ${styles.reveal}`}>
            <div>
              <div className={styles.tag}>Без программиста</div>
              <h3 className={`${styles.display} ${unbounded.className}`}>Клинику собирает владелец</h3>
              <p>В настройках: название и часы, сотрудники, кресла, прайс, склад, шаблоны приёма, акции и напоминания, двухфакторный вход, обмен данными и история изменений. Права роли правятся сразу: кто видит себестоимость, кто меняет закрытый визит, прайс и потолок скидки.</p>
            </div>
            <div className={styles.screen}>
              <div className={styles.screenHead}><span>Роли</span><span>сохраняется сразу</span></div>
              <ul className={styles.lines}>
                <li><span>Владелец<small>деньги, настройки, себестоимость</small></span><b>все права</b></li>
                <li><span>Врач<small>свой день, формула, планы</small></span><b>приём</b></li>
                <li><span>Администратор<small>стойка, кресла, запись</small></span><b>ресепшен</b></li>
              </ul>
            </div>
          </article>
        </section>

        <section className={styles.author} id="author">
          <div className={`${styles.monogram} ${unbounded.className}`} aria-hidden>ЗА</div>
          <div>
            <div className={styles.tag}>Автор</div>
            <h2 className={`${styles.display} ${unbounded.className}`}>Завен Агаян</h2>
            <p>Практикующий стоматолог и владелец клиник. ZAZA — его авторский проект: систему он собрал для своих клиник и открывает её как сервис для других практик.</p>
          </div>
        </section>

        <section className={styles.pricing} id="pricing">
          <div className={styles.pricingHead}>
            <div>
              <h2 className={`${styles.display} ${unbounded.className}`}>Тарифы</h2>
              <p className={styles.sub}>Годовая оплата. Месяц на переключателе — это годовая цена, разделённая на 12.</p>
            </div>
            <div className={styles.toggle} role="group" aria-label="Период цены">
              <button type="button" className={!monthly ? styles.on : ''} onClick={() => setMonthly(false)}>Год</button>
              <button type="button" className={monthly ? styles.on : ''} onClick={() => setMonthly(true)}>Месяц</button>
            </div>
          </div>
          <div className={styles.cards}>
            <article className={styles.card}>
              <h3 className={unbounded.className}>Врач</h3>
              <p className={styles.price}>{doctor.text} <small>{doctor.unit}</small></p>
              <p className={styles.note}>{doctor.note} · за одного врача</p>
              <ul>
                <li>Формула, приём и планы</li>
                <li>Расписание одного врача</li>
                <li>Презентация плана пациенту</li>
              </ul>
              <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => chooseOffer('doctor')}>Оставить заявку</button>
            </article>
            <article className={`${styles.card} ${styles.featured}`}>
              <h3 className={unbounded.className}>Клиника</h3>
              <p className={styles.price}>{clinic.text} <small>{clinic.unit}</small></p>
              <p className={styles.note}>{clinic.note} · за клинику</p>
              <ul>
                <li>Стойка, роли и несколько кресел</li>
                <li>Касса, долги, склад, лаборатория</li>
                <li>Переезд базы и маршруты лечения</li>
              </ul>
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => chooseOffer('clinic')}>Оставить заявку</button>
            </article>
            <article className={styles.card}>
              <h3 className={unbounded.className}>Сеть</h3>
              <p className={styles.price}>индивидуально</p>
              <p className={styles.note}>несколько филиалов</p>
              <ul>
                <li>Всё, что в клинике</li>
                <li>Филиалы и кресла по назначениям</li>
                <li>Условия под вашу сеть</li>
              </ul>
              <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => chooseOffer('network')}>Обсудить сеть</button>
            </article>
          </div>
          <div className={styles.addon}>
            <div>
              <b>ИИ-опция</b>
              <p>Автоплан лечения и голосовые сценарии. Цена по запросу, подключается отдельно от тарифа.</p>
            </div>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => chooseOffer('ai')}>Узнать цену</button>
          </div>
          <div className={styles.compareWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Состав</th><th>Врач</th><th>Клиника</th><th>Сеть</th></tr>
              </thead>
              <tbody>
                <tr><td>Цена</td><td>27 000 ₽ / год за врача</td><td>45 000 ₽ / год за клинику</td><td>индивидуально</td></tr>
                <tr><td>Формула, планы, приём</td><td>да</td><td>да</td><td>да</td></tr>
                <tr><td>Расписание</td><td>один врач</td><td>клиника</td><td>филиалы</td></tr>
                <tr><td>Деньги, склад, роли</td><td>—</td><td>да</td><td>да</td></tr>
                <tr><td>Переезд SQNS, IDENT, АдминДента</td><td>да</td><td>да</td><td>да</td></tr>
                <tr><td>Маршрут после подписи</td><td>да</td><td>да</td><td>да</td></tr>
                <tr><td>Расшифровка цены в PDF</td><td>да</td><td>да</td><td>да</td></tr>
                <tr><td>ИИ-автоплан и ЗаЗа</td><td>опция</td><td>опция</td><td>опция</td></tr>
              </tbody>
            </table>
          </div>
          <p className={styles.note}>Так мы упаковываем продажу. Демо открывает клинику целиком, чтобы можно было потрогать все экраны.</p>
        </section>

        <section className={styles.faq} id="faq">
          <h2 className={`${styles.display} ${unbounded.className}`}>Вопросы</h2>
          <details>
            <summary>Это программа на компьютер или сервис?</summary>
            <p>Сервис в браузере. Демо работает без своего сервера: можно войти как владелец, врач или администратор и пройти приём.</p>
          </details>
          <details>
            <summary>Откуда переносятся пациенты?</summary>
            <p>Из SQNS, IDENT и АдминДенты: пациенты и расписание. Перед записью видны колонки и отчёт. Живой файл с фамилиями в маркетинговое демо загружать не нужно.</p>
          </details>
          <details>
            <summary>Что делает автоплан?</summary>
            <p>По находкам на формуле собирает три варианта лечения. Врач выбирает и правит. Владелец может выключить автоплан. Опция оплачивается отдельно, цена по запросу.</p>
          </details>
          <details>
            <summary>Пациент видит себестоимость?</summary>
            <p>Нет. Пациенту показывается цена услуги и расшифровка: работа врача и расходники. Себестоимость и маржа видны тем ролям, которым это разрешил владелец.</p>
          </details>
          <details>
            <summary>Куда ведёт «Попробовать демо»?</summary>
            <p>На вход в рабочую систему. Отдельные ссылки: <a href="/login?role=owner">владелец</a>, <a href="/login?role=doctor">врач</a>, <a href="/login?role=admin">администратор</a>.</p>
          </details>
        </section>

        <section className={styles.cta} id="request">
          <div>
            <h2 className={`${styles.display} ${unbounded.className}`}>Откроем ZAZA для вашей клиники</h2>
            <p className={styles.lead}>Оставьте имя, телефон и название. Заявка сохранится здесь, в демо, и мы покажем, что она принята.</p>
            <p className={styles.heroNote}>Или сразу <a href="/login?role=doctor">войдите как врач</a> и посмотрите формулу.</p>
          </div>
          {sent ? (
            <div className={styles.success} role="status">
              <b>Заявка принята</b>
              <p>{sent.name}, клиника «{sent.clinic}». Свяжемся по {sent.phone}. Тариф: {sent.tariff}.</p>
              <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setSent(null)}>Отправить ещё одну</button>
            </div>
          ) : (
            <form className={styles.form} onSubmit={onSubmit}>
              <label>Имя<input name="name" autoComplete="name" required placeholder="Анна Ковалёва" /></label>
              <label>Телефон<input name="phone" autoComplete="tel" inputMode="tel" required placeholder="+7 900 000-00-00" /></label>
              <label>Клиника<input name="clinic" required placeholder="Название клиники" /></label>
              <label>Тариф
                <select name="tariff" value={offer} onChange={(event) => setOffer(event.target.value as Offer)}>
                  {OFFERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              {error && <p className={styles.error}>{error}</p>}
              <button className={`${styles.btn} ${styles.btnPrimary} ${styles.btnWide}`} type="submit">Отправить заявку</button>
            </form>
          )}
        </section>
      </main>
      <footer className={styles.footer}>
        <span>ZAZA · авторский проект Завена Агаяна</span>
        <span><a href="/login?role=owner">Демо владельца</a> · <a href="/login?role=admin">Демо администратора</a> · <a href="#request">Заявка</a></span>
      </footer>
    </div>
  );
}
