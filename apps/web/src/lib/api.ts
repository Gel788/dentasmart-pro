import { isDemo } from './demo/mode';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
const API_ORIGIN = API_URL.replace(/\/api\/v1\/?$/, '');

/** A server refusal: the message is safe to show, `body` carries extra fields such as `requires2fa`. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly body: Record<string, unknown>) {
    super(message);
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('dsp_token');
}

export function setToken(token: string) {
  localStorage.setItem('dsp_token', token);
}

export function clearToken() {
  localStorage.removeItem('dsp_token');
  localStorage.removeItem('dsp_asset');
}

/** Read-only key the API checks on clinic files, since <img src> cannot send the bearer token. */
export function setAssetToken(token?: string) {
  if (token) localStorage.setItem('dsp_asset', token);
}

function assetExpired(token: string | null) {
  const expires = Number(token?.split('.')[1]);
  return !(expires > Date.now() + 60 * 60 * 1000);
}

/** Sessions that predate file keys, or whose key is close to expiry, fetch a fresh one. */
export async function ensureAssetToken() {
  if (isDemo() || !assetExpired(localStorage.getItem('dsp_asset'))) return;
  const data = await api<{ assetToken: string }>('/uploads/token').catch(() => null);
  setAssetToken(data?.assetToken);
}

export function assetUrl(path: string) {
  if (!path || path.startsWith('http') || path.startsWith('data:')) return path;
  if (isDemo()) {
    if (path.startsWith('/uploads/imaging/')) return `/demo/${path.slice('/uploads/imaging/'.length)}`;
    return path;
  }
  if (path.startsWith('/uploads/')) {
    const key = typeof window === 'undefined' ? null : localStorage.getItem('dsp_asset');
    return `${API_URL}${path}${key ? `?k=${encodeURIComponent(key)}` : ''}`;
  }
  return `${API_ORIGIN}${path}`;
}

let refreshInFlight: Promise<boolean> | null = null;

function refreshAccess(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refreshToken = localStorage.getItem('dsp_refresh');
    if (!refreshToken) return false;
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { accessToken?: string; refreshToken?: string; assetToken?: string };
    if (!data.accessToken) return false;
    setToken(data.accessToken);
    setAssetToken(data.assetToken);
    if (data.refreshToken) localStorage.setItem('dsp_refresh', data.refreshToken);
    return true;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

function endSession() {
  clearToken();
  localStorage.removeItem('dsp_refresh');
}

export async function api<T>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
  if (isDemo()) {
    const { demoRequest } = await import('./demo/handle');
    const token = getToken();
    const headers = new Headers(options.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return demoRequest<T>(path, { ...options, headers });
  }

  const token = getToken();
  const headers: HeadersInit = { ...(options.headers ?? {}) };

  if (!(options.body instanceof FormData)) {
    (headers as Record<string, string>)['Content-Type'] = 'application/json';
  }

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  const canRefresh = path !== '/auth/login' && path !== '/auth/refresh';
  if (res.status === 401 && canRefresh && !retried && typeof window !== 'undefined') {
    const renewed = await refreshAccess();
    if (renewed) return api<T>(path, options, true);
    endSession();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    throw new Error('Сессия истекла');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    const message = Array.isArray(err.message) ? err.message.join(', ') : err.message;
    throw new ApiError(message ?? 'Сервер не ответил. Попробуйте ещё раз', res.status, err);
  }

  // A route that answers null (no open shift, nothing found) sends an empty body: that is «no data».
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export async function uploadFile(file: File): Promise<string> {
  if (isDemo()) {
    const { demoFileUrl } = await import('./demo/handle');
    return demoFileUrl(file);
  }
  const fd = new FormData();
  fd.append('file', file);
  const token = getToken();
  const res = await fetch(`${API_URL}/uploads/imaging`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) throw new Error('Ошибка загрузки');
  const data = (await res.json()) as { url: string };
  return data.url;
}
