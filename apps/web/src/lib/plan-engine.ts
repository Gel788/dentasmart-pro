export type FindingCode =
  | 'caries'
  | 'pulpitis'
  | 'periodontitis'
  | 'missing'
  | 'root'
  | 'crown'
  | 'wisdom'
  | 'hygiene';

export type TierCode = 'ECONOM' | 'OPTIMUM' | 'PREMIUM';

export type Mark = {
  tooth: number | null;
  code: FindingCode;
  canals?: number;
};

export type CatalogPrice = {
  name: string;
  code?: string | null;
  price?: number | null;
  durationMin?: number | null;
};

export type DraftLine = {
  title: string;
  toothNum: number | null;
  qty: number;
  unitPrice: number;
  discountPercent: number;
  price: number;
  kit: string;
  durationMin: number;
  code: string;
};

export type DraftPhase = {
  title: string;
  specialty: string;
  healingDays: number;
  dependsOnTitle: string | null;
  waitDays: number;
  items: DraftLine[];
};

export type DraftPlan = {
  tier: TierCode;
  tierLabel: string;
  total: number;
  guaranteeMonths: number;
  durationWeeks: number;
  installmentMonths: number;
  phases: DraftPhase[];
};

export type DraftFamily = {
  title: string;
  plans: DraftPlan[];
};

export const FINDINGS: { code: FindingCode; label: string }[] = [
  { code: 'caries', label: 'Кариес' },
  { code: 'pulpitis', label: 'Пульпит' },
  { code: 'periodontitis', label: 'Периодонтит' },
  { code: 'missing', label: 'Нет зуба' },
  { code: 'root', label: 'Корень' },
  { code: 'crown', label: 'Нужна коронка' },
  { code: 'wisdom', label: 'Удаление 8-ки' },
  { code: 'hygiene', label: 'Гигиена' },
];

export const PLAN_TEMPLATES: { name: string; note: string; marks: Mark[] }[] = [
  { name: 'Лечение кариеса', note: 'Анестезия и пломба', marks: [{ tooth: null, code: 'caries' }] },
  { name: 'Эндо одноканальный', note: 'Резцы и клыки', marks: [{ tooth: null, code: 'pulpitis', canals: 1 }] },
  { name: 'Эндо трёхканальный', note: 'Моляры', marks: [{ tooth: null, code: 'pulpitis', canals: 3 }] },
  { name: 'Периодонтит', note: 'Каналы и восстановление', marks: [{ tooth: null, code: 'periodontitis' }] },
  { name: 'Имплантация с коронкой', note: 'КТ, имплант, коронка', marks: [{ tooth: null, code: 'missing' }] },
  { name: 'Профгигиена', note: 'Один визит', marks: [{ tooth: null, code: 'hygiene' }] },
  { name: 'Удаление 8-ки', note: 'Анестезия и удаление', marks: [{ tooth: 48, code: 'wisdom' }] },
  { name: 'Удаление корня', note: 'Хирургия', marks: [{ tooth: null, code: 'root' }] },
  { name: 'Коронка на свой зуб', note: 'Без импланта', marks: [{ tooth: null, code: 'crown' }] },
  { name: 'Санация двух зубов', note: 'Два кариеса', marks: [{ tooth: 16, code: 'caries' }, { tooth: 26, code: 'caries' }] },
  { name: 'Отбеливание', note: 'Гигиена и отбеливание', marks: [{ tooth: null, code: 'hygiene' }] },
  { name: 'Все на 4: нет зуба и кариес', note: 'Смежный приём', marks: [{ tooth: 36, code: 'missing' }, { tooth: 16, code: 'caries' }] },
];

type StageId = 'hygiene' | 'therapy' | 'surgery' | 'implant' | 'ortho';

const STAGES: { id: StageId; title: string; specialty: string; healingDays: number }[] = [
  { id: 'hygiene', title: 'Гигиена', specialty: 'Гигиена', healingDays: 0 },
  { id: 'therapy', title: 'Санация', specialty: 'Терапия', healingDays: 0 },
  { id: 'surgery', title: 'Хирургия', specialty: 'Хирургия', healingDays: 14 },
  { id: 'implant', title: 'Имплантация', specialty: 'Хирургия', healingDays: 90 },
  { id: 'ortho', title: 'Ортопедия', specialty: 'Ортопедия', healingDays: 0 },
];

