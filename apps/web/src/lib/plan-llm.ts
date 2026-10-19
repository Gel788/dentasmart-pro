import { getToken } from './api';
import type { DraftFamily } from './plan-engine';

export async function refineFamily(family: DraftFamily, note: string): Promise<DraftFamily | null> {
  try {
    const token = getToken();
    const response = await fetch('/api/plan/refine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ family, note }),
    });
    if (!response.ok) return null;
    const data = await response.json() as { family?: DraftFamily | null };
    if (!data.family?.plans?.length) return null;
    return data.family;
  } catch {
    return null;
  }
}
