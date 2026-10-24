'use client';

import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Golos_Text, Unbounded } from 'next/font/google';
import styles from './landing.module.css';

const golos = Golos_Text({ subsets: ['cyrillic', 'latin'], weight: ['400', '500', '600', '700'], display: 'swap' });
const unbounded = Unbounded({ subsets: ['cyrillic', 'latin'], weight: ['500', '600'], display: 'swap' });

const LEADS_KEY = 'zaza.leads.v1';
const SPLASH_KEY = 'zaza.splash';

type Offer = 'doctor' | 'clinic' | 'network' | 'ai';
type ToothId = '16' | '11' | '26';
type TierId = 'econom' | 'optimum' | 'premium';
type ChapterId = 'formula' | 'plans' | 'sign' | 'route' | 'money';

const OFFERS: { id: Offer; label: string }[] = [
  { id: 'doctor', label: 'Врач' },
  { id: 'clinic', label: 'Клиника' },
  { id: 'network', label: 'Сеть' },
  { id: 'ai', label: 'ИИ-опция' },
];

const TEETH: Record<ToothId, { name: string; src: string; w: number; h: number; finding: string }> = {
  '16': { name: 'верхний первый моляр', src: '/marketing/tooth-16.webp', w: 346, h: 754, finding: 'Кариес · жевательная' },
  '11': { name: 'верхний центральный резец', src: '/marketing/tooth-11.webp', w: 250, h: 756, finding: 'Реставрация · медиальная' },
  '26': { name: 'верхний первый моляр', src: '/marketing/tooth-26.webp', w: 346, h: 756, finding: 'Каналы' },
};

type Variant = {
  lines: { title: string; price: number }[];
  partOf: string;
  parts: { name: string; qty: string; sum: number }[];
};

const PLANS: Record<ToothId, Record<TierId, Variant>> = {
  '16': {
    econom: { lines: [{ title: 'Лечение кариеса', price: 8400 }], partOf: 'Лечение кариеса', parts: [{ name: 'Работа врача', qty: '1', sum: 6900 }, { name: 'Композит', qty: '1', sum: 1500 }] },
    optimum: { lines: [{ title: 'Лечение кариеса', price: 8400 }, { title: 'Коронка керамическая', price: 28000 }], partOf: 'Коронка керамическая', parts: [{ name: 'Работа врача', qty: '1', sum: 18400 }, { name: 'Цирконий', qty: '1', sum: 7200 }, { name: 'Цемент', qty: '1', sum: 2400 }] },
    premium: { lines: [{ title: 'Лечение каналов', price: 14000 }, { title: 'Коронка керамическая', price: 32000 }], partOf: 'Коронка керамическая', parts: [{ name: 'Работа врача', qty: '1', sum: 21000 }, { name: 'Цирконий', qty: '1', sum: 8600 }, { name: 'Штифт', qty: '1', sum: 2400 }] },
  },
  '11': {
    econom: { lines: [{ title: 'Реставрация', price: 7400 }], partOf: 'Реставрация', parts: [{ name: 'Работа врача', qty: '1', sum: 6100 }, { name: 'Композит', qty: '1', sum: 1300 }] },
    optimum: { lines: [{ title: 'Реставрация', price: 9200 }], partOf: 'Реставрация', parts: [{ name: 'Работа врача', qty: '1', sum: 7400 }, { name: 'Композит', qty: '1', sum: 1800 }] },
    premium: { lines: [{ title: 'Винир керамический', price: 24000 }], partOf: 'Винир керамический', parts: [{ name: 'Работа врача', qty: '1', sum: 15000 }, { name: 'Керамика', qty: '1', sum: 9000 }] },
  },
  '26': {
    econom: { lines: [{ title: 'Лечение кариеса', price: 8400 }], partOf: 'Лечение кариеса', parts: [{ name: 'Работа врача', qty: '1', sum: 6900 }, { name: 'Композит', qty: '1', sum: 1500 }] },
    optimum: { lines: [{ title: 'Лечение каналов', price: 14000 }], partOf: 'Лечение каналов', parts: [{ name: 'Работа врача', qty: '1', sum: 11200 }, { name: 'Инструменты', qty: '1', sum: 2800 }] },
    premium: { lines: [{ title: 'Лечение каналов', price: 14000 }, { title: 'Коронка керамическая', price: 32000 }], partOf: 'Коронка керамическая', parts: [{ name: 'Работа врача', qty: '1', sum: 21000 }, { name: 'Цирконий', qty: '1', sum: 8600 }, { name: 'Штифт', qty: '1', sum: 2400 }] },
  },
};

