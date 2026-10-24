// Work a dental lab makes. Matched on the line title, since the price list has no lab flag.
const LAB_WORK = /коронк|винир|мост|вкладк|протез|капп|элайнер|шаблон|ретейнер|накладк/i;

/** What a stage needs from the lab: the stage's own note, else its lab-made lines, else nothing. */
export function labWorkOf(explicit: string | null | undefined, lineTitles: string[]): string | null {
  if (explicit?.trim()) return explicit.trim();
  const lab = [...new Set(lineTitles.map((title) => title.trim()).filter((title) => LAB_WORK.test(title)))];
  return lab.length ? lab.join(', ') : null;
}
