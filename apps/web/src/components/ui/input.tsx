import clsx from 'clsx';
import { InputHTMLAttributes } from 'react';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx('ds-input', className)} {...props} />;
}

export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={clsx('mb-1.5 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]', className)}>
      {children}
    </span>
  );
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx('ds-input cursor-pointer', className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={clsx('ds-input min-h-[88px] resize-y', className)}
      {...props}
    />
  );
}
