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

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = { ...(options.headers ?? {}) };

  if (!(options.body instanceof FormData)) {
    (headers as Record<string, string>)['Content-Type'] = 'application/json';
  }

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? 'Ошибка API');
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
