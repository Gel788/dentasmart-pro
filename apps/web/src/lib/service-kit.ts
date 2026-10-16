export type NormLine = { name?: string | null; quantity?: number | null };

export function kitOf(title: string) {
  const text = title.toLowerCase();
  if (text.includes('канал')) return 'файлы · гипохлорит · коффердам';
  if (text.includes('корон')) return 'цирконий · силикон · цемент';
  if (text.includes('имплант')) return 'имплант · шов · артикаин';
  if (text.includes('удал')) return 'артикаин ×2 · марля';
  if (text.includes('гигиен') || text.includes('отбел')) return 'air flow · фторлак';
  if (text.includes('кариес') || text.includes('пломб')) return 'композит A2 · бонд · матрица';
  return 'перчатки · маска';
}

export function serviceKit(name: string, norms?: NormLine[] | null) {
  const lines = (norms ?? []).filter((row) => row && (row.name || row.quantity != null));
  if (lines.length) return lines.map((row) => `${row.name ?? 'материал'} ×${row.quantity ?? 1}`).join(' · ');
  return kitOf(name);
}

export function surfacesFor(name: string, code?: string | null) {
  const text = `${code ?? ''} ${name}`.toLowerCase();
  if (/корон|crown|имплант|implant|удал|extract/.test(text)) return ['TOOTH'];
  return ['O'];
}

export function resultFor(name: string, code?: string | null) {
  const text = `${code ?? ''} ${name}`.toLowerCase();
  if (/корон|crown/.test(text)) return 'CROWN';
  if (/имплант|implant/.test(text)) return 'IMPLANT';
  if (/удал|extract/.test(text)) return 'MISSING';
  if (/канал|endo/.test(text)) return 'ROOT_CANAL';
  return 'FILLED';
}