type Offer = {
  code: string;
  name: string;
  price: number;
  minutes: number;
  kit: string;
  match: RegExp;
};

const OFFERS: Offer[] = [
  { code: 'ANES', name: 'Анестезия', price: 900, minutes: 10, kit: 'артикахин ×1 · карпула', match: /анестез/ },
  { code: 'DAM', name: 'Коффердам', price: 800, minutes: 10, kit: 'коффердам ×1 · кламп', match: /коффердам|раббердам/ },
  { code: 'CARIES', name: 'Лечение кариеса', price: 5500, minutes: 40, kit: 'композит A2 ×1 · бонд · матрица', match: /кариес|пломб/ },
  { code: 'ART', name: 'Художественная реставрация', price: 9000, minutes: 60, kit: 'композит A2 ×2 · бонд · матрица', match: /художественн|реставрац/ },
  { code: 'ENDO', name: 'Лечение каналов', price: 12000, minutes: 70, kit: 'файлы ×1 · гипохлорит · коффердам', match: /канал/ },
  { code: 'BUILD', name: 'Восстановление зуба', price: 4500, minutes: 30, kit: 'композит A2 ×1 · бонд', match: /восстановлен/ },
  { code: 'MED', name: 'Медикаментозная обработка', price: 1500, minutes: 15, kit: 'гипохлорит · гидроксид кальция', match: /медикамент/ },
  { code: 'XRAY', name: 'Прицельный снимок', price: 800, minutes: 10, kit: 'датчик ×1', match: /прицельн|рентген/ },
  { code: 'CT', name: 'КТ челюсти', price: 3500, minutes: 15, kit: 'протокол КТ', match: /(^|[^a-zа-я])кт([^a-zа-я]|$)|конусно/ },
  { code: 'HYGIENE', name: 'Профессиональная гигиена', price: 6500, minutes: 60, kit: 'порошок Air Flow ×1 · фторлак', match: /гигиен/ },
  { code: 'WHITE', name: 'Отбеливание', price: 18000, minutes: 70, kit: 'гель ×1 · ретрактор', match: /отбел/ },
  { code: 'EXTRACT', name: 'Удаление зуба', price: 4500, minutes: 30, kit: 'артикахин ×2 · марля', match: /^удаление зуба$/ },
  { code: 'WISDOM', name: 'Удаление зуба мудрости', price: 8500, minutes: 40, kit: 'артикахин ×2 · шов · марля', match: /мудр|восьм|ретинир/ },
  { code: 'ROOTX', name: 'Удаление корня', price: 6000, minutes: 30, kit: 'артикахин ×2 · марля', match: /удаление корн/ },
  { code: 'IMPLANT', name: 'Установка импланта', price: 45000, minutes: 60, kit: 'имплант ×1 · шов · артикахин', match: /имплант/ },
  { code: 'BONE', name: 'Костная пластика', price: 22000, minutes: 40, kit: 'костный материал ×1 · мембрана', match: /костн|пластик/ },
  { code: 'CROWN', name: 'Коронка керамическая', price: 28000, minutes: 40, kit: 'цирконий ×1 · силикон · цемент', match: /коронка керамическ/ },
  { code: 'METAL', name: 'Коронка металлокерамическая', price: 18000, minutes: 40, kit: 'металлокерамика ×1 · цемент', match: /металлокерам/ },
  { code: 'ZIRCON', name: 'Коронка циркониевая', price: 35000, minutes: 40, kit: 'цирконий ×1 · силикон · цемент', match: /циркониев/ },
  { code: 'TEMP', name: 'Временная коронка', price: 7000, minutes: 20, kit: 'пластмасса ×1 · цемент', match: /временн/ },
  { code: 'BRIDGE', name: 'Адгезивный мост', price: 14000, minutes: 50, kit: 'композит · стекловолокно', match: /адгезивн|мост/ },
  { code: 'SEDATION', name: 'Седация', price: 4500, minutes: 20, kit: 'препарат ×1', match: /седац/ },
];

type Step = { stage: StageId; code: string; tiers: TierCode[]; qty?: number; once?: boolean };

const ALL: TierCode[] = ['ECONOM', 'OPTIMUM', 'PREMIUM'];
const UP: TierCode[] = ['OPTIMUM', 'PREMIUM'];

