'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Calendar, CalendarRange, Moon, RotateCcw, Search, Sun, Tags, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { useFocus } from '@/lib/focus';
import { api } from '@/lib/api';
import { ContextPanel } from './studio/panels';

const NAV = [
  { href: '/', label: 'Сегодня', icon: Calendar, perm: 'patient.read' },
  { href: '/patients', label: 'Пациенты', icon: Users, perm: 'patient.read' },
  { href: '/schedule', label: 'Расписание', icon: CalendarRange, perm: 'schedule.read' },
  { href: '/return', label: 'Возврат планов', icon: RotateCcw, perm: 'medical.read' },
  { href: '/price', label: 'Прайс', icon: Tags, perm: 'patient.read' },
];

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

  const links = NAV.filter((item) => user?.permissions.includes(item.perm));

  useEffect(() => {
    const stored = localStorage.getItem('sd_density');
    if (stored === 'comfort' || stored === 'compact') setDensity(stored);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPalette((open) => !open);
      }
      if (event.key === 'Escape') setPalette(false);
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
    ];
    const pool = query.trim().length < 2 ? [...pages, ...tools] : [...people, ...pages];
    return pool;
  }, [links, hits, query, router, setFocus, theme, toggle, density]);

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
    <div className="sd-app">
      <aside className="sd-nav">
        <div className="sd-brand">
          <div className="sd-mark">С</div>
          <div className="sd-brand-text">
            <strong>Седракович Дент</strong>
            <span>Sedrakovich Dent</span>
          </div>
        </div>
        {links.map((link) => {
          const Icon = link.icon;
          const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
          return (
            <Link key={link.href} href={link.href} className={`sd-link ${active ? 'active' : ''}`}>
              <Icon />
              <span className="sd-nav-label">{link.label}</span>
            </Link>
          );
        })}
        <div className="sd-nav-foot">
          <button className="sd-icon-btn" type="button" onClick={toggle} aria-label="Тема">
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <div className="sd-user">
            <b>{user?.employee ? `${user.employee.lastName} ${user.employee.firstName}` : user?.email}</b>
            <span>{user?.organization.name}</span>
          </div>
          <button className="sd-btn-ghost" type="button" onClick={logout}>Выйти</button>
        </div>
      </aside>
      <div className="sd-main">
        <header className="sd-top">
          <button className="sd-search" type="button" onClick={() => setPalette(true)}>
            <Search size={15} />
            Поиск пациента и команды
            <kbd>⌘K</kbd>
          </button>
          <button className="sd-btn-ghost sd-panel-toggle" type="button" onClick={() => setPanelOpen(!panelOpen)}>Контекст</button>
        </header>
        <div className="sd-workspace">{children}</div>
      </div>
      <aside className={`sd-panel ${panelOpen ? 'open' : ''}`}>
        <ContextPanel />
      </aside>
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
