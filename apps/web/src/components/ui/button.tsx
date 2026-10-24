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
        'inline-flex items-center justify-center gap-2 font-semibold transition-[background-color,border-color,color] duration-150 disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' && 'min-h-[36px] px-3 text-[13px]',
        size === 'md' && 'min-h-[44px] px-4 text-sm',
        size === 'lg' && 'min-h-[48px] px-5 text-[15px]',
        variant === 'primary' &&
          'bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]',
        variant === 'secondary' &&
          'bg-[var(--text)] text-[var(--surface-solid)] hover:bg-black',
        variant === 'ghost' &&
          'border border-[var(--border-strong)] bg-[var(--surface-solid)] text-[var(--text)] hover:bg-[var(--surface-2)]',
        variant === 'danger' &&
          'border border-[var(--danger)] bg-[var(--surface-solid)] text-[var(--danger)] hover:bg-[var(--danger-soft)]',
        className,
      )}
      {...props}
    />
  );
}