function stepsFor(mark: Mark): Step[] {
  const canals = mark.canals ?? canalsOf(mark.tooth);
  if (mark.code === 'caries') {
    return [
      { stage: 'therapy', code: 'ANES', tiers: ALL },
      { stage: 'therapy', code: 'DAM', tiers: UP },
      { stage: 'therapy', code: 'CARIES', tiers: ['ECONOM', 'OPTIMUM'] },
      { stage: 'therapy', code: 'ART', tiers: ['PREMIUM'] },
    ];
  }
  if (mark.code === 'pulpitis' || mark.code === 'periodontitis') {
    const extra: Step[] = mark.code === 'periodontitis'
      ? [{ stage: 'therapy', code: 'MED', tiers: ALL }]
      : [];
    return [
      { stage: 'therapy', code: 'ANES', tiers: ALL },
      { stage: 'therapy', code: 'DAM', tiers: UP },
      { stage: 'therapy', code: 'XRAY', tiers: UP },
      { stage: 'therapy', code: 'ENDO', tiers: ALL, qty: canals },
      ...extra,
      { stage: 'therapy', code: 'BUILD', tiers: ALL },
      { stage: 'ortho', code: 'CROWN', tiers: ['PREMIUM'] },
    ];
  }
  if (mark.code === 'missing') {
    return [
      { stage: 'ortho', code: 'BRIDGE', tiers: ['ECONOM'] },
      { stage: 'implant', code: 'CT', tiers: UP, once: true },
      { stage: 'implant', code: 'BONE', tiers: ['PREMIUM'] },
      { stage: 'implant', code: 'IMPLANT', tiers: UP },
      { stage: 'ortho', code: 'TEMP', tiers: ['PREMIUM'] },
      { stage: 'ortho', code: 'CROWN', tiers: ['OPTIMUM'] },
      { stage: 'ortho', code: 'ZIRCON', tiers: ['PREMIUM'] },
    ];
  }
  if (mark.code === 'root') {
    return [
      { stage: 'surgery', code: 'ANES', tiers: ALL },
      { stage: 'surgery', code: 'ROOTX', tiers: ALL },
      { stage: 'implant', code: 'CT', tiers: UP, once: true },
      { stage: 'implant', code: 'IMPLANT', tiers: UP },
      { stage: 'ortho', code: 'CROWN', tiers: ['OPTIMUM'] },
      { stage: 'ortho', code: 'ZIRCON', tiers: ['PREMIUM'] },
    ];
  }
  if (mark.code === 'crown') {
    return [
      { stage: 'ortho', code: 'ANES', tiers: ALL },
      { stage: 'ortho', code: 'METAL', tiers: ['ECONOM'] },
      { stage: 'ortho', code: 'CROWN', tiers: ['OPTIMUM'] },
      { stage: 'ortho', code: 'TEMP', tiers: ['PREMIUM'] },
      { stage: 'ortho', code: 'ZIRCON', tiers: ['PREMIUM'] },
    ];
  }
  if (mark.code === 'wisdom') {
    return [
      { stage: 'surgery', code: 'ANES', tiers: ALL },
      { stage: 'surgery', code: 'CT', tiers: UP, once: true },
      { stage: 'surgery', code: 'WISDOM', tiers: ALL },
      { stage: 'surgery', code: 'SEDATION', tiers: ['PREMIUM'] },
    ];
  }
  return [
    { stage: 'hygiene', code: 'HYGIENE', tiers: ALL, once: true },
    { stage: 'hygiene', code: 'WHITE', tiers: ['PREMIUM'], once: true },
  ];
}

function canalsOf(tooth: number | null) {
  if (!tooth) return 1;
  const pos = tooth % 10;
  if (pos >= 6) return 3;
  if (pos >= 4) return 2;
  return 1;
}

type Priced = Offer & { fromList: boolean };

function book(services: CatalogPrice[]): Map<string, Priced> {
  const map = new Map<string, Priced>();
  for (const offer of OFFERS) {
    const hit = services.find((row) => {
      const name = row.name.toLowerCase();
      return (row.code && row.code === offer.code) || offer.match.test(name);
    });
    const price = hit && Number(hit.price) > 0 ? Math.round(Number(hit.price)) : offer.price;
    map.set(offer.code, {
      ...offer,
      name: hit?.name && offer.match.test(hit.name.toLowerCase()) ? hit.name : offer.name,
      price: offer.code === 'ENDO' ? Math.max(1, Math.round(price / 3)) : price,
      minutes: Number(hit?.durationMin) > 0 ? Number(hit?.durationMin) : offer.minutes,
      fromList: Boolean(hit),
    });
  }
  return map;
}

