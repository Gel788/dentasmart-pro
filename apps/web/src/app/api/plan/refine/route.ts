import { NextResponse } from 'next/server';
import { isDemo } from '@/lib/demo/mode';

type Line = { title?: string; price?: number; toothNum?: number | null };
type Phase = { title?: string; items?: Line[] };
type Plan = { tier?: string; phases?: Phase[]; total?: number };
type Family = { title?: string; plans?: Plan[] };

const MAX_BODY = 64 * 1024;
const WINDOW_MS = 60_000;
const PER_WINDOW = 10;
const hits = new Map<string, number[]>();

/** Best effort: each serverless instance counts on its own, which still stops a single caller hammering one instance. */
function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((at) => now - at < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > PER_WINDOW;
}

function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const allowed = (process.env.PLAN_LLM_ALLOWED_ORIGINS ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  try {
    return new URL(origin).host === request.headers.get('host') || allowed.includes(origin);
  } catch {
    return false;
  }
}

/** With a live API the caller must hold a valid session; the public demo has no accounts to check. */
async function signedIn(request: Request) {
  if (isDemo()) return true;
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return false;
  const api = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
  const response = await fetch(`${api}/auth/me`, { headers: { Authorization: auth }, signal: AbortSignal.timeout(5000) }).catch(() => null);
  return Boolean(response?.ok);
}

export async function POST(request: Request) {
  const key = process.env.PLAN_LLM_API_KEY || process.env.OPENAI_API_KEY;
  const base = (process.env.PLAN_LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.PLAN_LLM_MODEL || 'gpt-4o-mini';
  if (!key) return NextResponse.json({ family: null, reason: 'no-key' });
  if (!sameOrigin(request)) return NextResponse.json({ family: null, reason: 'forbidden' }, { status: 403 });
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (limited(ip)) return NextResponse.json({ family: null, reason: 'rate-limited' }, { status: 429 });
  if (!(await signedIn(request))) return NextResponse.json({ family: null, reason: 'unauthorized' }, { status: 401 });
  let body: { family?: Family; note?: string };
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return NextResponse.json({ family: null, reason: 'too-large' }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ family: null, reason: 'bad-json' });
  }
  if (typeof body.note === 'string') body.note = body.note.slice(0, 2000);
  if (!body.family?.plans?.length) return NextResponse.json({ family: null, reason: 'empty' });
  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Ты клинический редактор стоматологического плана. Верни JSON {"family": ...} той же формы. Не меняй цены, коды услуг и зубы. Можно уточнить формулировки этапов. Если план уже хороший, верни его без изменений.',
          },
          { role: 'user', content: JSON.stringify({ note: body.note ?? '', family: body.family }) },
        ],
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return NextResponse.json({ family: null, reason: 'upstream' });
    const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
    const text = payload.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(text) as { family?: Family };
    if (!sameMoney(body.family, parsed.family)) return NextResponse.json({ family: null, reason: 'rejected' });
    return NextResponse.json({ family: parsed.family });
  } catch {
    return NextResponse.json({ family: null, reason: 'failed' });
  }
}

function sameMoney(left?: Family, right?: Family) {
  if (!left?.plans || !right?.plans || left.plans.length !== right.plans.length) return false;
  return left.plans.every((plan, index) => sum(plan) === sum(right.plans?.[index]) && plan.tier === right.plans?.[index]?.tier);
}

function sum(plan?: Plan) {
  return (plan?.phases ?? []).reduce((total, phase) => total + (phase.items ?? []).reduce((inner, item) => inner + Math.round(Number(item.price) || 0), 0), 0);
}
