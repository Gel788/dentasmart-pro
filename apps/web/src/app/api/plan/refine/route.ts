import { NextResponse } from 'next/server';

type Line = { title?: string; price?: number; toothNum?: number | null };
type Phase = { title?: string; items?: Line[] };
type Plan = { tier?: string; phases?: Phase[]; total?: number };
type Family = { title?: string; plans?: Plan[] };

export async function POST(request: Request) {
  const key = process.env.PLAN_LLM_API_KEY || process.env.OPENAI_API_KEY;
  const base = (process.env.PLAN_LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.PLAN_LLM_MODEL || 'gpt-4o-mini';
  if (!key) return NextResponse.json({ family: null, reason: 'no-key' });
  let body: { family?: Family; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ family: null, reason: 'bad-json' });
  }
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
