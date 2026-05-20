import clsx from 'clsx';

export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={clsx(
            'rounded-lg px-4 py-2 text-sm font-medium transition',
            value === tab.id
              ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm'
              : 'text-[var(--muted)] hover:text-[var(--text-secondary)]',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
