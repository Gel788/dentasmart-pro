import { formatMoney } from '@/lib/format';
import type { PriceLine } from '@/lib/breakdown';

function qtyText(value: number) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

export function BreakdownTable({ lines }: { lines: PriceLine[] }) {
  const total = lines.reduce((sum, line) => sum + line.sum, 0);
  return (
    <table className="bk">
      <thead>
        <tr>
          <th>Состав</th>
          <th className="num">Кол-во</th>
          <th>Ед.</th>
          <th className="num">Цена</th>
          <th className="num">Сумма</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => (
          <tr key={`${line.kind}-${line.name}`} className={line.kind}>
            <td>{line.name}</td>
            <td className="num">{line.qty == null ? '' : qtyText(line.qty)}</td>
            <td>{line.unit ?? ''}</td>
            <td className="num">{line.kind === 'work' ? '' : formatMoney(line.unitPrice)}</td>
            <td className="num">{formatMoney(line.sum)}</td>
          </tr>
        ))}
        <tr className="total">
          <td>Итого</td>
          <td />
          <td />
          <td />
          <td className="num">{formatMoney(total)}</td>
        </tr>
      </tbody>
    </table>
  );
}
