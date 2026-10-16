export type JawKind = 'implant' | 'crown' | 'filling' | 'other';

export type JawStage = {
  id: string;
  title: string;
  phase: string;
  tooth: number | null;
  price: number;
  kind: JawKind;
};

export function stageKind(title: string): JawKind {
  const text = title.toLowerCase();
  if (text.includes('имплант')) return 'implant';
  if (text.includes('корон')) return 'crown';
  if (text.includes('кариес') || text.includes('пломб') || text.includes('формирователь') || text.includes('реставр')) return 'filling';
  return 'other';
}
