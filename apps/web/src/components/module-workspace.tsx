'use client';

import { useEffect, useState } from 'react';
import { Protected } from '@/components/protected';
import { api } from '@/lib/api';

interface ModuleWorkspaceProps {
  title: string;
  description: string;
  apiPath?: string;
  features?: string[];
}

export function ModuleWorkspace({ title, description, apiPath, features = [] }: ModuleWorkspaceProps) {
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!apiPath);

  useEffect(() => {
    if (!apiPath) return;
    setLoading(true);
    api<unknown>(apiPath)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'))
      .finally(() => setLoading(false));
  }, [apiPath]);

  return (
    <Protected>
      <header>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-[var(--muted)]">{description}</p>
      </header>

      {features.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {features.map((f) => (
            <span
              key={f}
              className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs text-[var(--muted)]"
            >
              {f}
            </span>
          ))}
        </div>
      )}

      <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-sm font-semibold text-[var(--accent)]">Данные API</h2>
        {loading && <p className="mt-3 text-sm text-[var(--muted)]">Загрузка…</p>}
        {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
        {!loading && !error && data !== null && (
          <pre className="mt-3 max-h-96 overflow-auto text-xs text-[var(--muted)]">
            {JSON.stringify(data, null, 2)}
          </pre>
        )}
        {!apiPath && (
          <p className="mt-3 text-sm text-[var(--muted)]">Модуль подключён — UI расширяется по мере наполнения данными.</p>
        )}
      </section>
    </Protected>
  );
}
