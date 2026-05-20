'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/lib/auth-context';
import { useBranch } from '@/lib/branch-context';
import { Select } from '@/components/ui/input';
import { NAVIGATION, NAV_GROUPS } from '@/config/navigation';

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { branches, branchId, setBranchId, loading: branchLoading } = useBranch();
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const currentNav = NAVIGATION.find((n) => n.href === pathname);

  return (
    <div className="flex min-h-screen bg-[var(--bg)]">
      <aside className="fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col bg-[var(--sidebar)] text-[var(--sidebar-text)] shadow-xl">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--blue)] text-white shadow-lg">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="text-base font-bold tracking-tight text-white">DentaSmart</div>
              <div className="text-[10px] font-medium uppercase tracking-widest text-[var(--accent)]">Pro CRM</div>
            </div>
          </div>
          <p className="mt-3 truncate text-xs text-white/50">{user?.organization.name}</p>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group} className="mb-5">
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-white/35">
                {group}
              </p>
              {NAVIGATION.filter((n) => n.group === group).map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={clsx(
                      'mb-0.5 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                      active
                        ? 'bg-white/10 text-white shadow-inner'
                        : 'text-[var(--sidebar-text)] hover:bg-white/5 hover:text-white',
                    )}
                  >
                    <Icon size={18} className={active ? 'text-[var(--accent)]' : 'opacity-70'} />
                    <span className="truncate">{label}</span>
                    {active && (
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="rounded-xl bg-white/5 p-3">
            <p className="truncate text-sm font-medium text-white">
              {user?.employee
                ? `${user.employee.firstName} ${user.employee.lastName}`
                : user?.email}
            </p>
            <p className="truncate text-xs text-white/40">{user?.email}</p>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 py-2 text-xs text-white/70 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
            >
              <LogOut size={14} />
              Выйти
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pl-[260px]">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface)]/90 px-8 py-3.5 backdrop-blur-md">
          <p className="text-sm text-[var(--muted)]">
            <span className="font-medium uppercase tracking-wide">{currentNav?.group ?? 'DentaSmart'}</span>
            {currentNav && (
              <>
                <span className="mx-2 text-[var(--border-strong)]">/</span>
                <span className="text-[var(--text-secondary)]">{currentNav.label}</span>
              </>
            )}
          </p>
          {branches.length > 0 && (
            <Select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              disabled={branchLoading}
              className="max-w-[220px] text-sm"
              aria-label="Филиал"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          )}
        </header>
        <main className="flex-1 p-8">
          <div className="ds-page">{children}</div>
        </main>
      </div>
    </div>
  );
}
