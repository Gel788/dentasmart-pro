'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/lib/auth-context';
import { useBranch } from '@/lib/branch-context';
import { useTheme } from '@/lib/theme-context';
import { Select } from '@/components/ui/input';
import { findNavItem, isNavActive, NAV_GROUPS, NAVIGATION } from '@/config/navigation';

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { branches, branchId, setBranchId, loading: branchLoading } = useBranch();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const markerRef = useRef<HTMLSpanElement>(null);
  const markerSeen = useRef(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const marker = markerRef.current;
    if (!nav || !marker) return;
    const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (!active) return;
    if (!markerSeen.current) marker.style.transition = 'none';
    marker.style.transform = `translateY(${active.offsetTop}px)`;
    marker.style.height = `${active.offsetHeight}px`;
    if (!markerSeen.current) {
      marker.getBoundingClientRect();
      marker.style.transition = '';
      markerSeen.current = true;
    }
  }, [pathname]);

  const permissions = user?.permissions ?? [];
  const navigation = NAVIGATION.filter((item) => !item.permission || permissions.includes(item.permission));
  const groups = NAV_GROUPS.filter((group) => navigation.some((item) => item.group === group));
  const current = findNavItem(pathname);
  const person = user?.employee
    ? `${user.employee.firstName} ${user.employee.lastName}`
    : user?.email;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {open && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-[#161916]/40 lg:hidden"
          aria-label="Закрыть меню"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex w-[272px] flex-col border-r border-white/5 bg-[var(--sidebar)] text-[var(--sidebar-text)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-5 pb-3 pt-6">
          <Link href="/reception" className="flex min-w-0 items-center gap-3">
            <span className="ds-display flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-sm text-white">
              С
            </span>
            <span className="min-w-0">
              <span className="ds-display block truncate text-[15px] tracking-tight text-white">Седракович Дент</span>
              <span className="block truncate text-[11px] text-white/45">{user?.organization.name}</span>
            </span>
          </Link>
          <button
            type="button"
            className="rounded-md p-1 text-white/70 lg:hidden"
            aria-label="Закрыть меню"
            onClick={() => setOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <nav ref={navRef} className="relative mt-4 flex-1 overflow-y-auto px-3 pb-4" aria-label="Разделы">
          <span ref={markerRef} className="ds-nav-marker" aria-hidden />
          {groups.map((group) => (
            <div key={group} className="mb-4">
              <p className="mb-1 px-3 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">{group}</p>
              {navigation.filter((item) => item.group === group).map((item) => {
                const Icon = item.icon;
                const active = isNavActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    title={item.description}
                    className={clsx(
                      'relative z-[1] mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors duration-150',
                      active
                        ? 'font-semibold text-white'
                        : 'text-[var(--sidebar-text)] hover:text-white',
                    )}
                  >
                    <Icon size={16} strokeWidth={1.75} className={active ? 'text-[var(--sidebar-active)]' : 'text-white/45'} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 px-5 py-4">
          <p className="truncate text-sm text-white">{person}</p>
          <p className="truncate text-[11px] text-white/45">{user?.email}</p>
          <button type="button" onClick={logout} className="mt-3 inline-flex items-center gap-2 text-xs text-white/70 hover:text-white">
            <LogOut size={14} />
            Выйти
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col lg:pl-[272px]">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)]/90 px-3 py-2.5 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              className="rounded-lg p-2 text-[var(--text)] hover:bg-[var(--surface-muted)] lg:hidden"
              aria-label="Открыть меню"
              onClick={() => setOpen(true)}
            >
              <Menu size={18} />
            </button>
            <p className="truncate text-sm font-medium text-[var(--text)]">{current?.label ?? 'Клиника'}</p>
            {current?.description && (
              <p className="hidden truncate text-sm text-[var(--muted)] md:block">{current.description}</p>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <p className="hidden whitespace-nowrap text-xs text-[var(--muted)] xl:block">
              {new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' }).format(new Date())}
            </p>
            <button
              type="button"
              onClick={toggle}
              className="rounded-lg border border-[var(--border)] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"
              aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            {branches.length > 0 && (
              <Select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                disabled={branchLoading}
                className="max-w-[9.5rem] text-sm sm:max-w-[220px]"
                aria-label="Филиал"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <div className="ds-page">{children}</div>
        </main>
      </div>
    </div>
  );
}
