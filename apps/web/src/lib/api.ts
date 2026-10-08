const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const API_ORIGIN = API_URL.replace(/\/api\/v1\/?$/, '');

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('dsp_token');
}

export function setToken(token: string) {
  localStorage.setItem('dsp_token', token);
}

export function clearToken() {
  localStorage.removeItem('dsp_token');
}

export function assetUrl(path: string) {
  if (path.startsWith('http')) return path;
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
    const data = (await res.json()) as { accessToken?: string; refreshToken?: string };
    if (!data.accessToken) return false;
    setToken(data.accessToken);
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
    return new Promise(() => {});
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    const message = Array.isArray(err.message) ? err.message.join(', ') : err.message;
    throw new Error(message ?? 'Ошибка API');
  }

  return res.json();
}

export async function uploadFile(file: File): Promise<string> {
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