const CHAPTERS: { id: ChapterId; index: string; title: string; body: string }[] = [
  { id: 'formula', index: '01', title: 'Сначала зуб, не бланк', body: 'Постоянные зубы сняты с анатомических моделей: вид сбоку и жевательная поверхность. Кариес, пломба, коронка, имплант, каналы, удаление и мост садятся на силуэт. Клик открывает находки и услугу. В печати формула едет вместе с планом.' },
  { id: 'plans', index: '02', title: 'Три варианта, пока пациент в кресле', body: 'Врач отмечает находки или надиктовывает их. ZAZA собирает эконом, оптимум и премиум. Оптимум помечен как рекомендуемый. Врач правит состав до показа. Владелец может выключить автоплан в настройках.' },
  { id: 'sign', index: '03', title: 'Цена, которую можно показать', body: 'Пациент видит услуги и сумму. Расшифровку включают на плане: работа врача и каждый расходник, строки сходятся с ценой. Себестоимость и маржа остаются у роли, которой это разрешил владелец.' },
  { id: 'route', index: '04', title: 'Подпись запускает маршрут', body: 'Дальше не файл в ящике. У этапа четыре оси: визит, материалы, лаборатория и оплата. Материалы уходят в резерв, лаборатория получает заказ, визит встаёт в расписание. Видно, что держит следующий шаг.' },
  { id: 'money', index: '05', title: 'Сумма сходится', body: 'Та же расшифровка есть на экране плана, в презентации пациенту и в PDF. Ниже пример по выбранному зубу: цифры учебные, в клинике их берёт прайс.' },
];

const TIER_LABEL: Record<TierId, string> = { econom: 'Эконом', optimum: 'Оптимум', premium: 'Премиум' };

function rub(value: number) {
  return `${value.toLocaleString('ru-RU')} ₽`;
}

function sum(lines: { price: number }[]) {
  return lines.reduce((total, line) => total + line.price, 0);
}

