'use client';

import { memo, useCallback, useEffect, useId, useRef, useState } from 'react';
import { ToothDefs, ToothGlyph, faceAnchors, toothDraw, toothProfile, visualsFor, type Visual } from '@/components/studio/tooth-art';

const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const CHILD_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
const CHILD_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];

export const CONDITIONS = [
  { id: 'CARIES', label: 'Кариес', key: '1', color: '#e11d48' },
  { id: 'FILLED', label: 'Пломба', key: '2', color: '#2563eb' },
  { id: 'CROWN', label: 'Коронка', key: '3', color: '#ca8a04' },
  { id: 'ROOT_CANAL', label: 'Каналы', key: '4', color: '#7c3aed' },
  { id: 'IMPLANT', label: 'Имплант', key: '5', color: '#0f766e' },
  { id: 'MISSING', label: 'Нет зуба', key: '6', color: '#a1a1aa' },
  { id: 'TO_EXTRACT', label: 'К удалению', key: '7', color: '#9f1239' },
] as const;

export type ChartSurface = { toothNum: number; formula: string; surface: string; condition: string; layer: string };
export type ChartItem = { toothNum: number | null; surfaces: string[]; result: string; status: string; title: string };

export function ToothChart({
  surfaces,
  items,
  view,
  formula,
  condition,
  selected,
  onCondition,
  onPaint,
  onSelect,
  quiet,
  pulse,
}: {
  surfaces: ChartSurface[];
  items: ChartItem[];
  view: 'before' | 'plan' | 'after';
  formula: 'ADULT' | 'CHILD' | 'MIXED';
  condition: string;
  selected: number | null;
  onCondition: (id: string) => void;
  onPaint: (tooth: number, surface: string) => void;
  onSelect: (tooth: number, surface: string) => void;
  quiet?: boolean;
  pulse?: number[];
}) {
  const gid = useId().replace(/:/g, '');
  const [aspect, setAspect] = useState<'buccal' | 'occlusal'>('buccal');
  const [zoom, setZoom] = useState(1);
  const [band, setBand] = useState<number[]>([]);
  const drag = useRef({ on: false, moved: false, painted: new Set<number>() });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);
  const paintRef = useRef(onPaint);
  const selectRef = useRef(onSelect);
  paintRef.current = onPaint;
  selectRef.current = onSelect;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const found = CONDITIONS.find((item) => item.key === event.key);
      if (found) onCondition(found.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCondition]);

  const arches = formula === 'CHILD'
    ? [CHILD_UPPER, CHILD_LOWER]
    : formula === 'MIXED'
      ? [UPPER, CHILD_UPPER, CHILD_LOWER, LOWER]
      : [UPPER, LOWER];

  const onSurface = useCallback((tooth: number, surface: string) => {
    if (drag.current.moved) return;
    selectRef.current(tooth, surface);
    paintRef.current(tooth, surface);
  }, []);

  const hitAt = (x: number, y: number) => {
    const stack = document.elementsFromPoint(x, y);
    for (const node of stack) {
      if (!(node instanceof Element)) continue;
      const slot = node.closest('[data-tooth]');
      if (!slot) continue;
      const tooth = Number(slot.getAttribute('data-tooth'));
      if (!Number.isFinite(tooth)) continue;
      const surface = node.closest('[data-surface]')?.getAttribute('data-surface')
        ?? (aspect === 'occlusal' ? 'O' : 'TOOTH');
      return { tooth, surface };
    }
    return null;
  };

  return (
    <div className="fx">
      <div className="fx-tools">
        <div className="sd-seg">
          <button type="button" className={aspect === 'buccal' ? 'on' : ''} onClick={() => setAspect('buccal')}>Сбоку</button>
          <button type="button" className={aspect === 'occlusal' ? 'on' : ''} onClick={() => setAspect('occlusal')}>Жевательная</button>
        </div>
        {aspect === 'occlusal' && <span className="fx-faces">M мезиальная · D дистальная · O жевательная · B щёчная · L язычная</span>}
        <div className="fx-zoombar">
          <button type="button" onClick={() => setZoom((value) => Math.max(0.85, +(value - 0.15).toFixed(2)))} aria-label="Мельче">−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((value) => Math.min(1.8, +(value + 0.15).toFixed(2)))} aria-label="Крупнее">+</button>
        </div>
      </div>
      {!quiet && (
        <div className="fx-legend">
          {CONDITIONS.map((item) => (
            <button key={item.id} type="button" className={`sd-chip ${condition === item.id ? 'info' : ''}`} onClick={() => onCondition(item.id)}>
              <i style={{ background: item.color }} />
              {item.key} {item.label}
            </button>
          ))}
        </div>
      )}
      <div
        className="fx-scroll"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
            return;
          }
          drag.current = { on: true, moved: false, painted: new Set() };
        }}
        onPointerMove={(event) => {
          const prev = pointers.current.get(event.pointerId);
          if (prev) pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (pointers.current.size === 2 && pinch.current) {
            const [a, b] = [...pointers.current.values()];
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            const ratio = dist / pinch.current;
            pinch.current = dist;
            setZoom((value) => Math.min(1.8, Math.max(0.85, +(value * ratio).toFixed(2))));
            return;
          }
          if (!drag.current.on || !prev) return;
          if (Math.hypot(event.clientX - prev.x, event.clientY - prev.y) > 6) drag.current.moved = true;
          if (!drag.current.moved) return;
          const tooth = hitAt(event.clientX, event.clientY)?.tooth ?? null;
          if (tooth == null) return;
          setBand((current) => current.includes(tooth) ? current : [...current, tooth]);
          if (!quiet && !drag.current.painted.has(tooth)) {
            drag.current.painted.add(tooth);
            selectRef.current(tooth, aspect === 'occlusal' ? 'O' : 'TOOTH');
            paintRef.current(tooth, aspect === 'occlusal' ? 'O' : 'TOOTH');
          }
        }}
        onPointerUp={(event) => {
          pointers.current.delete(event.pointerId);
          if (pointers.current.size < 2) pinch.current = null;
          if (!drag.current.on) return;
          const moved = drag.current.moved;
          drag.current.on = false;
          const hit = hitAt(event.clientX, event.clientY);
          if (hit && !moved) {
            // Pointer capture retargets the click onto the scroll box, so the
            // glyph's own click never arrives. Select and paint here instead.
            drag.current.moved = true;
            selectRef.current(hit.tooth, hit.surface);
            paintRef.current(hit.tooth, hit.surface);
          } else if (hit && moved && quiet) {
            selectRef.current(hit.tooth, hit.surface);
          }
          setBand([]);
        }}
        onPointerCancel={() => { drag.current.on = false; pointers.current.clear(); setBand([]); }}
      >
        <div className="fx-board" style={{ transform: `scale(${zoom})` }}>
          {arches.map((arch) => (
            <Arch
              key={`${aspect}-${arch[0]}`}
              teeth={arch}
              aspect={aspect}
              gid={gid}
              surfaces={surfaces}
              items={items}
              view={view}
              selected={selected}
              pulse={pulse}
              band={band}
              onSurface={onSurface}
            />
          ))}
        </div>
      </div>
      {!quiet && <p className="sd-muted">Сбоку отмечается весь зуб, на жевательной поверхности — стороны M, D, O, B и L. Клавиши 1–7 меняют инструмент. Проведите по дуге, чтобы отметить несколько зубов. На планшете сожмите двумя пальцами.</p>}
    </div>
  );
}

