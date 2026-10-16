export type Consumable = {
  name: string;
  qty: number;
  unit: string;
  sell: number;
  cost: number;
};

export type PriceLine = {
  kind: 'work' | 'material';
  name: string;
  qty: number | null;
  unit: string | null;
  unitPrice: number;
  sum: number;
};

export type PriceExplanation = {
  lines: PriceLine[];
  total: number;
  overflow: boolean;
  overflowAmount: number;
  internalCost: number;
  margin: number;
};

export type CatalogNorm = {
  name?: string | null;
  quantity?: number | null;
  unit?: string | null;
  itemId?: string | null;
  sellPrice?: number | string | null;
};

export type CatalogService = {
  name: string;
  norms?: CatalogNorm[] | null;
};

export type CatalogStock = {
  id: string;
  name: string;
  unit?: string | null;
  cost?: number | null;
  sell?: number | null;
};

const SELL: Record<string, number> = {
  'Композит A2': 890,
  Бонд: 240,
  Матрица: 60,
  Файлы: 480,
  Гипохлорит: 70,
  Коффердам: 150,
  Цирконий: 6400,
  Силикон: 420,
  Цемент: 180,
  Имплант: 12000,
  Шов: 80,
  Артикаин: 90,
  Марля: 20,
  'Порошок Air Flow': 350,
  Фторлак: 180,
  Перчатки: 15,
  Маска: 10,
};

const COST: Record<string, number> = {
  'Композит A2': 320,
  Бонд: 90,
  Матрица: 15,
  Файлы: 180,
  Гипохлорит: 20,
  Коффердам: 40,
  Цирконий: 2800,
  Силикон: 160,
  Цемент: 55,
  Имплант: 7500,
  Шов: 25,
  Артикаин: 30,
  Марля: 5,
  'Порошок Air Flow': 110,
  Фторлак: 60,
  Перчатки: 4,
  Маска: 3,
};

function rub(value: number) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function kitFor(title: string): Consumable[] {
  const text = title.toLowerCase();
  const rows: [string, number, string][] = text.includes('канал')
    ? [['Файлы', 1, 'уп'], ['Гипохлорит', 1, 'мл'], ['Коффердам', 1, 'шт']]
    : text.includes('имплант')
      ? [['Имплант', 1, 'шт'], ['Шов', 1, 'шт'], ['Артикаин', 1, 'карп']]
      : text.includes('корон')
        ? [['Цирконий', 1, 'шт'], ['Силикон', 1, 'шт'], ['Цемент', 1, 'шт']]
        : text.includes('удал')
          ? [['Артикаин', 2, 'карп'], ['Марля', 1, 'шт']]
          : text.includes('гигиен') || text.includes('отбел')
            ? [['Порошок Air Flow', 1, 'шт'], ['Фторлак', 1, 'шт']]
            : text.includes('кариес') || text.includes('пломб')
              ? [['Композит A2', 1, 'шт'], ['Бонд', 1, 'шт'], ['Матрица', 1, 'шт']]
              : [['Перчатки', 1, 'пар'], ['Маска', 1, 'шт']];
  return rows.map(([name, qty, unit]) => ({ name, qty, unit, sell: SELL[name] ?? 0, cost: COST[name] ?? 0 }));
}

export function consumablesFor(title: string, services: CatalogService[], stock: CatalogStock[]): Consumable[] {
  const service = services.find((row) => row.name === title)
    ?? services.find((row) => title.toLowerCase().includes(row.name.toLowerCase()) && row.norms?.length);
  const norms = (service?.norms ?? []).filter((row) => row.name || row.itemId);
  if (!norms.length) return kitFor(title);
  return norms.map((norm) => {
    const item = stock.find((row) => row.id === norm.itemId) ?? stock.find((row) => row.name === norm.name);
    const name = norm.name || item?.name || 'Материал';
    const sell = rub(Number(norm.sellPrice)) || rub(item?.sell ?? 0) || (SELL[name] ?? 0);
    const cost = rub(item?.cost ?? 0) || (COST[name] ?? 0);
    return {
      name,
      qty: Number(norm.quantity) > 0 ? Number(norm.quantity) : 1,
      unit: norm.unit || item?.unit || 'шт',
      sell,
      cost,
    };
  });
}

export function explainPrice(servicePrice: number, items: Consumable[]): PriceExplanation {
  const price = rub(servicePrice);
  const raw = items.map((item) => {
    const qty = item.qty > 0 ? item.qty : 1;
    const unitPrice = rub(item.sell);
    return {
      name: item.name,
      qty,
      unit: item.unit || 'шт',
      unitPrice,
      sum: Math.round(unitPrice * qty),
      internal: Math.round(rub(item.cost) * qty),
    };
  });
  const rawSum = raw.reduce((sum, row) => sum + row.sum, 0);
  const internalCost = raw.reduce((sum, row) => sum + row.internal, 0);
  const overflow = rawSum > price && price >= 0;
  let materials = raw.map((row) => ({ ...row }));
  if (overflow && rawSum > 0) {
    let allocated = 0;
    materials = raw.map((row, index) => {
      const sum = index === raw.length - 1 ? price - allocated : Math.floor((price * row.sum) / rawSum);
      allocated += sum;
      const unitPrice = row.qty ? Math.round(sum / row.qty) : sum;
      return { ...row, unitPrice, sum };
    });
    const drift = price - materials.reduce((sum, row) => sum + row.sum, 0);
    if (drift && materials.length) materials[materials.length - 1].sum += drift;
  }
  const materialSum = materials.reduce((sum, row) => sum + row.sum, 0);
  const work = Math.max(0, price - materialSum);
  const lines: PriceLine[] = [
    { kind: 'work', name: 'Работа врача', qty: null, unit: null, unitPrice: work, sum: work },
    ...materials.map((row) => ({
      kind: 'material' as const,
      name: row.name,
      qty: row.qty,
      unit: row.unit,
      unitPrice: row.unitPrice,
      sum: row.sum,
    })),
  ];
  const summed = lines.reduce((sum, line) => sum + line.sum, 0);
  if (summed !== price) {
    lines[0].sum += price - summed;
    lines[0].unitPrice = lines[0].sum;
  }
  return {
    lines,
    total: price,
    overflow,
    overflowAmount: overflow ? rawSum - price : 0,
    internalCost,
    margin: price - internalCost,
  };
}

export function patientLines(servicePrice: number, items: Consumable[]) {
  return explainPrice(servicePrice, items).lines;
}
