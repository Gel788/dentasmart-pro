'use client';

import { memo, type MouseEvent } from 'react';
import atlas from '@/components/studio/teeth-atlas.json';

export type Jaw = 'upper' | 'lower';
export type Kind = 'central' | 'lateral' | 'canine' | 'premolar' | 'molar';

export type ToothProfile = {
  kind: Kind;
  jaw: Jaw;
  side: 'right' | 'left';
  deciduous: boolean;
  index: number;
  mirror: boolean;
  width: number;
};

const WHOLE = new Set(['CROWN', 'IMPLANT', 'MISSING', 'TO_EXTRACT', 'ROOT_CANAL']);

export function toothProfile(n: number): ToothProfile {
  const quadrant = Math.floor(n / 10);
  const pos = n % 10;
  const jaw: Jaw = quadrant === 1 || quadrant === 2 || quadrant === 5 || quadrant === 6 ? 'upper' : 'lower';
  const side = quadrant === 1 || quadrant === 4 || quadrant === 5 || quadrant === 8 ? 'right' : 'left';
  const deciduous = quadrant >= 5;
  let kind: Kind = 'molar';
  if (pos === 1) kind = 'central';
  else if (pos === 2) kind = 'lateral';
  else if (pos === 3) kind = 'canine';
  else if (!deciduous && (pos === 4 || pos === 5)) kind = 'premolar';
  const index = kind === 'premolar' ? pos - 3 : deciduous ? pos - 3 : pos - 5;
  const width = deciduous
    ? kind === 'molar' ? (index >= 2 ? 1.02 : 0.9) : kind === 'canine' ? 0.74 : kind === 'central' ? (jaw === 'upper' ? 0.9 : 0.56) : (jaw === 'upper' ? 0.68 : 0.52)
    : kind === 'molar' ? (pos === 8 ? 0.94 : jaw === 'lower' && pos === 6 ? 1.16 : 1.08)
      : kind === 'premolar' ? (jaw === 'upper' ? 0.86 : 0.8)
        : kind === 'canine' ? (jaw === 'upper' ? 0.84 : 0.74)
          : kind === 'lateral' ? (jaw === 'upper' ? 0.7 : 0.6)
            : (jaw === 'upper' ? 0.92 : 0.56);
  return {
    kind,
    jaw,
    side,
    deciduous,
    index: Math.max(1, index),
    mirror: side === 'right',
    width,
  };
}

export function isWholeCondition(condition: string) {
  return WHOLE.has(condition);
}

export type Visual = {
  missing: boolean;
  extract: boolean;
  implant: boolean;
  crown: boolean;
  endo: boolean;
  gold: boolean;
  planned: boolean;
  spots: { surface: string; condition: 'CARIES' | 'FILLED' | 'PLANNED' }[];
};

export function visualsFor(
  tooth: number,
  surfaces: { toothNum: number; surface: string; condition: string }[],
  items: { toothNum: number | null; surfaces: string[]; result: string; status: string; title: string }[],
  view: 'before' | 'plan' | 'after',
): Visual {
  const visual: Visual = { missing: false, extract: false, implant: false, crown: false, endo: false, gold: false, planned: false, spots: [] };
  const apply = (condition: string, surface: string, fromPlan: boolean) => {
    if (!condition || condition === 'HEALTHY') return;
    if (fromPlan) visual.planned = true;
    if (condition === 'MISSING') {
      if (view === 'plan' && fromPlan) visual.extract = true;
      else visual.missing = true;
      return;
    }
    if (condition === 'TO_EXTRACT') { visual.extract = true; return; }
    if (condition === 'IMPLANT') { visual.implant = true; visual.crown = true; return; }
    if (condition === 'CROWN') { visual.crown = true; return; }
    if (condition === 'ROOT_CANAL') { visual.endo = true; return; }
    if (condition === 'CARIES' || condition === 'FILLED' || condition === 'PLANNED') {
      visual.spots.push({ surface: surface === 'TOOTH' ? 'O' : surface, condition: condition === 'PLANNED' ? 'PLANNED' : condition });
    }
  };
  for (const row of surfaces) {
    if (row.toothNum !== tooth) continue;
    apply(row.condition, row.surface, false);
  }
  if (view === 'before') return visual;
  for (const item of items) {
    if (item.toothNum !== tooth || item.status === 'REJECTED' || item.status === 'DONE') continue;
    if (/золот|gold|металл/i.test(item.title)) visual.gold = true;
    const result = item.result || 'FILLED';
    const faces = item.surfaces.length ? item.surfaces : ['TOOTH'];
    if (view === 'after' && result === 'MISSING') { visual.missing = true; visual.extract = false; continue; }
    for (const face of faces) apply(view === 'plan' && result === 'PLANNED' ? 'PLANNED' : result, face, true);
  }
  if (visual.missing) {
    visual.extract = false;
    visual.spots = [];
  }
  if (visual.crown) visual.spots = visual.spots.filter((spot) => spot.condition === 'PLANNED');
  return visual;
}

