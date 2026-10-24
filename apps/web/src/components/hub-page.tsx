'use client';

import Link from 'next/link';
import { Protected } from '@/components/protected';
import { PageHeader } from '@/components/ui/page-header';

export type HubPart = { href: string; title: string; text: string };

/** Entry page of a top-level section: one tile per screen that lives inside it. */
export function HubPage({ title, description, parts }: { title: string; description: string; parts: HubPart[] }) {
  return (
    <Protected>
      <PageHeader badge={title} title={title} description={description} />
      <div className="grid gap-3 sm:grid-cols-3">
        {parts.map((part) => (
          <Link
            key={part.href}
            href={part.href}
            className="flex min-h-[96px] flex-col gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-[var(--text)] no-underline transition-colors hover:border-[var(--accent)]"
          >
            <span className="text-base font-semibold">{part.title}</span>
            <span className="text-sm text-[var(--muted)]">{part.text}</span>
          </Link>
        ))}
      </div>
    </Protected>
  );
}
