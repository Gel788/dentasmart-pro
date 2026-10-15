'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type Focus =
  | { type: 'patient'; id: string }
  | { type: 'slot'; startsAt: string; cabinetId?: string; doctorId?: string; label: string }
  | null;

type FocusValue = {
  focus: Focus;
  setFocus: (focus: Focus) => void;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  revision: number;
  bump: () => void;
};

const FocusContext = createContext<FocusValue | null>(null);

export function FocusProvider({ children }: { children: ReactNode }) {
  const [focus, setFocusState] = useState<Focus>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [revision, setRevision] = useState(0);

  const value = useMemo<FocusValue>(
    () => ({
      focus,
      setFocus: (next) => {
        setFocusState(next);
        if (next) setPanelOpen(true);
      },
      panelOpen,
      setPanelOpen,
      revision,
      bump: () => setRevision((n) => n + 1),
    }),
    [focus, panelOpen, revision],
  );

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

export function useFocus() {
  const ctx = useContext(FocusContext);
  if (!ctx) throw new Error('useFocus вне FocusProvider');
  return ctx;
}