const BABY: Record<number, number> = {
  51: 11, 52: 12, 53: 13, 54: 16, 55: 16,
  61: 21, 62: 22, 63: 23, 64: 26, 65: 26,
  71: 31, 72: 32, 73: 33, 74: 36, 75: 36,
  81: 41, 82: 42, 83: 43, 84: 46, 85: 46,
};

type Face = 'B' | 'L' | 'M' | 'D' | 'O';
const FACES: Face[] = ['O', 'L', 'B', 'M', 'D'];

type ToothSpec = {
  box: number[];
  occBox: number[];
  glyphH: number;
  occH: number;
  silhouette: string;
  crown: string;
  root: string;
  crownY: number;
  zones: Record<Face, string>;
  anchors: Record<Face, number[]>;
  canals: number[][];
  spots: Record<string, number[]>;
};

const TEETH = atlas.teeth as Record<string, ToothSpec>;

export function sourceTooth(tooth: number) {
  return BABY[tooth] ?? tooth;
}

export function toothDraw(tooth: number) {
  const spec = TEETH[String(sourceTooth(tooth))];
  return { glyphH: spec.glyphH, occH: spec.occH, aspect: 100 / spec.glyphH };
}

function sheetBox(tooth: number, mode: 'buccal' | 'occlusal') {
  const spec = TEETH[String(sourceTooth(tooth))];
  const sheet = mode === 'buccal' ? atlas.buccal : atlas.occlusal;
  const index = atlas.order.indexOf(sourceTooth(tooth) as (typeof atlas.order)[number]);
  const col = index % atlas.cols;
  const row = Math.floor(index / atlas.cols);
  const [cellW, cellH] = sheet.cell;
  const box = mode === 'buccal' ? spec.box : spec.occBox;
  return {
    src: sheet.src,
    width: sheet.width,
    height: sheet.height,
    view: `${col * cellW + box[0]} ${row * cellH + box[1]} ${box[2]} ${box[3]}`,
  };
}

