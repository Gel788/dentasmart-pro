export type VoiceFinding = {
  tooth: number;
  surface: string;
  condition: string;
  label: string;
};

export type VoiceNote = {
  complaints?: string;
  diagnosis?: string;
  treatment?: string;
  recommendations?: string;
  objective?: string;
};

export const VOICE_SCRIPT = 'Жалобы реакция на сладкое. Зуб шестнадцать кариес жевательная. Зуб двадцать шесть старая пломба. Зуб тридцать шесть отсутствует. Диагноз кариес дентина. Лечение пломба композитом. Рекомендации не есть два часа.';

const WORD: Record<string, number> = {
  одиннадцать: 11,
  двенадцать: 12,
  тринадцать: 13,
  четырнадцать: 14,
  пятнадцать: 15,
  шестнадцать: 16,
  семнадцать: 17,
  восемнадцать: 18,
  двадцать: 20,
  тридцать: 30,
  сорок: 40,
  один: 1,
  два: 2,
  две: 2,
  три: 3,
  четыре: 4,
  пять: 5,
  шесть: 6,
  семь: 7,
  восемь: 8,
};

export function parseVoice(raw: string): { findings: VoiceFinding[]; note: VoiceNote; activeTooth: number | null } {
  const text = raw.toLowerCase().replace(/ё/g, 'е');
  const clauses = text.split(/[.!?\n]+/).map((part) => part.trim()).filter(Boolean);
  const findings: VoiceFinding[] = [];
  const note: VoiceNote = {};
  let activeTooth: number | null = null;

  for (const clause of clauses) {
    if (clause.startsWith('диагноз')) {
      note.diagnosis = tidy(clause.replace(/^диагноз\s*/, ''));
      continue;
    }
    if (clause.startsWith('лечение') || clause.startsWith('что сделали')) {
      note.treatment = tidy(clause.replace(/^(лечение|что сделали)\s*/, ''));
      continue;
    }
    if (clause.startsWith('рекомендац')) {
      note.recommendations = tidy(clause.replace(/^рекомендации\s*/, ''));
      continue;
    }
    if (clause.startsWith('жалоб')) {
      note.complaints = tidy(clause.replace(/^жалобы\s*/, ''));
      continue;
    }
    const tooth = extractTooth(clause);
    if (!tooth) continue;
    activeTooth = tooth;
    const condition = extractCondition(clause);
    if (!condition) continue;
    const surface = extractSurface(clause) ?? (condition.id === 'MISSING' || condition.id === 'CROWN' || condition.id === 'IMPLANT' ? 'TOOTH' : 'O');
    const row = { tooth, surface, condition: condition.id, label: condition.label };
    const prev = findings.findIndex((item) => item.tooth === tooth && item.surface === surface);
    if (prev >= 0) findings[prev] = row;
    else findings.push(row);
  }

  if (findings.length) {
    note.objective = findings.map((item) => `зуб ${item.tooth}: ${item.label.toLowerCase()}`).join(', ');
  }
  if (!note.diagnosis && findings.some((item) => item.condition === 'CARIES')) note.diagnosis = 'K02.1 кариес дентина';
  return { findings, note, activeTooth };
}

function tidy(value: string) {
  const text = value.trim();
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function extractTooth(clause: string) {
  const digits = clause.match(/\b([1-4][1-8])\b/);
  if (digits) return Number(digits[1]);
  const words = clause.replace(/[^a-zа-я0-9\s-]/gi, ' ').split(/\s+/).filter(Boolean);
  const from = Math.max(0, words.indexOf('зуб'));
  for (let index = from; index < words.length; index += 1) {
    const hit = readNumber(words, index);
    if (hit && validFdi(hit)) return hit;
  }
  return null;
}

function readNumber(words: string[], index: number) {
  const value = WORD[words[index]];
  if (!value) return null;
  if (value >= 20 && value <= 40) {
    const ones = WORD[words[index + 1]];
    if (ones && ones < 10) return value + ones;
  }
  return value;
}

function validFdi(tooth: number) {
  const quadrant = Math.floor(tooth / 10);
  const pos = tooth % 10;
  return quadrant >= 1 && quadrant <= 4 && pos >= 1 && pos <= 8;
}

function extractCondition(clause: string) {
  if (/отсутств|нет зуба|удал[её]н/.test(clause)) return { id: 'MISSING', label: 'Нет зуба' };
  if (/периапик|периодонтит/.test(clause)) return { id: 'ROOT_CANAL', label: 'Периапикальный очаг' };
  if (/пульпит|канал/.test(clause)) return { id: 'ROOT_CANAL', label: 'Каналы' };
  if (/корон/.test(clause)) return { id: 'CROWN', label: 'Коронка' };
  if (/имплант/.test(clause)) return { id: 'IMPLANT', label: 'Имплант' };
  if (/пломб|реставрац/.test(clause)) return { id: 'FILLED', label: 'Пломба' };
  if (/кариес/.test(clause)) return { id: 'CARIES', label: 'Кариес' };
  return null;
}

function extractSurface(clause: string) {
  if (/жевательн|окклюзион/.test(clause)) return 'O';
  if (/медиальн/.test(clause)) return 'M';
  if (/дистальн/.test(clause)) return 'D';
  if (/вестибулярн|щечн/.test(clause)) return 'B';
  if (/язычн|небн|нёбн/.test(clause)) return 'L';
  return null;
}