type Slot = {
  tooth: number;
  x: number;
  y: number;
  rot: number;
  lx: number;
  ly: number;
  sx: number;
  sy: number;
  bridgeY: number;
};

const Arch = memo(function Arch({
  teeth,
  aspect,
  gid,
  surfaces,
  items,
  view,
  selected,
  pulse,
  band,
  onSurface,
}: {
  teeth: number[];
  aspect: 'buccal' | 'occlusal';
  gid: string;
  surfaces: ChartSurface[];
  items: ChartItem[];
  view: 'before' | 'plan' | 'after';
  selected: number | null;
  pulse?: number[];
  band: number[];
  onSurface: (tooth: number, surface: string) => void;
}) {
  const upper = toothProfile(teeth[0]).jaw === 'upper';
  const slots = aspect === 'buccal' ? buccalSlots(teeth, upper) : occlusalSlots(teeth, upper);
  const box = aspect === 'buccal'
    ? { x: 0, y: upper ? 0 : -30, w: 1000, h: upper ? 250 : 240 }
    : { x: 0, y: 0, w: 800, h: upper ? 480 : 520 };
  const visuals = new Map<number, Visual>();
  for (const slot of slots) visuals.set(slot.tooth, visualsFor(slot.tooth, surfaces, items, view));
  const defsId = `${gid}-${teeth[0]}`;
  return (
    <svg className={`fx-arch ${aspect}`} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} role="img" aria-label={upper ? 'Верхняя челюсть' : 'Нижняя челюсть'}>
      <ToothDefs id={defsId} />
      {slots.slice(0, -1).map((slot, index) => {
        const next = slots[index + 1];
        const left = visuals.get(slot.tooth);
        const right = visuals.get(next.tooth);
        if (!left?.crown || !right?.crown) return null;
        const x1 = slot.x + slot.sx * 28;
        const x2 = next.x - next.sx * 28;
        const gold = left.gold && right.gold;
        return (
          <path
            key={`${slot.tooth}-${next.tooth}`}
            d={`M ${x1} ${slot.bridgeY} C ${(x1 + x2) / 2} ${slot.bridgeY - 4}, ${(x1 + x2) / 2} ${next.bridgeY - 4}, ${x2} ${next.bridgeY}`}
            stroke={gold ? `url(#${defsId}-gold)` : `url(#${defsId}-bridge)`}
            strokeWidth={aspect === 'buccal' ? 8 : 6}
            fill="none"
            strokeLinecap="round"
          />
        );
      })}
      {slots.map((slot, index) => {
        const profile = toothProfile(slot.tooth);
        const visual = visuals.get(slot.tooth)!;
        const draw = toothDraw(slot.tooth);
        const gh = aspect === 'buccal' ? draw.glyphH : draw.occH;
        const prev = index > 0 ? visuals.get(slots[index - 1].tooth) : undefined;
        const next = index < slots.length - 1 ? visuals.get(slots[index + 1].tooth) : undefined;
        const pontic = visual.missing && !!prev?.crown && !!next?.crown;
        const on = selected === slot.tooth || band.includes(slot.tooth);
        const place = aspect === 'buccal'
          ? `translate(${slot.x} ${slot.y}) rotate(${slot.rot}) translate(${-50 * slot.sx} 0) scale(${slot.sx} ${slot.sy})`
          : `translate(${slot.x} ${slot.y}) rotate(${slot.rot}) translate(${-50 * slot.sx} ${-(gh / 2) * slot.sy}) scale(${slot.sx} ${slot.sy})`;
        return (
          <g key={slot.tooth} data-tooth={slot.tooth} className={`fx-slot${on ? ' on' : ''}${pulse?.includes(slot.tooth) ? ' hot' : ''}${visual.planned ? ' plan' : ''}`}>
            <g className="fx-lift" filter={on ? `url(#${defsId}-glow)` : undefined}>
              <g transform={place}>
                <ToothGlyph tooth={slot.tooth} profile={profile} mode={aspect} visual={visual} gid={defsId} pontic={pontic} onSurface={(surface) => onSurface(slot.tooth, surface)} />
              </g>
            </g>
            {aspect === 'occlusal' && slot.sx >= 0.34 && faceAnchors(slot.tooth).map((label) => {
              const [x, y] = project(slot, label.x, label.y, gh);
              return (
                <text key={label.id} className="fx-face" x={x} y={y} textAnchor="middle">{label.id}</text>
              );
            })}
            <text className="fx-num" x={slot.lx} y={slot.ly} textAnchor="middle">{slot.tooth}</text>
          </g>
        );
      })}
    </svg>
  );
});

