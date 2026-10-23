'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Activity, BarChart3, Calendar, FileText, Globe, LayoutGrid, LogOut, PanelRight, CalendarRange, ClipboardCheck, FlaskConical, Moon, Package, PhoneIncoming, QrCode, Radar, Repeat, RotateCcw, Search, Settings, Shield, Smartphone, Sparkles, Sun, Sunrise, Tags, Trophy, Upload, Users, Wallet } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { useFocus } from '@/lib/focus';
import { api } from '@/lib/api';
import { BookingSheet } from './booking/booking-sheet';
import { ContextPanel } from './studio/panels';
import { Assistant, AssistantTrigger } from './assistant/assistant';

const PRIMARY = [
  { href: '/', label: 'Сегодня', icon: Calendar, perm: 'patient.read' },
  { href: '/patients', label: 'Пациенты', icon: Users, perm: 'patient.read' },
  { href: '/schedule', label: 'Расписание', short: 'Запись', icon: CalendarRange, perm: 'schedule.read' },
  { href: '/supply', label: 'Снабжение', short: 'Склад', icon: Package, perm: 'warehouse.read' },
  { href: '/money', label: 'Деньги', icon: Wallet, perm: 'finance.read' },
];

const MORE = [
  { href: '/documents', label: 'Документы', icon: FileText, perm: 'patient.read' },
  { href: '/price', label: 'Прайс', icon: Tags, perm: 'patient.read' },
  { href: '/requests', label: 'Запись с сайта', icon: Globe, perm: 'schedule.read' },
  { href: '/leads', label: 'Заявки', icon: PhoneIncoming, perm: 'patient.read' },
  { href: '/reports', label: 'Отчёты', icon: BarChart3, perm: 'schedule.read' },
  { href: '/kpis', label: 'Врачи', icon: Trophy, perm: 'patient.read' },
  { href: '/radar', label: 'Радар денег', icon: Radar, perm: 'finance.read' },
  { href: '/return', label: 'Возврат пациентов', icon: RotateCcw, perm: 'medical.read' },
  { href: '/check-in', label: 'QR стойки', icon: QrCode, perm: 'schedule.read' },
  { href: '/import', label: 'Переезд', icon: Upload, perm: 'patient.write' },
];

const SETTINGS = { href: '/settings', label: 'Настройки', icon: Settings, perm: 'org.manage' };

/** Still reachable by address and through ⌘K, but kept out of the menu. */
const HIDDEN = [
  { href: '/briefing', label: 'Утро', icon: Sunrise, perm: 'patient.read' },
  { href: '/pulse', label: 'Пульс', icon: Activity, perm: 'patient.read' },
  { href: '/lab', label: 'Лаборатория', icon: FlaskConical, perm: 'medical.read' },
  { href: '/quality', label: 'Карты', icon: ClipboardCheck, perm: 'medical.read' },
  { href: '/insurance', label: 'ДМС', icon: Shield, perm: 'finance.read' },
  { href: '/autopilot', label: 'Автопилот', icon: Repeat, perm: 'patient.read' },
  { href: '/portal', label: 'Кабинет пациента', icon: Smartphone, perm: 'patient.read' },
  { href: '/onboarding', label: 'Запуск', icon: Sparkles, perm: 'patient.read' },
];

const NAV = [...PRIMARY, ...MORE, SETTINGS, ...HIDDEN];