function useCount(target: number, animate: boolean, fromZero = false) {
  const [value, setValue] = useState(fromZero ? 0 : target);
  const from = useRef(fromZero ? 0 : target);
  useEffect(() => {
    if (!animate) {
      from.current = target;
      setValue(target);
      return;
    }
    const startVal = from.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 460);
      const eased = 1 - (1 - p) ** 3;
      setValue(Math.round(startVal + (target - startVal) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, animate]);
  return value;
}

function Enamel({ id }: { id: string }) {
  return (
    <svg className={styles.enamelSvg} viewBox="0 0 86 40" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#efe4d0" />
          <stop offset="38%" stopColor="#fffdf8" />
          <stop offset="100%" stopColor="#f4f7f6" />
        </linearGradient>
      </defs>
      <g fill={`url(#${id})`} stroke="rgba(90,70,40,0.28)" strokeWidth="0.45">
        <path d="M10 6.5c3.2-2.4 8.2-1.6 9.4 3.2 1.2 6.2.4 14-2.2 22.2-.7 2.2-3.4 3.1-4.8.6C9.2 24 6.2 16 6 11.2 5.8 8 7.2 6.8 10 6.5z" />
        <path d="M22 7.2c4.2-2.8 12.4-2.2 15.2 2.6 1.6 6.4.8 14.2-1.6 21.4-1.2 3.2-5.6 4.2-8.2 1.2-2.8-2.6-6.6-10.4-7.2-18.2-.4-4.6-.6-6.4 1.8-7z" />
        <path d="M48.2 7.4c2.4-2.8 10.8-3.2 14.6 1.8 2.2 6.6 1.2 15.2-1.8 22.2-1.4 3-5.8 3.6-8.2.8-2.6-2.8-6.2-11-6.6-18.6-.2-4.4-.2-6.2 2-6.2z" />
        <path d="M74.6 6.4c3.4-1.6 8.6.2 9.2 4.8.6 6.4-1.2 14.6-4.2 22.4-1 2.4-4.2 2.6-5.4.2-2.4-6.8-4.6-15.2-4-21.6.4-3.6 1.6-5.2 4.4-5.8z" />
      </g>
    </svg>
  );
}

function Splash({ onDone }: { onDone: () => void }) {
  return (
    <div className={styles.splash} role="dialog" aria-label="ZAZA" onClick={onDone} onAnimationEnd={(event) => { if (event.target === event.currentTarget) onDone(); }}>
      <div className={styles.splashInner}>
        <div className={`${styles.word} ${unbounded.className}`} aria-hidden>
          {['Z', 'A', 'Z', 'A'].map((letter, index) => (
            <div key={letter + index} className={styles.letter} style={{ ['--i' as string]: index }}>
              <i className={styles.cavity} />
              <div className={`${styles.half} ${styles.top}`}>
                <span className={styles.glyph}>{letter}</span>
                <span className={styles.teeth}><Enamel id={`zaza-${index}-t`} /></span>
              </div>
              <div className={`${styles.half} ${styles.bot}`}>
                <span className={styles.glyph}>{letter}</span>
                <span className={`${styles.teeth} ${styles.teethLower}`}><Enamel id={`zaza-${index}-b`} /></span>
              </div>
            </div>
          ))}
        </div>
        <button type="button" className={styles.skip} onClick={(event) => { event.stopPropagation(); onDone(); }}>Пропустить</button>
      </div>
    </div>
  );
}

function PlanSheet({ tooth, tier, onTier, embedded = false, live = false, reduce = false }: { tooth: ToothId; tier: TierId; onTier: (tier: TierId) => void; embedded?: boolean; live?: boolean; reduce?: boolean }) {
  const plan = PLANS[tooth][tier];
  const total = useCount(sum(plan.lines), live && !reduce, live);
  return (
    <div className={embedded ? styles.sheetEmbed : styles.sheet}>
      {!embedded && <div className={styles.sheetHead}><span>План · зуб {tooth}</span><span>пример</span></div>}
      <div className={styles.tiers} role="tablist" aria-label="Варианты плана">
        {(Object.keys(TIER_LABEL) as TierId[]).map((id) => (
          <button key={id} type="button" role="tab" aria-selected={tier === id} className={`${styles.tier} ${tier === id ? styles.on : ''}`} onClick={() => onTier(id)}>
            {id === 'optimum' && <em>рекомендуем</em>}
            <b>{TIER_LABEL[id]}</b>
            <span>{rub(sum(PLANS[tooth][id].lines))}</span>
          </button>
        ))}
      </div>
      <ul className={styles.lines}>
        {plan.lines.map((line, index) => (
          <li key={line.title} className={styles.lineIn} style={{ animationDelay: `${index * 90}ms` }}>
            <span>{line.title}<small>зуб {tooth}</small></span>
            <b className={styles.money}>{rub(line.price)}</b>
          </li>
        ))}
      </ul>
      <div className={styles.sheetTotal}>
        <span>К подписи</span>
        <b className={unbounded.className}>{rub(live ? total : sum(plan.lines))}</b>
      </div>
      <p className={styles.sheetFoot}>Суммы учебные. В клинике их берёт прайс. Оптимум в продукте помечен как рекомендуемый.</p>
    </div>
  );
}

function Stage({ chapter, tooth, tier, onTooth, onTier }: { chapter: ChapterId; tooth: ToothId; tier: TierId; onTooth: (id: ToothId) => void; onTier: (id: TierId) => void }) {
  const plan = PLANS[tooth][tier];
  const toothMeta = TEETH[tooth];
  return (
    <div className={styles.stage} aria-live="polite">
      <div className={styles.stageHead}>
        <span>{CHAPTERS.find((item) => item.id === chapter)?.index} · {chapter === 'formula' ? 'Формула' : chapter === 'plans' ? 'Автоплан' : chapter === 'sign' ? 'Подпись' : chapter === 'route' ? 'Маршрут' : 'Расшифровка'}</span>
        <span>зуб {tooth}</span>
      </div>
      {chapter === 'formula' && (
        <>
          <div className={styles.picks}>
            {(Object.keys(TEETH) as ToothId[]).map((id) => (
              <button key={id} type="button" className={`${styles.pick} ${tooth === id ? styles.on : ''}`} aria-pressed={tooth === id} onClick={() => onTooth(id)}>
                <img src={TEETH[id].src} alt="" width={TEETH[id].w} height={TEETH[id].h} />
                <span>{id}</span>
              </button>
            ))}
          </div>
          <p className={styles.finding}>{tooth} · {toothMeta.name}. {toothMeta.finding}.</p>
        </>
      )}
      {chapter === 'plans' && (
        <PlanSheet tooth={tooth} tier={tier} onTier={onTier} embedded />
      )}
      {chapter === 'sign' && (
        <div>
          <p className={styles.finding}>{TIER_LABEL[tier]} · зуб {tooth} · {toothMeta.name}</p>
          <p className={`${styles.signTotal} ${unbounded.className}`}>{rub(sum(plan.lines))}</p>
          <div className={styles.signRule}><span /></div>
          <p className={styles.signNote}>Подпись пациента. После неё план становится маршрутом.</p>
        </div>
      )}
      {chapter === 'route' && (
        <div className={styles.route}>
          <div className={styles.routeRow}><i className={`${styles.dot} ${styles.done}`} /><span><b>Санация</b><span>визит проведён</span></span><span>оплачено</span></div>
          <div className={styles.routeRow}><i className={`${styles.dot} ${styles.wait}`} /><span><b>Ортопедия</b><span>ждёт лабораторию</span></span><span>в работе</span></div>
          <div className={styles.routeRow}><i className={styles.dot} /><span><b>Контроль</b><span>визит ещё не назначен</span></span><span>дальше</span></div>
          <p className={styles.sheetFoot}>Пример. В продукте этапы приходят из подписанного плана.</p>
        </div>
      )}
      {chapter === 'money' && (
        <table className={styles.parts}>
          <caption className={styles.sheetFoot}>{plan.partOf} · зуб {tooth}</caption>
          <thead><tr><th>Состав</th><th>Кол.</th><th>Сумма</th></tr></thead>
          <tbody>
            {plan.parts.map((part) => (
              <tr key={part.name}><td>{part.name}</td><td>{part.qty}</td><td className={styles.money}>{rub(part.sum)}</td></tr>
            ))}
            <tr><td><b>Итого</b></td><td></td><td className={styles.money}>{rub(plan.parts.reduce((total, part) => total + part.sum, 0))}</td></tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

export function Landing() {
  const [splash, setSplash] = useState(true);
  const [openNav, setOpenNav] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [monthly, setMonthly] = useState(false);
  const [reduce, setReduce] = useState(false);
  const [dock, setDock] = useState(true);
  const [heroTier, setHeroTier] = useState<TierId>('optimum');
  const [tooth, setTooth] = useState<ToothId>('16');
  const [tier, setTier] = useState<TierId>('optimum');
  const [chapter, setChapter] = useState<ChapterId>('formula');
  const [offer, setOffer] = useState<Offer>('clinic');
  const [sent, setSent] = useState<{ name: string; phone: string; clinic: string; tariff: string } | null>(null);
  const [error, setError] = useState('');
  const pinRef = useRef<HTMLElement>(null);
  const active = CHAPTERS.find((item) => item.id === chapter) ?? CHAPTERS[0];

  const doctor = useCount(monthly ? 2250 : 27000, !reduce);
  const clinic = useCount(monthly ? 3750 : 45000, !reduce);

  const finishSplash = useCallback(() => {
    try { sessionStorage.setItem(SPLASH_KEY, '1'); } catch { /* private mode */ }
    document.documentElement.dataset.zazaSplash = 'off';
    setSplash(false);
  }, []);

  useLayoutEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReduce(motion);
    let seen = false;
    try { seen = sessionStorage.getItem(SPLASH_KEY) === '1'; } catch { seen = false; }
    if (motion || seen || document.documentElement.dataset.zazaSplash === 'off') setSplash(false);
  }, []);

  useEffect(() => {
    if (!splash) return;
    const timer = window.setTimeout(() => finishSplash(), 2480);
    return () => window.clearTimeout(timer);
  }, [splash, finishSplash]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const pin = pinRef.current;
    if (!pin) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (window.matchMedia('(max-width: 980px)').matches) return;
      const rect = pin.getBoundingClientRect();
      const total = pin.offsetHeight - window.innerHeight;
      if (total <= 0) return;
      const progress = Math.min(0.999, Math.max(0, -rect.top / total));
      const next = CHAPTERS[Math.min(CHAPTERS.length - 1, Math.floor(progress * CHAPTERS.length))].id;
      setChapter((current) => (current === next ? current : next));
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const node = document.getElementById('request');
    if (!node) return;
    const io = new IntersectionObserver(([entry]) => setDock(!entry.isIntersecting), { threshold: 0.15 });
    io.observe(node);
    return () => io.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const nodes = [...document.querySelectorAll<HTMLElement>('#zaza [data-reveal]')];
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add(styles.in);
        io.unobserve(entry.target);
      });
    }, { threshold: 0, rootMargin: '0px 0px -4% 0px' });
    nodes.forEach((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.96 && rect.bottom > 0) node.classList.add(styles.in);
      else {
        node.classList.add(styles.reveal);
        io.observe(node);
      }
    });
    const failsafe = window.setTimeout(() => {
      nodes.forEach((node) => node.classList.add(styles.in));
    }, 1200);
    return () => {
      io.disconnect();
      window.clearTimeout(failsafe);
    };
  }, []);

  const chooseOffer = (next: Offer) => {
    setOffer(next);
    document.getElementById('request')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  const jump = (id: ChapterId) => {
    setChapter(id);
    const pin = pinRef.current;
    if (!pin || window.matchMedia('(max-width: 980px)').matches) return;
    const index = CHAPTERS.findIndex((item) => item.id === id);
    const total = pin.offsetHeight - window.innerHeight;
    const top = window.scrollY + pin.getBoundingClientRect().top + (total * index) / CHAPTERS.length + 2;
    window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const phone = String(form.get('phone') ?? '').trim();
    const clinicName = String(form.get('clinic') ?? '').trim();
    const tariff = String(form.get('tariff') ?? offer);
    if (name.length < 2 || clinicName.length < 2 || phone.replace(/\D/g, '').length < 10) {
      setError('Напишите имя, телефон и название клиники.');
      return;
    }
    const row = { name, phone, clinic: clinicName, tariff, at: new Date().toISOString() };
    let prev: unknown[] = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(LEADS_KEY) || '[]') as unknown;
      if (Array.isArray(parsed)) prev = parsed;
    } catch { prev = []; }
    try { localStorage.setItem(LEADS_KEY, JSON.stringify([row, ...prev].slice(0, 50))); } catch { /* still show success */ }
    setError('');
    setSent({ name, phone, clinic: clinicName, tariff: OFFERS.find((item) => item.id === tariff)?.label ?? tariff });
  };

  const unit = monthly ? '₽ / мес' : '₽ / год';
  const yearNote = (year: number) => (monthly ? `при оплате ${year.toLocaleString('ru-RU')} ₽ за год` : 'оплата за год');

  return (
    <div id="zaza" className={`${styles.root} ${golos.className}`}>
      {splash && <Splash onDone={finishSplash} />}
      <header className={`${styles.header} ${scrolled ? styles.scrolled : ''}`}>
        <a className={`${styles.brand} ${unbounded.className}`} href="#top">ZAZA<small>для клиник</small></a>
        <nav className={`${styles.nav} ${openNav ? styles.open : ''}`} aria-label="Разделы">
          <a href="#story" onClick={() => setOpenNav(false)}>Приём</a>
          <a href="#move" onClick={() => setOpenNav(false)}>Переезд</a>
          <a href="#compare" onClick={() => setOpenNav(false)}>Сравнение</a>
          <a href="#pricing" onClick={() => setOpenNav(false)}>Тарифы</a>
          <a href="#author" onClick={() => setOpenNav(false)}>Автор</a>
          <a href="#faq" onClick={() => setOpenNav(false)}>Вопросы</a>
          <a className={styles.navCta} href="#request" onClick={() => setOpenNav(false)}>Запросить доступ</a>
        </nav>
        <div className={styles.headerActions}>
          <button type="button" className={styles.menuBtn} aria-expanded={openNav} onClick={() => setOpenNav((value) => !value)}>Меню</button>
          <a className={styles.btn} href="/login?role=owner">Демо</a>
          <a className={`${styles.btn} ${styles.btnPrimary} ${styles.headerCta}`} href="#request">Запросить доступ</a>
        </div>
      </header>

      <main id="top">
        <section className={`${styles.hero} ${styles.wrap}`}>
          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <p className={styles.kicker}>План за минуты</p>
              <h1 className={`${styles.display} ${unbounded.className}`}>Пациент подписывает, пока сидит в кресле</h1>
              <p className={styles.lead}>Пока план собирают после приёма, человек уходит думать. Отметьте находки на формуле или надиктуйте их. ZAZA соберёт эконом, оптимум и премиум, разложит цену и после подписи откроет маршрут.</p>
              <div className={styles.heroActions}>
                <a className={`${styles.btn} ${styles.btnPrimary}`} href="#request">Запросить доступ</a>
                <a className={styles.btn} href="/login?role=owner">Попробовать демо</a>
              </div>
              <p className={styles.heroNote}>Демо без установки: <a href="/login?role=owner">владелец</a>, <a href="/login?role=doctor">врач</a>, <a href="/login?role=admin">администратор</a>.</p>
              <p className={styles.proof}><span><b>Формула</b></span><span><b>Три варианта</b></span><span><b>Расшифровка</b></span><span><b>Маршрут</b></span></p>
            </div>
            <div className={styles.visual}>
              <img className={`${styles.shot} ${styles.shotFormula}`} src="/marketing/ui-formula.webp" width={1200} height={968} alt="Формула в ZAZA: верхняя челюсть, зуб 16 отмечен." />
              <img className={`${styles.shot} ${styles.shotPlan}`} src="/marketing/ui-plan.webp" width={1400} height={918} alt="Карта пациента: эконом, оптимум и премиум, под ними маршрут." />
              <img className={`${styles.shot} ${styles.shotRoute}`} src="/marketing/ui-route.webp" width={1200} height={264} alt="Маршрут лечения: следующий шаг и остаток по плану." />
              <i className={styles.molarShadow} aria-hidden />
              <img className={styles.molar} src="/marketing/tooth-16.webp" width={346} height={754} alt="Зуб 16, верхний первый моляр, вид сбоку. Та же модель, что в формуле." />
              <span className={`${styles.callout} ${styles.callFormula}`}>Формула</span>
              <span className={`${styles.callout} ${styles.callRoute}`}>Маршрут</span>
              <div className={styles.quote}>
                <PlanSheet tooth="16" tier={heroTier} onTier={setHeroTier} live reduce={reduce} />
              </div>
            </div>
          </div>
        </section>

        <section className={styles.pin} id="story" ref={pinRef}>
          <div className={styles.pinSticky}>
            <div className={styles.pinCopy}>
              <p className={styles.kicker}>Приём · {active.index} / 05</p>
              <h2 className={`${styles.display} ${unbounded.className}`}>{active.title}</h2>
              <p>{active.body}</p>
              {active.id === 'plans' && <p>Голос «Привет, ЗаЗа» спрашивает цифры, должников, карточку, оплаты, задачи и склад. Команду на запись видно на экране, её подтверждают. SpeechKit отвечает, когда на сервере есть ключ. Иначе говорит устройство.</p>}
              <div className={styles.pinNav}>
                {CHAPTERS.map((item) => (
                  <button key={item.id} type="button" className={chapter === item.id ? styles.current : ''} onClick={() => jump(item.id)}>
                    <b>{item.index}</b>
                    <span>{item.title}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.device}>
              <div className={styles.deviceBar}><b>ZAZA</b><span>{active.title}</span></div>
              <div className={`${styles.deviceBody} ${styles.cinema}`}>
                <Stage chapter={chapter} tooth={tooth} tier={tier} onTooth={setTooth} onTier={setTier} />
              </div>
            </div>
          </div>
        </section>
        <section className={`${styles.block} ${styles.wrap}`} data-reveal>
          <ul className={styles.day}>
            <li><b>Расписание</b><span>Карточки визитов по врачам, неделя, свободные окна и загрузка колонки.</span></li>
            <li><b>Деньги</b><span>Касса, счета и смены. Радар показывает незакрытые планы и долги.</span></li>
            <li><b>Снабжение</b><span>Склад знает остатки, партии и сроки. Лаборатория и стерилизация рядом.</span></li>
          </ul>
          <div className={styles.heroActions}>
            <a className={`${styles.btn} ${styles.btnPrimary}`} href="#request">Запросить доступ</a>
            <a className={styles.btn} href="/login?role=doctor">Открыть как врач</a>
          </div>
        </section>

        <section className={`${styles.block} ${styles.wrap}`} id="move" data-reveal>
          <p className={styles.kicker}>Переезд</p>
          <h2 className={`${styles.display} ${unbounded.className}`}>Как переехать за 1 день</h2>
          <p className={styles.sub}>Пациенты и расписание из текущей программы. Колонки можно поправить до записи. Финансовую историю целиком перенос не обещает. В демо есть учебный файл SQNS, живые фамилии туда класть не нужно.</p>
          <div className={styles.steps}>
            <article className={styles.step}><i>01</i><b>Выгрузка</b><p>Заберите файл пациентов и расписания.</p></article>
            <article className={styles.step}><i>02</i><b>Загрузка</b><p>Положите файл в «Переезд». ZAZA узнаёт источник.</p></article>
            <article className={styles.step}><i>03</i><b>Проверка</b><p>Поправьте колонки, посмотрите отчёт и подтвердите запись.</p></article>
            <article className={styles.step}><i>04</i><b>Приём</b><p>Карточки на месте. Расписание можно открыть в тот же день.</p></article>
          </div>
          <div className={`${styles.names} ${unbounded.className}`}>
            <span>SQNS</span>
            <span>IDENT</span>
            <span>АдминДента</span>
          </div>
        </section>

        <section className={`${styles.block} ${styles.wrap}`} data-reveal>
          <p className={styles.kicker}>Возражения</p>
          <h2 className={`${styles.display} ${unbounded.className}`}>Три вопроса до договора</h2>
          <div className={styles.objections}>
            <article className={styles.objection}>
              <h3 className={unbounded.className}>День, не квартал</h3>
              <p>Переносятся пациенты и расписание. Колонки видны до записи. После подтверждения карточки и день врача уже в ZAZA.</p>
            </article>
            <article className={styles.objection}>
              <h3 className={unbounded.className}>Без программиста</h3>
              <p>Владелец сам правит название и часы, сотрудников, кресла, прайс, склад, шаблоны, акции и двухфакторный вход. Права роли сохраняются сразу: себестоимость, закрытый визит, прайс, потолок скидки.</p>
            </article>
            <article className={styles.objection}>
              <h3 className={unbounded.className}>152-ФЗ</h3>
              <p>Согласие на обработку персональных данных есть в карте и в документах клиники. В тексте согласия хранение и работа системы поручаются на территории России.</p>
            </article>
          </div>
        </section>

        <section className={styles.band} id="compare" data-reveal>
          <div className={`${styles.block} ${styles.wrap}`}>
          <p className={styles.kicker}>Сравнение</p>
          <h2 className={`${styles.display} ${unbounded.className}`}>Что увозите и что появляется</h2>
          <p className={styles.sub}>АдминДента, IDENT и SQNS остаются источником пациентов и расписания. Ниже не список их недостатков, а то, что меняется в первый день.</p>
          <div className={styles.compare}>
            <div className={styles.compareHead}><span>Задача</span><span>Увозите с собой</span><span>В первый день в ZAZA</span></div>
            {[
              ['Пациенты', 'Файл из текущей программы', 'Карточки после проверки колонок'],
              ['Расписание', 'Визиты из того же файла', 'День врача можно открыть сразу'],
              ['План', 'Историю планов перенос не обещает', 'Три варианта из находок, врач правит до показа'],
              ['Цена пациенту', 'Как было в старой программе', 'Работа и расходники в плане, презентации и PDF'],
              ['После подписи', 'Дальше ведёт администратор', 'Визит, резерв материалов, заказ в лабораторию, оплата'],
            ].map(([task, from, to]) => (
              <div key={task} className={styles.compareRow}>
                <b>{task}</b>
                <span data-label="Увозите">{from}</span>
                <span className={styles.here} data-label="В ZAZA">{to}</span>
              </div>
            ))}
          </div>
          </div>
        </section>

        <section className={`${styles.block} ${styles.wrap}`} id="author" data-reveal>
          <p className={styles.kicker}>Автор</p>
          <div className={styles.authorGrid}>
            <div className={`${styles.monogram} ${unbounded.className}`} aria-hidden>ЗА</div>
            <div>
              <h2 className={`${styles.display} ${unbounded.className}`}>Завен Агаян</h2>
              <p>Практикующий стоматолог и владелец клиник. ZAZA — его авторский проект: систему он собрал для своих клиник и открывает её как сервис для других практик.</p>
            </div>
          </div>
        </section>

        <section className={`${styles.block} ${styles.wrap}`} id="pricing" data-reveal>
          <div className={styles.priceHead}>
            <div>
              <p className={styles.kicker}>Тарифы</p>
              <h2 className={`${styles.display} ${unbounded.className}`}>Годовая оплата</h2>
              <p className={styles.sub}>Месяц на переключателе — годовая цена, разделённая на 12.</p>
            </div>
            <div className={styles.toggle} role="group" aria-label="Период цены">
              <button type="button" className={!monthly ? styles.on : ''} onClick={() => setMonthly(false)}>Год</button>
              <button type="button" className={monthly ? styles.on : ''} onClick={() => setMonthly(true)}>Месяц</button>
            </div>
          </div>
          <div className={styles.offers}>
            <article className={styles.offer}>
              <p className={styles.kicker}>За врача</p>
              <h3 className={unbounded.className}>Врач</h3>
              <p className={`${styles.amount} ${unbounded.className}`}>{doctor.toLocaleString('ru-RU')} <small>{unit}</small></p>
              <p className={styles.yearNote}>{yearNote(27000)}</p>
              <ul className={styles.features}>
                <li>Формула и приём</li>
                <li>Планы и презентация пациенту</li>
                <li>Расписание одного врача</li>
              </ul>
              <button type="button" className={styles.btn} onClick={() => chooseOffer('doctor')}>Заявка</button>
            </article>
            <article className={`${styles.offer} ${styles.offerInk}`}>
              <p className={styles.kicker}>За клинику</p>
              <h3 className={unbounded.className}>Клиника</h3>
              <p className={`${styles.amount} ${unbounded.className}`}>{clinic.toLocaleString('ru-RU')} <small>{unit}</small></p>
              <p className={styles.yearNote}>{yearNote(45000)}</p>
              <ul className={styles.features}>
                <li>Стойка, роли и кресла</li>
                <li>Касса, долги и склад</li>
                <li>Лаборатория и маршруты</li>
                <li>Переезд пациентов и расписания</li>
              </ul>
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => chooseOffer('clinic')}>Заявка</button>
            </article>
            <article className={styles.offer}>
              <p className={styles.kicker}>Под вашу сеть</p>
              <h3 className={unbounded.className}>Сеть</h3>
              <p className={`${styles.amount} ${unbounded.className}`}>индивидуально</p>
              <p className={styles.yearNote}>условия обсуждаем</p>
              <ul className={styles.features}>
                <li>Всё, что входит в клинику</li>
                <li>Филиалы</li>
                <li>Кресла по назначениям</li>
              </ul>
              <button type="button" className={styles.btn} onClick={() => chooseOffer('network')}>Обсудить</button>
            </article>
          </div>
          <div className={styles.addon}>
            <div>
              <b>ИИ-опция</b>
              <p>Автоплан и голосовые сценарии. Цена по запросу, отдельно от тарифа.</p>
            </div>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => chooseOffer('ai')}>Узнать цену</button>
          </div>
          <p className={styles.fine}>Так мы упаковываем продажу. Демо открывает клинику целиком, чтобы можно было пройти все экраны.</p>
        </section>

        <section className={`${styles.block} ${styles.wrap} ${styles.faq}`} id="faq" data-reveal>
          <p className={styles.kicker}>Вопросы</p>
          <h2 className={`${styles.display} ${unbounded.className}`}>Коротко</h2>
          <details>
            <summary>Это программа на компьютер или сервис?</summary>
            <p>Сервис в браузере. Демо работает без своего сервера: можно войти как владелец, врач или администратор и пройти приём.</p>
          </details>
          <details>
            <summary>Откуда переносятся пациенты?</summary>
            <p>Из SQNS, IDENT и АдминДенты: пациенты и расписание. Перед записью видны колонки и отчёт. Финансовую историю целиком перенос не обещает.</p>
          </details>
          <details>
            <summary>Что делает автоплан?</summary>
            <p>По находкам собирает три варианта. Врач выбирает и правит. Владелец может выключить автоплан. Опция оплачивается отдельно, цена по запросу.</p>
          </details>
          <details>
            <summary>Пациент видит себестоимость?</summary>
            <p>Нет. Пациенту показывается цена услуги и, если включено, расшифровка: работа врача и расходники. Себестоимость и маржа видны тем ролям, которым это разрешил владелец.</p>
          </details>
          <details>
            <summary>Как устроено согласие и где данные?</summary>
            <p>Согласие по 152-ФЗ подписывается в карте. В документе согласия хранение и работа медицинской системы поручаются на территории России.</p>
          </details>
          <details>
            <summary>Куда ведёт демо?</summary>
            <p>На вход в рабочую систему: <a href="/login?role=owner">владелец</a>, <a href="/login?role=doctor">врач</a>, <a href="/login?role=admin">администратор</a>.</p>
          </details>
        </section>

        <section className={`${styles.cta} ${styles.wrap}`} id="request" data-reveal>
          <div>
            <p className={styles.kicker}>Доступ</p>
            <h2 className={`${styles.display} ${unbounded.className}`}>Откроем ZAZA для вашей клиники</h2>
            <p className={styles.lead}>Имя, телефон и название. Заявка сохранится в этом браузере, и на странице будет видно, что она принята.</p>
          </div>
          {sent ? (
            <div className={styles.success} role="status">
              <b className={unbounded.className}>Заявка принята</b>
              <p>{sent.name}, клиника «{sent.clinic}». Свяжемся по {sent.phone}. Тариф: {sent.tariff}.</p>
              <button type="button" className={styles.btn} onClick={() => setSent(null)}>Отправить ещё одну</button>
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
      <footer className={`${styles.footer} ${styles.wrap}`}>
        <span>ZAZA · авторский проект Завена Агаяна</span>
        <span><a href="/login?role=owner">Демо владельца</a> · <a href="/login?role=admin">Демо администратора</a> · <a href="#request">Заявка</a></span>
      </footer>
      {dock && !openNav && (
        <div className={styles.dock}>
          <a className={styles.btn} href="/login?role=owner">Демо</a>
          <a className={`${styles.btn} ${styles.btnPrimary}`} href="#request">Запросить доступ</a>
        </div>
      )}
    </div>
  );
}