function project(slot: Slot, x: number, y: number, gh: number) {
  const dx = (x - 50) * slot.sx;
  const dy = (y - gh / 2) * slot.sy;
  const theta = (slot.rot * Math.PI) / 180;
  const rx = dx * Math.cos(theta) - dy * Math.sin(theta);
  const ry = dx * Math.sin(theta) + dy * Math.cos(theta);
  return [slot.x + rx, slot.y + ry];
}

function buccalSlots(teeth: number[], upper: boolean): Slot[] {
  const height = 118;
  const widths = teeth.map((tooth) => {
    const baby = toothProfile(tooth).deciduous ? 0.78 : 1;
    return height * toothDraw(tooth).aspect * baby;
  });
  const gap = teeth.length > 12 ? 3 : 12;
  const total = widths.reduce((sum, width) => sum + width, 0) + gap * (teeth.length - 1);
  let cursor = (1000 - total) / 2;
  return teeth.map((tooth, index) => {
    const profile = toothProfile(tooth);
    const baby = profile.deciduous ? 0.78 : 1;
    const draw = toothDraw(tooth);
    const width = widths[index];
    const thisH = height * baby;
    const t = teeth.length === 1 ? 0.5 : index / (teeth.length - 1);
    const mid = t - 0.5;
    const smile = (0.25 - mid * mid) * 56;
    const x = cursor + width / 2;
    cursor += width + gap;
    const y = upper ? 30 + smile + (height - thisH) : 8 + (18 - smile * 0.45);
    const sx = width / 100;
    const sy = thisH / draw.glyphH;
    return {
      tooth,
      x,
      y,
      rot: mid * (upper ? 8 : -7),
      lx: x,
      ly: upper ? y - 8 : y + thisH + 14,
      sx,
      sy,
      bridgeY: upper ? y + thisH - 16 : y + 14,
    };
  });
}

