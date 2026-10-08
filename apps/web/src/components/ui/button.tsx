import clsx from 'clsx';
import { ButtonHTMLAttributes } from 'react';

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 font-semibold transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' && 'rounded-lg px-3 py-1.5 text-xs',
        size === 'md' && 'rounded-xl px-4 py-2 text-sm',
        size === 'lg' && 'rounded-xl px-5 py-2.5 text-sm',
        variant === 'primary' &&
          'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]',
        variant === 'secondary' &&
          'bg-[var(--text)] text-white hover:bg-[var(--accent)]',
        variant === 'ghost' &&
          'border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]',
        variant === 'danger' &&
          'border border-[var(--danger)]/20 bg-[var(--danger-soft)] text-[var(--danger)] hover:bg-[var(--danger)]/10',
        className,
      )}
      {...props}
    />
  );
}
