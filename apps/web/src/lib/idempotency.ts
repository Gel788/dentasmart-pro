import { useCallback, useRef } from 'react';

function freshKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * One key per money operation the user is about to make. It stays the same across double clicks and
 * retries of that operation, so the server answers them once; call `done()` after the server confirmed it.
 */
export function useIdempotencyKey() {
  const key = useRef(freshKey());
  const headers = useCallback(() => ({ 'Idempotency-Key': key.current }), []);
  const done = useCallback(() => { key.current = freshKey(); }, []);
  return { headers, done };
}
