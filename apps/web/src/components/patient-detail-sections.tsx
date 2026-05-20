'use client';

import Link from 'next/link';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/lib/format';

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx('rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--text)]">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-[var(--muted)]">{description}</p>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function TimelineItem({
  time,
  title,
  subtitle,
  badge,
  href,
}: {
  time: string;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  href?: string;
}) {
  const inner = (
    <div className="relative flex gap-4 pb-6 last:pb-0">
      <div className="flex flex-col items-center">
        <div className="z-10 flex h-3 w-3 shrink-0 rounded-full border-2 border-[var(--accent)] bg-[var(--surface)]" />
        <div className="w-px flex-1 bg-[var(--border)]" />
      </div>
      <div className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/40 px-4 py-3 transition hover:border-[var(--accent)]/30 hover:bg-[var(--accent-soft)]/20">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">{time}</p>
            <p className="mt-0.5 font-semibold text-[var(--text)]">{title}</p>
            {subtitle && <p className="mt-0.5 text-sm text-[var(--muted)]">{subtitle}</p>}
          </div>
          {badge}
        </div>
      </div>
    </div>
  );
  if (href) {
    return <Link href={href}>{inner}</Link>;
  }
  return inner;
}

export function InvoiceCard({
  number,
  total,
  paid,
  statusLabel,
  statusVariant,
  payHref,
}: {
  number: string;
  total: string;
  paid: string;
  statusLabel: string;
  statusVariant: 'default' | 'accent' | 'success' | 'warning' | 'danger';
  payHref?: string;
}) {
  const totalN = Number(total);
  const paidN = Number(paid);
  const remaining = Math.max(0, totalN - paidN);
  const pct = totalN > 0 ? Math.min(100, Math.round((paidN / totalN) * 100)) : 0;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-[var(--text)]">{number}</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-[var(--text)]">
            {formatMoney(paid)} <span className="text-sm font-normal text-[var(--muted)]">/ {formatMoney(total)}</span>
          </p>
        </div>
        <Badge variant={statusVariant}>{statusLabel}</Badge>
      </div>
      <div className="mt-3">
        <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-1 text-right text-xs text-[var(--muted)]">{pct}% оплачено</p>
      </div>
      {payHref && remaining > 0 && (
        <Link
          href={payHref}
          className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Оплатить {formatMoney(remaining)}
        </Link>
      )}
    </div>
  );
}

export function PlanCard({
  id,
  title,
  statusLabel,
  statusVariant,
  totalPrice,
  itemsCount,
  completedCount,
}: {
  id: string;
  title: string;
  statusLabel: string;
  statusVariant: 'default' | 'accent' | 'success' | 'warning';
  totalPrice: string;
  itemsCount: number;
  completedCount?: number;
}) {
  const done = completedCount ?? 0;
  const pct = itemsCount > 0 ? Math.round((done / itemsCount) * 100) : 0;

  return (
    <Link
      href={`/clinical/${id}`}
      className="block rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[var(--surface)] to-[var(--accent-soft)]/20 p-5 transition hover:border-[var(--accent)] hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-[var(--text)]">{title}</h3>
        <Badge variant={statusVariant}>{statusLabel}</Badge>
      </div>
      <p className="mt-2 text-2xl font-bold text-[var(--accent)]">{formatMoney(totalPrice)}</p>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {done}/{itemsCount} этапов выполнено
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
        <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${pct}%` }} />
      </div>
    </Link>
  );
}

export function EmptyBlock({ icon: Icon, title, action }: { icon: LucideIcon; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] py-12 text-center">
      <Icon size={36} className="mb-3 text-[var(--muted)] opacity-40" strokeWidth={1.5} />
      <p className="text-sm text-[var(--muted)]">{title}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