function lineOf(priced: Priced, tooth: number | null, qty: number): DraftLine {
  const count = qty > 0 ? qty : 1;
  const unitPrice = priced.price;
  return {
    title: priced.name,
    toothNum: tooth,
    qty: count,
    unitPrice,
    discountPercent: 0,
    price: unitPrice * count,
    kit: priced.kit,
    durationMin: priced.minutes,
    code: priced.code,
  };
}

export function lineTotal(unitPrice: number, qty: number, discountPercent: number) {
  const unit = Math.max(0, Math.round(Number(unitPrice) || 0));
  const count = Math.max(1, Math.round(Number(qty) || 1));
  const discount = Math.min(100, Math.max(0, Math.round(Number(discountPercent) || 0)));
  return { unitPrice: unit, qty: count, discountPercent: discount, price: Math.round(unit * count * (1 - discount / 100)) };
}

export function composeFamily(marks: Mark[], services: CatalogPrice[]): DraftFamily | null {
  const clean = uniqueMarks(marks);
  if (!clean.length) return null;
  const prices = book(services);
  const plans = (['ECONOM', 'OPTIMUM', 'PREMIUM'] as TierCode[]).map((tier) => buildPlan(tier, clean, prices));
  const restoring = clean.some((mark) => mark.code === 'missing' || mark.code === 'root');
  return { title: restoring ? 'Восстановление' : 'План лечения', plans };
}

function buildPlan(tier: TierCode, marks: Mark[], prices: Map<string, Priced>): DraftPlan {
  const buckets = new Map<StageId, DraftLine[]>();
  const seenOnce = new Set<string>();
  const push = (stage: StageId, row: DraftLine, once?: boolean) => {
    const key = `${row.code}:${once ? '*' : row.toothNum ?? 'm'}`;
    if (once && seenOnce.has(row.code)) return;
    if (once) seenOnce.add(row.code);
    if (seenOnce.has(key) && once) return;
    const list = buckets.get(stage) ?? [];
    list.push(row);
    buckets.set(stage, list);
  };
  for (const mark of marks) {
    for (const step of stepsFor(mark)) {
      if (!step.tiers.includes(tier)) continue;
      const priced = prices.get(step.code);
      if (!priced) continue;
      push(step.stage, lineOf(priced, step.once ? null : mark.tooth, step.qty ?? 1), step.once);
    }
  }
  if (tier !== 'ECONOM' && !marks.every((mark) => mark.code === 'hygiene')) {
    const hygiene = prices.get('HYGIENE');
    if (hygiene) push('hygiene', lineOf(hygiene, null, 1), true);
  }
  const phases: DraftPhase[] = [];
  for (const stage of STAGES) {
    const items = buckets.get(stage.id);
    if (!items?.length) continue;
    phases.push({
      title: stage.title,
      specialty: stage.specialty,
      healingDays: stage.healingDays,
      dependsOnTitle: null,
      waitDays: 0,
      items,
    });
  }
  const implant = phases.find((phase) => phase.title === 'Имплантация');
  const surgery = phases.find((phase) => phase.title === 'Хирургия');
  const ortho = phases.find((phase) => phase.title === 'Ортопедия');
  if (ortho && (implant || surgery)) {
    ortho.dependsOnTitle = implant ? 'Имплантация' : 'Хирургия';
    ortho.waitDays = implant ? 90 : 14;
  }
  const total = phases.reduce((sum, phase) => sum + phase.items.reduce((inner, item) => inner + item.price, 0), 0);
  const label = tier === 'ECONOM' ? 'Эконом' : tier === 'OPTIMUM' ? 'Оптимум' : 'Премиум';
  return {
    tier,
    tierLabel: label,
    total,
    guaranteeMonths: tier === 'PREMIUM' ? 36 : tier === 'OPTIMUM' ? 24 : 12,
    durationWeeks: implant ? 18 : surgery ? 6 : 3,
    installmentMonths: tier === 'PREMIUM' ? 12 : tier === 'OPTIMUM' ? 6 : 0,
    phases,
  };
}

