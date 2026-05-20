'use client';

import { X } from 'lucide-react';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: 'md' | 'lg' | 'xl';
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      style={{ background: 'rgba(15, 23, 42, 0.4)' }}
      onClick={onClose}
    >
      <div
        className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl ${
          size === 'xl' ? 'max-w-3xl' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">{title}</h2>
            {description && <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