function occlusalSlots(teeth: number[], upper: boolean): Slot[] {
  const cx = 400;
  const rx = 348;
  const ry = 292;
  const cy = upper ? 64 : 430;
  const samples: { x: number; y: number; angle: number; dist: number }[] = [];
  let dist = 0;
  let prev: { x: number; y: number } | null = null;
  for (let step = 0; step <= 400; step += 1) {
    const angle = Math.PI * (1 - step / 400);
    const x = cx + Math.cos(angle) * rx;
    const y = upper ? cy + Math.sin(angle) * ry : cy - Math.sin(angle) * ry;
    if (prev) dist += Math.hypot(x - prev.x, y - prev.y);
    samples.push({ x, y, angle, dist });
    prev = { x, y };
  }
  let sizes = teeth.map((tooth) => {
    const draw = toothDraw(tooth);
    const baby = toothProfile(tooth).deciduous ? 0.8 : 1;
    const designed = toothProfile(tooth).width * 52 * baby;
    return designed * Math.max(1, draw.occH / 100);
  });
  const sum = sizes.reduce((total, size) => total + size, 0);
  const gaps = Math.max(1, teeth.length - 1);
  const fit = sum + gaps * 3 > dist ? (dist - gaps * 3) / sum : 1;
  sizes = sizes.map((size) => size * fit);
  const gap = (dist - sizes.reduce((total, size) => total + size, 0)) / gaps;
  let cursor = 0;
  return teeth.map((tooth, index) => {
    const size = sizes[index];
    const target = cursor + size / 2;
    cursor += size + gap;
    let slot = samples[0];
    for (const sample of samples) if (Math.abs(sample.dist - target) < Math.abs(slot.dist - target)) slot = sample;
    const angleDeg = (slot.angle * 180) / Math.PI;
    const rot = upper ? 90 - angleDeg : angleDeg + 90;
    const outX = Math.cos(slot.angle);
    const outY = upper ? Math.sin(slot.angle) : -Math.sin(slot.angle);
    const label = size / 2 + 14;
    const scale = size / Math.max(100, toothDraw(tooth).occH);
    return {
      tooth,
      x: slot.x,
      y: slot.y,
      rot,
      lx: slot.x + outX * label,
      ly: slot.y + outY * label + 4,
      sx: scale,
      sy: scale,
      bridgeY: slot.y,
    };
  });
}