function uniqueMarks(marks: Mark[]) {
  const out: Mark[] = [];
  for (const mark of marks) {
    if (!FINDINGS.some((item) => item.code === mark.code)) continue;
    const tooth = mark.tooth && validFdi(mark.tooth) ? mark.tooth : null;
    if (mark.code !== 'hygiene' && tooth == null && mark.tooth != null) continue;
    const key = `${mark.code}:${tooth ?? 0}:${mark.canals ?? ''}`;
    if (out.some((item) => `${item.code}:${item.tooth ?? 0}:${item.canals ?? ''}` === key)) continue;
    out.push({ tooth, code: mark.code, canals: mark.canals });
  }
  return out;
}

export function marksFromText(raw: string): Mark[] {
  const text = raw.toLowerCase().replace(/ё/g, 'е');
  const marks: Mark[] = [];
  if (/гигиен|профчист|air flow|эйр флоу/.test(text)) marks.push({ tooth: null, code: 'hygiene' });
  const clauses = text.split(/[,;\n.]+/).map((part) => part.trim()).filter(Boolean);
  for (const clause of clauses) {
    const tooth = toothIn(clause);
    const code = codeIn(clause, tooth);
    if (!code) continue;
    const canals = /одноканал|1 канал|один канал/.test(clause) ? 1 : /трёхканал|трехканал|3 канал/.test(clause) ? 3 : undefined;
    marks.push({ tooth: code === 'hygiene' ? null : tooth, code, canals });
  }
  return uniqueMarks(marks);
}

function codeIn(clause: string, tooth: number | null): FindingCode | null {
  if (/периодонтит|периапик/.test(clause)) return 'periodontitis';
  if (/пульпит|канал/.test(clause)) return 'pulpitis';
  if (/корень|остаток корня/.test(clause)) return 'root';
  if (/восьм|мудр|ретинир|8-к/.test(clause) || (tooth != null && tooth % 10 === 8 && /удал/.test(clause))) return 'wisdom';
  if (/удал/.test(clause)) return tooth != null && tooth % 10 === 8 ? 'wisdom' : 'root';
  if (/отсутств|нет зуба|удален|удалён/.test(clause)) return 'missing';
  if (/корон/.test(clause)) return 'crown';
  if (/кариес|пломб/.test(clause)) return 'caries';
  if (/гигиен/.test(clause)) return 'hygiene';
  return null;
}

function toothIn(clause: string) {
  const digits = clause.match(/\b([1-4][1-8])\b/);
  if (digits && validFdi(Number(digits[1]))) return Number(digits[1]);
  return null;
}

function validFdi(tooth: number) {
  const quadrant = Math.floor(tooth / 10);
  const pos = tooth % 10;
  return quadrant >= 1 && quadrant <= 4 && pos >= 1 && pos <= 8;
}

export function marksFromChart(surfaces: { toothNum: number; condition: string }[]): Mark[] {
  const marks: Mark[] = [];
  for (const row of surfaces) {
    if (!validFdi(row.toothNum)) continue;
    if (row.condition === 'CARIES') marks.push({ tooth: row.toothNum, code: 'caries' });
    else if (row.condition === 'MISSING') marks.push({ tooth: row.toothNum, code: 'missing' });
    else if (row.condition === 'CROWN') marks.push({ tooth: row.toothNum, code: 'crown' });
    else if (row.condition === 'ROOT_CANAL') marks.push({ tooth: row.toothNum, code: 'pulpitis' });
    else if (row.condition === 'TO_EXTRACT') marks.push({ tooth: row.toothNum, code: row.toothNum % 10 === 8 ? 'wisdom' : 'root' });
    else if (row.condition === 'IMPLANT') marks.push({ tooth: row.toothNum, code: 'missing' });
  }
  return uniqueMarks(marks);
}

export function paymentSchedule(total: number, months: number) {
  const amount = Math.max(0, Math.round(total));
  const count = months >= 2 ? Math.min(24, Math.round(months)) : 1;
  if (count === 1) return [{ index: 1, amount }];
  const each = Math.floor(amount / count);
  return Array.from({ length: count }, (_, index) => ({
    index: index + 1,
    amount: index === count - 1 ? amount - each * (count - 1) : each,
  }));
}

export function chartCondition(code: FindingCode) {
  if (code === 'caries') return 'CARIES';
  if (code === 'missing') return 'MISSING';
  if (code === 'crown') return 'CROWN';
  if (code === 'pulpitis' || code === 'periodontitis') return 'ROOT_CANAL';
  if (code === 'wisdom' || code === 'root') return 'TO_EXTRACT';
  return 'CARIES';
}
