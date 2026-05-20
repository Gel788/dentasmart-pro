import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

export function ListRow({
  href,
  onClick,
  children,
  trailing,
  className,
}: {
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">{children}</div>
      {(trailing || href) && (
        <div className="flex shrink-0 items-center gap-2 text-[var(--muted)]">
          {trailing}
          {href && <ChevronRight size={16} />}
        </div>
      )}
    </>
  );

  const base = clsx(
    'flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 text-sm transition',
    (href || onClick) && 'cursor-pointer hover:border-[var(--accent)]/40 hover:shadow-[var(--shadow-sm)]',
    className,
  );

  if (href) {
    return (
      <Link href={href} className={base}>
        {inner}
      </Link>
    );
  }

  return (
    <div role={onClick ? 'button' : undefined} onClick={onClick} className={base}>
      {inner}
    </div>
  );
}
