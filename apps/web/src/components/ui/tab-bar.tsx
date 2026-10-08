'use client';

import { useLayoutEffect, useRef } from 'react';

export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const seen = useRef(false);

  useLayoutEffect(() => {
    const bar = barRef.current;
    const pill = pillRef.current;
    if (!bar || !pill) return;
    const tab = bar.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    if (!tab) return;
    const place = (animate: boolean) => {
      if (!animate) pill.style.transition = 'none';
      pill.style.transform = `translateX(${tab.offsetLeft}px)`;
      pill.style.width = `${tab.offsetWidth}px`;
      if (!animate) {
        pill.getBoundingClientRect();
        pill.style.transition = '';
      }
    };
    place(seen.current);
    seen.current = true;
    const onResize = () => place(false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [value, tabs]);

  return (
    <div ref={barRef} className="t-tabs" role="tablist">
      <span ref={pillRef} className="t-tabs-pill" aria-hidden />
      {tabs.map((tab) => {
        const selected = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            className="t-tab"
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
