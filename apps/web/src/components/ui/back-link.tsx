import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--muted)] transition hover:text-[var(--accent)]"
    >
      <ArrowLeft size={16} />
      {children}
    </Link>
  );
}
