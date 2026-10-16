export type XrayKind = 'CARIES' | 'PERIAPICAL' | 'MISSING' | 'RESTORATION';

export type XrayFinding = {
  id: string;
  kind: XrayKind;
  toothNum: number;
  label: string;
  confidence: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type XrayInput = { fileUrl: string; fileName?: string };

/** Vendor-shaped reader. Demo today, Diagnocat when a clinic key exists. */
export interface XrayReader {
  readonly id: 'demo' | 'diagnocat';
  read(input: XrayInput): Promise<XrayFinding[]>;
}

const OPG: XrayFinding[] = [
  { id: 'opg-16', kind: 'CARIES', toothNum: 16, label: 'Кариес', confidence: 0.92, x: 0.168, y: 0.28, w: 0.055, h: 0.2 },
  { id: 'opg-26', kind: 'PERIAPICAL', toothNum: 26, label: 'Периапикальный очаг', confidence: 0.81, x: 0.39, y: 0.27, w: 0.055, h: 0.24 },
  { id: 'opg-36', kind: 'MISSING', toothNum: 36, label: 'Нет зуба', confidence: 0.97, x: 0.5, y: 0.52, w: 0.06, h: 0.2 },
  { id: 'opg-46', kind: 'RESTORATION', toothNum: 46, label: 'Старая реставрация', confidence: 0.88, x: 0.72, y: 0.52, w: 0.055, h: 0.2 },
];

const BITE: XrayFinding[] = [
  { id: 'bite-16', kind: 'CARIES', toothNum: 16, label: 'Кариес', confidence: 0.94, x: 0.42, y: 0.25, w: 0.16, h: 0.16 },
];

export const demoReader: XrayReader = {
  id: 'demo',
  async read(input) {
    return findingsFor(input.fileUrl, input.fileName);
  },
};

/**
 * Diagnocat adapter. Same boxes, different transport.
 * Select it with `selectReader('diagnocat')` after the clinic stores a key.
 * It is not called in the public demo.
 */
export const diagnocatReader: XrayReader = {
  id: 'diagnocat',
  async read() {
    throw new Error('Diagnocat не подключён');
  },
};

let selected: XrayReader = demoReader;

export function selectReader(id: XrayReader['id']) {
  selected = id === 'diagnocat' ? diagnocatReader : demoReader;
}

export function activeReader() {
  return selected;
}

export function findingsFor(fileUrl: string, fileName = ''): XrayFinding[] {
  const key = `${fileUrl} ${fileName}`.toLowerCase();
  if (key.includes('tooth-16') || key.includes('bite') || key.includes('прицел')) return BITE;
  if (key.includes('opg') || key.includes('панорам') || key.startsWith('data:')) return OPG;
  return OPG.map((row) => ({ ...row, id: `${row.id}-upload` }));
}

export function chartOf(kind: XrayKind) {
  if (kind === 'CARIES') return { condition: 'CARIES', surface: 'O', title: 'Лечение кариеса', price: 5500 };
  if (kind === 'PERIAPICAL') return { condition: 'ROOT_CANAL', surface: 'TOOTH', title: 'Лечение каналов', price: 12000 };
  if (kind === 'MISSING') return { condition: 'MISSING', surface: 'TOOTH', title: 'Установка импланта', price: 45000 };
  return { condition: 'FILLED', surface: 'O', title: 'Замена реставрации', price: 5500 };
}