export function ToothDefs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-ceramic`} x1="0" y1="0" x2="0.2" y2="1">
        <stop offset="0%" stopColor="#fbfcfe" />
        <stop offset="42%" stopColor="#e7eef3" />
        <stop offset="100%" stopColor="#c9d4dc" />
      </linearGradient>
      <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#fff6d2" />
        <stop offset="28%" stopColor="#f0d78a" />
        <stop offset="62%" stopColor="#d4a441" />
        <stop offset="100%" stopColor="#8d6418" />
      </linearGradient>
      <linearGradient id={`${id}-bridge`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f7f1e8" />
        <stop offset="100%" stopColor="#d9c4a4" />
      </linearGradient>
      <filter id={`${id}-glow`} x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="0" stdDeviation="2.2" floodColor="#14b8a6" floodOpacity="0.95" />
      </filter>
    </defs>
  );
}

function spotFill(condition: string) {
  if (condition === 'CARIES') return '#3a241c';
  if (condition === 'PLANNED') return '#99f6e4';
  return '#d5ebe4';
}

function Sprite({
  tooth,
  mode,
  width,
  height,
  fit = 'xMidYMid meet',
}: {
  tooth: number;
  mode: 'buccal' | 'occlusal';
  width: number;
  height: number;
  fit?: string;
}) {
  const frame = sheetBox(tooth, mode);
  return (
    <svg viewBox={frame.view} width={width} height={height} preserveAspectRatio={fit} pointerEvents="none">
      <image href={frame.src} width={frame.width} height={frame.height} />
    </svg>
  );
}

function ImplantSprite({ mode, width, height }: { mode: 'buccal' | 'occlusal'; width: number; height: number }) {
  const box = mode === 'buccal' ? atlas.implant.box : atlas.implant.occBox;
  const src = mode === 'buccal' ? atlas.implant.buccal : atlas.implant.occlusal;
  const size = mode === 'buccal' ? [480, 864] : [512, 512];
  return (
    <svg viewBox={`${box[0]} ${box[1]} ${box[2]} ${box[3]}`} width={width} height={height} preserveAspectRatio={mode === 'buccal' ? 'xMidYMax meet' : 'xMidYMid meet'} pointerEvents="none">
      <image href={src} width={size[0]} height={size[1]} />
    </svg>
  );
}

function ToothGlyphBase({
  tooth,
  profile,
  mode,
  visual,
  gid,
  pontic,
  onSurface,
}: {
  tooth: number;
  profile: ToothProfile;
  mode: 'buccal' | 'occlusal';
  visual: Visual;
  gid: string;
  pontic?: boolean;
  onSurface?: (surface: string) => void;
}) {
  const spec = TEETH[String(sourceTooth(tooth))];
  const glyphH = mode === 'buccal' ? spec.glyphH : spec.occH;
  const paint = (surface: string) => (event: MouseEvent) => {
    event.stopPropagation();
    onSurface?.(surface);
  };
  const flip = profile.jaw === 'lower' && mode === 'buccal' ? `translate(0 ${glyphH}) scale(1 -1)` : undefined;
  const crownClip = `${gid}-c-${tooth}`;
  const rootClip = `${gid}-r-${tooth}`;
  const cap = visual.gold ? `url(#${gid}-gold)` : `url(#${gid}-ceramic)`;
  const showNatural = !visual.implant;
  const ghostRoot = visual.endo && !visual.implant;
  return (
    <g opacity={visual.missing && !pontic ? 0.15 : 1} style={{ transition: 'opacity 280ms ease' }}>
      <g transform={flip}>
        <defs>
          <clipPath id={crownClip} clipPathUnits="userSpaceOnUse"><path d={spec.crown} /></clipPath>
          <clipPath id={rootClip} clipPathUnits="userSpaceOnUse"><path d={spec.root} /></clipPath>
          {mode === 'occlusal' && FACES.map((face) => (
            <clipPath key={face} id={`${gid}-z-${tooth}-${face}`} clipPathUnits="userSpaceOnUse">
              <path d={spec.zones[face]} />
            </clipPath>
          ))}
        </defs>
        {visual.implant ? (
          <ImplantSprite mode={mode} width={100} height={glyphH} />
        ) : ghostRoot ? (
          <>
            <g clipPath={`url(#${crownClip})`}><Sprite tooth={tooth} mode={mode} width={100} height={glyphH} /></g>
            <g clipPath={`url(#${rootClip})`} opacity={0.42}><Sprite tooth={tooth} mode={mode} width={100} height={glyphH} /></g>
          </>
        ) : (
          <g clipPath={pontic ? `url(#${crownClip})` : undefined}>
            <Sprite tooth={tooth} mode={mode} width={100} height={glyphH} />
          </g>
        )}
        {showNatural && ghostRoot && mode === 'buccal' && spec.canals.map((canal, index) => (
          <line key={index} x1={canal[0]} y1={canal[1]} x2={canal[2]} y2={canal[3]} stroke="#9f1239" strokeWidth="1.35" strokeLinecap="round" pointerEvents="none" />
        ))}
        {visual.crown && mode === 'buccal' && spec.crown && (
          <g clipPath={`url(#${crownClip})`} pointerEvents="none">
            <path d={spec.crown} fill={cap} opacity={visual.gold ? 0.92 : 0.8} />
            <ellipse cx="46" cy={spec.crownY + (glyphH - spec.crownY) * 0.32} rx="14" ry="8" fill="white" opacity="0.35" />
          </g>
        )}
        {visual.crown && mode === 'occlusal' && FACES.map((face) => (
          <path key={face} d={spec.zones[face]} fill={cap} opacity={visual.gold ? 0.9 : 0.74} pointerEvents="none" />
        ))}
        {visual.implant && visual.crown && mode === 'buccal' && (
          <ellipse cx="50" cy={glyphH - Math.min(18, glyphH * 0.12)} rx="18" ry="11" fill={cap} opacity="0.9" pointerEvents="none" />
        )}
        {mode === 'buccal' && visual.spots.length > 0 && (
          <g clipPath={`url(#${crownClip})`} pointerEvents="none">
            {visual.spots.map((spot) => {
              const at = spec.spots[spot.surface] ?? spec.spots.O;
              const dark = spot.condition === 'CARIES';
              const rx = Math.max(6, (glyphH - spec.crownY) * (dark ? 0.075 : 0.09));
              return (
                <g key={`${spot.surface}-${spot.condition}`}>
                  <ellipse cx={at[0]} cy={at[1]} rx={rx} ry={rx * 0.72} fill={spotFill(spot.condition)} stroke={dark ? 'none' : '#6d8f80'} strokeWidth={dark ? 0 : 0.8} />
                  {dark && <ellipse cx={at[0]} cy={at[1] + 0.6} rx={rx * 0.42} ry={rx * 0.28} fill="#1a0e0a" />}
                </g>
              );
            })}
          </g>
        )}
        {mode === 'occlusal' && visual.spots.map((spot) => {
          const face = (FACES.includes(spot.surface as Face) ? spot.surface : 'O') as Face;
          const at = spec.anchors[face];
          const dark = spot.condition === 'CARIES';
          return (
            <ellipse
              key={`${spot.surface}-${spot.condition}`}
              cx={at[0]}
              cy={at[1]}
              rx={dark ? 8 : 10}
              ry={dark ? 6 : 7.5}
              fill={spotFill(spot.condition)}
              stroke={dark ? 'none' : '#6d8f80'}
              strokeWidth={dark ? 0 : 0.7}
              clipPath={`url(#${gid}-z-${tooth}-${face})`}
              pointerEvents="none"
            />
          );
        })}
        {visual.endo && mode === 'occlusal' && !visual.implant && (
          <circle cx="50" cy={glyphH / 2} r="3.4" fill="#9f1239" stroke="#fff" strokeWidth="0.6" pointerEvents="none" />
        )}
        {visual.extract && (
          <path
            d={mode === 'buccal'
              ? `M 22 ${spec.crownY + 6} L 78 ${glyphH - 8} M 78 ${spec.crownY + 6} L 22 ${glyphH - 8}`
              : `M 18 12 L 82 ${glyphH - 12} M 82 12 L 18 ${glyphH - 12}`}
            stroke="#e11d48"
            strokeWidth="3.2"
            strokeLinecap="round"
            pointerEvents="none"
          />
        )}
        {visual.planned && (
          <path d={mode === 'buccal' ? spec.silhouette : spec.zones.O} fill="none" stroke="#0f766e" strokeWidth="1.4" strokeDasharray="3 2" pointerEvents="none" />
        )}
        {mode === 'occlusal' ? FACES.map((face) => (
          <path
            key={face}
            className="fx-surf fx-hit"
            data-surface={face}
            d={spec.zones[face]}
            fill="transparent"
            stroke="rgba(92,64,42,0.42)"
            strokeWidth="0.7"
            pointerEvents="all"
            onClick={paint(face)}
          >
            <title>{face}</title>
          </path>
        )) : (
          <path className="fx-hit" data-surface="TOOTH" d={spec.silhouette} fill="transparent" pointerEvents="all" onClick={paint('TOOTH')}>
            <title>Весь зуб</title>
          </path>
        )}
      </g>
    </g>
  );
}

function sameVisual(a: Visual, b: Visual) {
  if (a.missing !== b.missing || a.extract !== b.extract || a.implant !== b.implant || a.crown !== b.crown || a.endo !== b.endo || a.gold !== b.gold || a.planned !== b.planned) return false;
  if (a.spots.length !== b.spots.length) return false;
  return a.spots.every((spot, index) => spot.surface === b.spots[index].surface && spot.condition === b.spots[index].condition);
}

export const ToothGlyph = memo(ToothGlyphBase, (a, b) => (
  a.tooth === b.tooth
  && a.pontic === b.pontic
  && a.profile.jaw === b.profile.jaw
  && a.profile.deciduous === b.profile.deciduous
  && a.mode === b.mode
  && a.gid === b.gid
  && sameVisual(a.visual, b.visual)
));

export function faceAnchors(tooth: number) {
  const spec = TEETH[String(sourceTooth(tooth))];
  return FACES.map((id) => ({ id, x: spec.anchors[id][0], y: spec.anchors[id][1] }));
}