type Hit = { id: string; firstName: string; lastName: string; phone: string | null };

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { panelOpen, setPanelOpen, setFocus } = useFocus();
  const [palette, setPalette] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [cursor, setCursor] = useState(0);
  const [density, setDensity] = useState<'compact' | 'comfort'>('compact');
  const [sheet, setSheet] = useState(false);
  const [assistant, setAssistant] = useState(false);
  // Set after mount so the server render and the browser agree on the date.
  const [today, setToday] = useState('');
  useEffect(() => { setToday(new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' }).format(new Date())); }, []);

  const allowed = (item: (typeof NAV)[number]) => user?.permissions.includes(item.perm);
  const primary = PRIMARY.filter(allowed);
  const more = MORE.filter(allowed);
  const settings = allowed(SETTINGS) ? SETTINGS : null;
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const sheetActive = [...more, ...(settings ? [settings] : [])].some((link) => isActive(link.href));
  const fullName = user?.employee ? `${user.employee.lastName} ${user.employee.firstName}` : user?.email ?? '';
  const initials = user?.employee ? `${user.employee.firstName[0] ?? ''}${user.employee.lastName[0] ?? ''}` : (user?.email[0] ?? '').toUpperCase();
  const links = [...primary, ...more, ...(settings ? [settings] : []), ...HIDDEN.filter(allowed)];

  useEffect(() => {
    const stored = localStorage.getItem('sd_density');
    if (stored === 'comfort' || stored === 'compact') setDensity(stored);
  }, []);

  useEffect(() => { setSheet(false); }, [pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPalette((open) => !open);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        setAssistant((open) => !open);
      }
      if (event.key === 'Escape') { setPalette(false); setSheet(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!palette || query.trim().length < 2) { setHits([]); return; }
    const handle = setTimeout(() => {
      api<Hit[]>(`/workspace/search?q=${encodeURIComponent(query)}`).then(setHits).catch(() => setHits([]));
    }, 140);
    return () => clearTimeout(handle);
  }, [palette, query]);

  const commands = useMemo(() => {
    const pages = links.map((link) => ({ id: link.href, label: link.label, run: () => router.push(link.href) }));
    const people = hits.map((hit) => ({
      id: hit.id,
      label: `${hit.lastName} ${hit.firstName}${hit.phone ? ` · ${hit.phone}` : ''}`,
      run: () => {
        setFocus({ type: 'patient', id: hit.id });
        router.push(`/patients/${hit.id}`);
      },
    }));
    const tools = [
      { id: 'theme', label: theme === 'dark' ? 'Светлая тема' : 'Тёмная тема', run: toggle },
      { id: 'density', label: density === 'compact' ? 'Плотность: комфорт' : 'Плотность: компакт', run: () => switchDensity(density === 'compact' ? 'comfort' : 'compact') },
      { id: 'logout', label: 'Выйти из аккаунта', run: logout },
    ];
    const pool = query.trim().length < 2 ? [...pages, ...tools] : [...people, ...pages];
    return pool;
  }, [links, hits, query, router, setFocus, theme, toggle, density, logout]);

  useEffect(() => { setCursor(0); }, [query, palette]);

  const switchDensity = (next: 'compact' | 'comfort') => {
    setDensity(next);
    localStorage.setItem('sd_density', next);
    document.documentElement.dataset.density = next;
  };

  const run = (index: number) => {
    const command = commands[index];
    if (!command) return;
    command.run();
    setPalette(false);
    setQuery('');
  };

  return (
    <div className={`sd-app${panelOpen ? ' with-panel' : ''}`}>
      <aside className="sd-nav" aria-label="Разделы">
        <Link href="/" className="sd-brand" aria-label="Седракович Дент — сегодня">
          <span className="sd-mark" aria-hidden>С</span>
          <span className="sd-brand-text"><strong>Седракович Дент</strong><span>{today}</span></span>
        </Link>
        <button className="sd-search" type="button" onClick={() => setPalette(true)} title="Поиск (⌘K)">
          <Search />
          <span className="sd-search-text">Поиск</span>
          <kbd>⌘K</kbd>
        </button>
        <AssistantTrigger variant="nav" onOpen={() => setAssistant(true)} />
        <nav className="sd-nav-list">
          {primary.map((link) => <NavLink key={link.href} link={link} active={isActive(link.href)} />)}
          {more.length > 0 && <span className="sd-nav-group">Ещё</span>}
          {more.map((link) => <NavLink key={link.href} link={link} active={isActive(link.href)} extra />)}
        </nav>
        <button className={`sd-link sd-link-more${sheet ? ' open' : ''}`} type="button" onClick={() => setSheet((open) => !open)} aria-expanded={sheet} aria-current={sheetActive ? 'page' : undefined}>
          <span className="sd-link-ico"><LayoutGrid /></span>
          <span className="sd-nav-label">Ещё</span>
        </button>
        <div className="sd-nav-foot">
          {settings && <NavLink link={settings} active={isActive(settings.href)} extra />}
          <button className={`sd-link is-extra${panelOpen ? ' active' : ''}`} type="button" onClick={() => setPanelOpen(!panelOpen)} aria-pressed={panelOpen} title="Панель контекста">
            <span className="sd-link-ico"><PanelRight /></span>
            <span className="sd-nav-label">{panelOpen ? 'Скрыть контекст' : 'Контекст'}</span>
          </button>
          <div className="sd-user">
            <span className="sd-avatar" aria-hidden>{initials}</span>
            <span className="sd-user-text"><b>{fullName}</b><span>{user?.organization.name}</span></span>
            <button className="sd-user-btn" type="button" onClick={toggle} title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'} aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}>{theme === 'dark' ? <Sun /> : <Moon />}</button>
            <button className="sd-user-btn" type="button" onClick={logout} title="Выйти" aria-label="Выйти"><LogOut /></button>
          </div>
        </div>
      </aside>
      <div className="sd-main">
        <div className="sd-workspace">{children}</div>
      </div>
      <BookingSheet />
      <AssistantTrigger variant="fab" onOpen={() => setAssistant(true)} />
      <Assistant open={assistant} onClose={() => setAssistant(false)} />
      <aside className={`sd-panel ${panelOpen ? 'open' : ''}`}>
        <ContextPanel />
      </aside>
      {sheet && (
        <div className="sd-more-sheet-back" onClick={() => setSheet(false)}>
          <div className="sd-more-sheet" role="dialog" aria-label="Все разделы" onClick={(event) => event.stopPropagation()}>
            <div className="sd-more-sheet-user">
              <span className="sd-avatar" aria-hidden>{initials}</span>
              <span className="sd-user-text"><b>{fullName}</b><span>{user?.organization.name}</span></span>
            </div>
            <button className="sd-sheet-search" type="button" onClick={() => { setSheet(false); setPalette(true); }}><Search size={18} />Поиск пациента и команды</button>
            <AssistantTrigger variant="inline" onOpen={() => { setSheet(false); setAssistant(true); }} />
            <div className="sd-more-sheet-grid">
              {[...more, ...(settings ? [settings] : [])].map((link) => {
                const Icon = link.icon;
                return (
                  <Link key={link.href} href={link.href} className={`sd-tile${isActive(link.href) ? ' active' : ''}`} onClick={() => setSheet(false)}>
                    <Icon />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </div>
            <div className="sd-more-sheet-actions">
              <button className="sd-btn-ghost" type="button" onClick={() => setPanelOpen(!panelOpen)}><PanelRight size={16} />{panelOpen ? 'Скрыть контекст' : 'Контекст'}</button>
              <button className="sd-btn-ghost" type="button" onClick={toggle}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}{theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}</button>
              <button className="sd-btn-ghost" type="button" onClick={logout}><LogOut size={16} />Выйти</button>
            </div>
          </div>
        </div>
      )}
      {palette && (
        <div className="sd-palette" onMouseDown={() => setPalette(false)}>
          <div className="sd-palette-box" onMouseDown={(event) => event.stopPropagation()}>
            <input
              autoFocus
              placeholder="Пациент, экран, команда"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') { event.preventDefault(); setCursor((n) => Math.min(commands.length - 1, n + 1)); }
                if (event.key === 'ArrowUp') { event.preventDefault(); setCursor((n) => Math.max(0, n - 1)); }
                if (event.key === 'Enter') run(cursor);
              }}
            />
            {commands.map((command, index) => (
              <button key={command.id} className={`sd-cmd ${index === cursor ? 'on' : ''}`} type="button" onMouseEnter={() => setCursor(index)} onClick={() => run(index)}>
                {command.label}
              </button>
            ))}
            {commands.length === 0 && <p className="sd-muted" style={{ padding: 14 }}>Ничего не найдено</p>}
          </div>
        </div>
      )}
    </div>
  );
}

type NavItem = { href: string; label: string; short?: string; icon: React.ComponentType; perm: string };

function NavLink({ link, active, extra }: { link: NavItem; active: boolean; extra?: boolean }) {
  const Icon = link.icon;
  return (
    <Link href={link.href} className={`sd-link${active ? ' active' : ''}${extra ? ' is-extra' : ''}`} aria-current={active ? 'page' : undefined} title={link.label}>
      <span className="sd-link-ico"><Icon /></span>
      <span className="sd-nav-label" data-short={link.short}>{link.label}</span>
    </Link>
  );
}
