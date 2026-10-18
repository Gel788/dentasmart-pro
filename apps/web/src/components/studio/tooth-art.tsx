'use client';

import { memo, type CSSProperties, type MouseEvent } from 'react';

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

type RootSpec = { d: string; deep?: boolean };
type BuccalSpec = {
  crown: string;
  roots: RootSpec[];
  canals: string[];
  groove?: string;
  incisal?: string;
  highlight: string;
  cervix: string;
};
type Face = 'B' | 'L' | 'M' | 'D' | 'O';
type OcclusalSpec = { outline: string; fissure: string; cusps: [number, number, number, number][]; B: string; L: string; M: string; D: string; O: string };

const BUCCAL: Record<string, BuccalSpec> = {
  uc: {
    crown: 'M26 96 C22 108 18 128 18 146 L18 156 C18 164 28 168 38 168 L64 167 C76 165 84 156 82 144 C80 124 74 106 66 96 C54 86 38 86 26 96 Z',
    roots: [{ d: 'M38 96 C36 68 40 40 47 16 C51 8 57 12 57 26 C57 48 60 74 62 96 Z' }],
    canals: ['M49 22 C48 48 50 74 51 96'],
    incisal: 'M20 150 C36 146 66 146 80 152 L78 162 C58 156 36 156 22 164 Z',
    highlight: 'M24 110 C22 128 26 146 34 156 C30 140 30 122 34 106 Z',
    cervix: 'M24 98 Q50 108 76 96',
    groove: 'M34 166 L36 150 M50 168 L50 148 M66 166 L64 150',
  },
  ul: {
    crown: 'M32 98 C28 112 26 130 28 146 C30 158 42 166 52 164 C64 160 72 150 72 136 C72 118 66 104 58 98 C48 88 38 88 32 98 Z',
    roots: [{ d: 'M40 98 C38 72 42 46 49 22 C53 14 59 20 57 38 C55 64 58 84 58 98 Z' }],
    canals: ['M50 26 C49 52 51 76 51 98'],
    incisal: 'M30 148 C42 144 64 146 70 154 L66 160 C52 156 36 156 30 160 Z',
    highlight: 'M34 112 C32 128 34 144 40 154 C38 138 36 122 40 108 Z',
    cervix: 'M32 100 Q50 108 70 98',
  },
  uca: {
    crown: 'M32 100 C26 116 22 132 34 152 L48 174 L72 146 C82 130 80 112 70 100 C56 88 42 88 32 100 Z',
    roots: [{ d: 'M36 100 C32 64 34 32 46 8 C52 2 60 10 58 28 C56 56 62 82 64 100 Z' }],
    canals: ['M49 12 C47 46 50 74 51 100'],
    highlight: 'M30 116 C28 134 36 152 46 166 C40 148 34 130 38 112 Z',
    cervix: 'M30 102 Q50 112 72 100',
    groove: 'M48 174 L46 128',
  },
  up1: {
    crown: 'M22 102 C16 118 16 136 28 150 L46 168 L66 148 C78 132 80 114 70 102 C54 90 34 90 22 102 Z',
    roots: [
      { d: 'M28 102 C22 70 24 40 36 18 C42 10 48 20 46 42 C44 70 48 102 50 102 Z' },
      { d: 'M48 100 C52 64 58 36 66 16 C72 10 76 22 70 46 C64 74 60 100 56 100 Z', deep: true },
    ],
    canals: ['M38 24 C40 52 44 78 46 100', 'M66 20 C62 50 58 76 56 100'],
    highlight: 'M24 116 C22 134 30 150 42 162 C36 146 30 128 34 112 Z',
    cervix: 'M22 104 Q48 114 74 102',
    groove: 'M46 168 C44 146 46 124 48 108',
  },
  up2: {
    crown: 'M20 104 C14 120 16 140 32 154 Q50 168 70 152 C82 136 82 116 72 104 C56 92 34 92 20 104 Z',
    roots: [{ d: 'M38 104 C34 72 36 42 46 18 C52 10 58 20 56 44 C54 74 60 104 60 104 Z' }],
    canals: ['M50 22 C48 52 50 78 51 104'],
    highlight: 'M24 118 C22 136 32 152 44 160 C38 144 32 126 36 112 Z',
    cervix: 'M22 106 Q50 116 74 104',
    groove: 'M50 164 L48 120',
  },
  um1: {
    crown: 'M8 104 C4 122 6 140 16 154 L32 170 L44 154 L58 166 L78 148 C92 132 94 114 84 104 C60 90 28 90 8 104 Z',
    roots: [
      { d: 'M42 104 C44 62 48 28 54 2 C60 0 66 8 64 30 C60 66 58 104 54 104 Z', deep: true },
      { d: 'M12 104 C4 68 2 36 14 10 C22 2 30 14 28 38 C26 70 32 104 34 104 Z' },
      { d: 'M66 104 C76 66 88 36 96 14 C102 8 106 22 96 44 C86 76 78 104 72 104 Z' },
    ],
    canals: ['M22 16 C26 50 30 80 34 104', 'M58 8 C56 46 54 76 54 104', 'M96 20 C88 52 80 80 72 104'],
    highlight: 'M14 118 C12 138 22 156 34 166 C28 148 22 130 26 114 Z',
    cervix: 'M10 106 Q32 118 50 104 Q70 118 86 104',
    groove: 'M44 154 C40 136 42 118 44 106',
  },
  um2: {
    crown: 'M12 106 C8 122 10 140 20 152 L36 166 L48 152 L60 162 L76 148 C88 132 90 114 80 106 C58 94 30 94 12 106 Z',
    roots: [
      { d: 'M44 106 C46 70 50 36 56 8 C62 2 68 12 64 36 C60 72 58 106 54 106 Z', deep: true },
      { d: 'M16 106 C10 72 8 42 20 16 C28 8 34 18 32 42 C30 74 36 106 38 106 Z' },
      { d: 'M64 106 C72 72 84 42 92 18 C98 12 102 24 94 46 C84 78 76 106 70 106 Z' },
    ],
    canals: ['M26 22 C30 54 34 82 36 106', 'M58 12 C56 50 55 80 54 106', 'M92 24 C84 56 78 84 70 106'],
    highlight: 'M18 120 C16 140 26 156 38 164 C32 146 26 128 30 114 Z',
    cervix: 'M14 108 Q36 118 50 106 Q68 118 82 106',
    groove: 'M48 152 C46 134 48 118 48 108',
  },
  um3: {
    crown: 'M16 110 C10 126 14 144 26 156 Q42 170 54 156 Q68 168 80 150 C90 134 88 116 78 110 C58 100 32 100 16 110 Z',
    roots: [
      { d: 'M44 110 C46 78 50 48 56 22 C62 14 66 24 62 46 C58 78 56 110 54 110 Z', deep: true },
      { d: 'M20 110 C14 80 16 52 26 28 C32 20 38 30 36 50 C34 80 38 110 40 110 Z' },
      { d: 'M62 110 C70 80 80 52 86 30 C92 22 96 34 88 54 C80 82 74 110 68 110 Z' },
    ],
    canals: ['M32 32 C34 64 36 88 38 110', 'M58 26 C56 62 55 88 54 110', 'M84 34 C78 64 72 90 68 110'],
    highlight: 'M22 124 C20 142 30 156 42 162 C36 146 30 130 34 118 Z',
    cervix: 'M18 112 Q50 122 80 110',
    groove: 'M48 160 L46 124',
  },
  lc: {
    crown: 'M40 106 L38 136 L38 156 C38 164 46 166 52 166 L64 166 C70 164 72 156 72 150 L72 134 L68 106 C58 98 48 98 40 106 Z',
    roots: [{ d: 'M46 106 C44 78 46 48 50 26 C54 18 58 26 56 48 C54 78 58 106 58 106 Z' }],
    canals: ['M51 30 C50 56 51 82 52 106'],
    incisal: 'M40 152 H70 L70 160 H40 Z',
    highlight: 'M42 116 C42 132 44 148 48 158 C46 142 46 124 48 112 Z',
    cervix: 'M40 108 Q54 114 70 106',
  },
  ll: {
    crown: 'M36 106 L34 136 L34 154 C34 164 44 168 54 166 C64 164 72 156 74 146 L74 128 L68 106 C56 96 44 96 36 106 Z',
    roots: [{ d: 'M44 106 C40 76 44 46 50 22 C56 14 62 24 58 48 C56 76 60 106 60 106 Z' }],
    canals: ['M52 26 C50 54 52 80 53 106'],
    incisal: 'M36 150 H72 L70 160 H38 Z',
    highlight: 'M38 118 C36 134 40 150 46 158 C42 142 40 126 44 112 Z',
    cervix: 'M36 108 Q54 116 72 106',
  },
  lca: {
    crown: 'M36 104 C30 120 30 138 40 154 L50 170 L66 150 C76 134 74 116 66 104 C56 94 44 94 36 104 Z',
    roots: [{ d: 'M40 104 C36 66 38 34 48 10 C54 4 60 14 58 36 C56 68 62 104 62 104 Z' }],
    canals: ['M51 16 C49 48 51 78 52 104'],
    highlight: 'M34 118 C32 136 40 154 48 164 C42 146 36 128 40 112 Z',
    cervix: 'M34 106 Q50 116 70 104',
    groove: 'M50 170 L48 124',
  },
  lp1: {
    crown: 'M26 106 C20 122 20 140 34 154 L48 170 L68 152 C78 136 78 118 68 106 C54 94 36 94 26 106 Z',
    roots: [{ d: 'M38 106 C34 72 36 40 46 16 C52 8 58 20 56 44 C54 74 60 106 60 106 Z' }],
    canals: ['M50 20 C48 52 50 80 51 106'],
    highlight: 'M28 120 C26 138 36 154 46 164 C40 148 32 130 36 114 Z',
    cervix: 'M26 108 Q48 118 72 106',
    groove: 'M48 170 L46 122',
  },
  lp2: {
    crown: 'M18 108 C12 124 14 144 30 156 Q50 172 72 154 C86 138 86 118 74 108 C56 96 32 96 18 108 Z',
    roots: [{ d: 'M40 108 C36 76 38 44 48 20 C54 12 60 24 58 48 C56 78 62 108 62 108 Z' }],
    canals: ['M51 24 C50 54 51 82 52 108'],
    highlight: 'M22 122 C20 140 32 156 46 164 C38 148 30 130 34 116 Z',
    cervix: 'M20 110 Q50 120 76 108',
    groove: 'M50 168 L48 124',
  },
  lm1: {
    crown: 'M6 108 C2 126 4 146 16 158 L28 172 L38 158 L50 170 L60 156 L72 164 L86 150 C98 134 100 116 88 108 C62 94 24 94 6 108 Z',
    roots: [
      { d: 'M16 108 C8 72 10 38 26 14 C34 6 42 20 38 46 C34 78 40 108 42 108 Z' },
      { d: 'M52 108 C58 74 70 42 80 20 C88 12 94 26 86 52 C78 84 72 108 68 108 Z' },
    ],
    canals: ['M30 20 C32 52 36 82 38 108', 'M80 26 C74 56 70 84 66 108'],
    highlight: 'M12 122 C10 144 22 160 34 168 C26 150 18 132 24 116 Z',
    cervix: 'M8 110 Q30 122 50 108 Q72 122 90 108',
    groove: 'M38 158 C36 140 38 122 38 110 M60 156 C58 138 58 120 58 110',
  },
  lm2: {
    crown: 'M10 108 C6 126 8 146 20 158 L34 172 L48 156 L64 170 L82 150 C94 134 96 116 84 108 C60 94 28 94 10 108 Z',
    roots: [
      { d: 'M22 108 C16 74 18 42 30 18 C38 10 44 22 42 48 C38 78 44 108 46 108 Z' },
      { d: 'M52 108 C58 74 66 44 76 20 C82 14 88 26 80 52 C74 82 68 108 64 108 Z' },
    ],
    canals: ['M34 24 C34 54 38 82 40 108', 'M76 26 C72 56 68 84 64 108'],
    highlight: 'M16 122 C14 144 26 160 38 168 C30 150 22 132 26 116 Z',
    cervix: 'M12 110 Q34 122 50 108 Q70 120 86 108',
    groove: 'M48 156 C46 136 48 118 48 108',
  },
  lm3: {
    crown: 'M16 112 C10 128 14 146 26 158 Q42 172 56 158 Q70 170 82 152 C92 136 90 118 78 112 C58 102 32 102 16 112 Z',
    roots: [
      { d: 'M26 112 C20 84 22 56 34 34 C40 26 46 36 44 56 C42 82 46 112 46 112 Z' },
      { d: 'M52 112 C58 84 66 58 74 38 C80 30 84 42 78 62 C72 88 68 112 64 112 Z' },
    ],
    canals: ['M38 40 C38 68 40 90 42 112', 'M72 44 C68 70 66 92 64 112'],
    highlight: 'M22 126 C20 144 30 156 42 164 C36 148 28 132 32 120 Z',
    cervix: 'M18 114 Q50 124 80 112',
    groove: 'M50 162 L48 128',
  },
};

const PRIMARY: Record<string, string> = {
  udc: 'uc', udl: 'ul', udca: 'uca', udm1: 'um1', udm2: 'um2',
  ldc: 'lc', ldl: 'll', ldca: 'lca', ldm1: 'lm1', ldm2: 'lm2',
};

const OCCLUSAL: Record<string, OcclusalSpec> = {
  uc: {
    outline: 'M18 40 C18 24 32 14 50 12 C68 14 82 24 82 40 C82 58 70 76 50 80 C30 76 18 58 18 40 Z',
    fissure: 'M30 46 H70',
    cusps: [],
    L: 'M22 40 C26 22 74 22 78 40 L66 44 H34 Z',
    B: 'M22 50 C30 74 70 74 78 50 L64 46 H36 Z',
    M: 'M18 40 C18 24 30 16 38 26 L34 58 C26 70 18 56 18 40 Z',
    D: 'M82 40 C82 24 70 16 62 26 L66 58 C74 70 82 56 82 40 Z',
    O: 'M38 40 H62 V54 H38 Z',
  },
  ul: {
    outline: 'M24 38 C24 24 36 16 50 16 C64 16 76 24 76 38 C76 54 66 68 50 70 C34 68 24 54 24 38 Z',
    fissure: 'M34 44 H66',
    cusps: [],
    L: 'M28 40 C32 24 68 24 72 40 L62 44 H38 Z',
    B: 'M28 48 C34 64 66 64 72 48 L60 46 H40 Z',
    M: 'M24 38 C24 26 34 18 40 26 L38 54 C32 64 24 52 24 38 Z',
    D: 'M76 38 C76 26 66 18 60 26 L62 54 C68 64 76 52 76 38 Z',
    O: 'M42 40 H60 V50 H42 Z',
  },
  uca: {
    outline: 'M50 8 C70 18 90 38 88 54 C84 76 68 92 50 94 C32 92 16 76 12 54 C10 38 30 18 50 8 Z',
    fissure: 'M50 22 L50 78',
    cusps: [[50, 58, 10, 14]],
    L: 'M32 36 L50 12 L68 36 L50 46 Z',
    B: 'M28 58 L50 90 L72 58 L50 50 Z',
    M: 'M16 52 L36 30 L44 52 L36 72 Z',
    D: 'M84 52 L64 30 L56 52 L64 72 Z',
    O: 'M42 44 H58 V62 H42 Z',
  },
  up1: {
    outline: 'M18 24 C8 38 8 70 22 86 C38 102 66 102 82 86 C96 70 96 36 82 22 C66 8 32 8 18 24 Z',
    fissure: 'M24 50 H76 M50 28 V74',
    cusps: [[50, 30, 14, 10], [50, 68, 16, 11]],
    L: 'M22 42 C30 16 72 16 80 42 L64 48 H36 Z',
    B: 'M20 56 C30 90 72 90 82 56 L64 50 H36 Z',
    M: 'M16 30 C8 46 10 74 24 88 L38 50 L32 26 Z',
    D: 'M84 30 C92 46 90 74 76 88 L62 50 L70 26 Z',
    O: 'M40 42 H62 V60 H40 Z',
  },
  up2: {
    outline: 'M20 26 C10 40 10 68 24 84 C40 100 64 100 80 84 C94 68 94 38 80 24 C66 10 34 10 20 26 Z',
    fissure: 'M26 50 H74',
    cusps: [[50, 32, 13, 10], [50, 66, 15, 11]],
    L: 'M24 44 C32 18 70 18 78 44 L64 50 H36 Z',
    B: 'M22 56 C32 88 70 88 80 56 L64 50 H36 Z',
    M: 'M18 32 C12 48 14 72 26 86 L38 50 L32 28 Z',
    D: 'M82 32 C88 48 86 72 74 86 L62 50 L68 28 Z',
    O: 'M40 44 H60 V58 H40 Z',
  },
  um1: {
    outline: 'M24 16 C42 4 64 6 80 20 C98 36 100 60 86 78 C68 98 34 100 16 80 C2 62 4 34 24 16 Z',
    fissure: 'M30 58 L46 50 L38 28 M56 72 L50 52 L74 38 M46 50 L44 82 M62 46 L78 46',
    cusps: [[32, 66, 14, 11], [62, 74, 12, 10], [34, 32, 15, 12], [70, 36, 11, 9]],
    L: 'M26 22 C44 8 70 12 82 28 L68 46 H34 Z',
    B: 'M16 60 C24 92 70 98 86 72 L70 54 H32 Z',
    M: 'M18 24 C6 40 6 66 18 80 L36 52 L30 28 Z',
    D: 'M80 22 C98 38 100 64 84 80 L64 52 L72 26 Z',
    O: 'M38 42 H64 V62 H38 Z',
  },
  um2: {
    outline: 'M26 18 C42 6 66 8 80 22 C96 38 98 60 84 76 C66 94 36 96 18 78 C6 62 8 36 26 18 Z',
    fissure: 'M32 56 L48 48 L40 28 M58 70 L52 50 L74 40 M48 50 L46 78',
    cusps: [[34, 64, 13, 10], [60, 72, 11, 9], [36, 32, 13, 10], [68, 36, 10, 8]],
    L: 'M28 24 C44 10 70 14 80 30 L66 46 H36 Z',
    B: 'M18 58 C26 88 68 94 84 70 L68 52 H34 Z',
    M: 'M20 26 C8 42 10 66 22 78 L36 50 L32 28 Z',
    D: 'M78 24 C94 40 96 62 82 76 L62 50 L70 28 Z',
    O: 'M40 42 H62 V60 H40 Z',
  },
  um3: {
    outline: 'M28 22 C44 10 66 12 78 26 C92 40 92 62 80 76 C64 92 38 92 22 76 C10 62 12 38 28 22 Z',
    fissure: 'M36 54 H68 M50 32 V74',
    cusps: [[38, 62, 11, 9], [62, 66, 10, 8], [40, 34, 11, 8], [64, 36, 9, 7]],
    L: 'M30 30 C44 16 68 18 76 34 L64 46 H38 Z',
    B: 'M24 56 C32 84 68 86 78 60 L64 50 H36 Z',
    M: 'M24 30 C14 44 16 66 28 76 L40 50 L34 32 Z',
    D: 'M76 30 C88 44 86 66 74 76 L60 50 L66 32 Z',
    O: 'M42 44 H60 V58 H42 Z',
  },
  lc: {
    outline: 'M30 18 H70 C76 18 80 30 80 42 V62 C80 78 68 90 50 90 C32 90 20 78 20 62 V42 C20 30 24 18 30 18 Z',
    fissure: 'M34 50 H66',
    cusps: [],
    L: 'M26 44 C30 24 70 24 74 44 L62 48 H38 Z',
    B: 'M26 56 C32 82 68 82 74 56 L62 52 H38 Z',
    M: 'M22 40 C22 26 30 20 38 30 L36 64 C28 78 22 64 22 40 Z',
    D: 'M78 40 C78 26 70 20 62 30 L64 64 C72 78 78 64 78 40 Z',
    O: 'M40 44 H60 V58 H40 Z',
  },
  ll: {
    outline: 'M28 18 H72 C78 20 82 32 82 44 V60 C82 78 68 88 50 88 C32 88 20 76 20 60 V42 C20 30 24 18 28 18 Z',
    fissure: 'M32 48 H70',
    cusps: [],
    L: 'M26 42 C30 24 72 24 76 42 L64 46 H36 Z',
    B: 'M26 54 C32 80 70 80 76 54 L62 50 H38 Z',
    M: 'M22 40 C22 26 30 20 38 28 L36 62 C28 76 22 62 22 40 Z',
    D: 'M80 40 C80 26 72 20 64 30 L66 62 C74 76 80 62 80 40 Z',
    O: 'M40 44 H62 V56 H40 Z',
  },
  lca: {
    outline: 'M50 12 C68 20 86 40 84 56 C80 78 66 92 50 94 C34 92 16 78 14 56 C12 40 32 20 50 12 Z',
    fissure: 'M50 24 L50 80',
    cusps: [[50, 60, 9, 12]],
    L: 'M34 38 L50 16 L66 38 L50 48 Z',
    B: 'M30 58 L50 90 L70 58 L50 50 Z',
    M: 'M18 54 L36 34 L44 54 L36 72 Z',
    D: 'M82 54 L64 34 L56 54 L64 72 Z',
    O: 'M42 46 H58 V62 H42 Z',
  },
  lp1: {
    outline: 'M22 26 C12 40 12 68 26 84 C40 100 64 100 78 84 C92 68 92 38 78 24 C64 10 36 10 22 26 Z',
    fissure: 'M28 48 H72',
    cusps: [[50, 66, 14, 12], [50, 32, 10, 8]],
    L: 'M26 44 C34 20 68 20 76 44 L64 50 H36 Z',
    B: 'M24 54 C32 88 70 88 78 54 L62 48 H38 Z',
    M: 'M20 32 C12 48 16 72 28 84 L40 50 L34 30 Z',
    D: 'M80 32 C88 48 84 72 72 84 L60 50 L66 30 Z',
    O: 'M42 44 H60 V58 H42 Z',
  },
  lp2: {
    outline: 'M16 24 C6 40 6 70 20 86 C36 104 68 104 84 86 C98 70 98 36 84 22 C68 8 32 8 16 24 Z',
    fissure: 'M24 50 H78 M50 28 V76',
    cusps: [[36, 34, 12, 9], [64, 34, 11, 9], [50, 68, 16, 11]],
    L: 'M20 44 C28 16 74 16 82 44 L66 50 H34 Z',
    B: 'M18 56 C28 92 74 92 84 56 L66 50 H34 Z',
    M: 'M14 30 C6 48 8 74 22 88 L38 50 L30 26 Z',
    D: 'M86 30 C94 48 92 74 78 88 L62 50 L70 26 Z',
    O: 'M40 42 H62 V60 H40 Z',
  },
  lm1: {
    outline: 'M10 22 C24 6 78 6 92 20 C104 38 102 70 88 88 C70 104 28 104 12 88 C-2 70 -2 38 10 22 Z',
    fissure: 'M22 50 H82 M34 50 L30 78 M52 50 L50 82 M70 50 L74 74 M38 50 L34 26 M66 50 L70 26',
    cusps: [[28, 72, 12, 10], [50, 78, 11, 9], [72, 70, 10, 8], [30, 32, 12, 9], [68, 32, 12, 9]],
    L: 'M14 28 C28 10 76 10 90 26 L72 46 H28 Z',
    B: 'M12 58 C22 96 80 98 92 62 L74 50 H26 Z',
    M: 'M10 26 C0 42 0 68 14 84 L34 50 L28 24 Z',
    D: 'M90 24 C102 42 100 70 86 86 L66 50 L74 24 Z',
    O: 'M38 42 H66 V62 H38 Z',
  },
  lm2: {
    outline: 'M12 20 C26 6 76 6 90 20 C102 38 100 68 86 86 C68 102 32 102 14 86 C2 70 2 36 12 20 Z',
    fissure: 'M22 50 H80 M50 24 V80',
    cusps: [[32, 70, 13, 10], [66, 70, 13, 10], [32, 32, 12, 9], [66, 32, 12, 9]],
    L: 'M16 28 C30 10 74 10 88 28 L70 46 H30 Z',
    B: 'M14 56 C24 94 78 94 88 58 L70 50 H30 Z',
    M: 'M12 26 C2 42 4 68 18 84 L36 50 L30 26 Z',
    D: 'M88 26 C98 42 96 68 82 84 L64 50 L70 26 Z',
    O: 'M40 42 H62 V60 H40 Z',
  },
  lm3: {
    outline: 'M18 24 C32 10 70 10 84 24 C96 40 94 66 80 80 C64 94 34 94 20 80 C8 66 8 40 18 24 Z',
    fissure: 'M28 50 H74 M50 30 V74',
    cusps: [[36, 64, 11, 9], [62, 64, 11, 9], [38, 34, 10, 8], [62, 34, 10, 8]],
    L: 'M22 32 C34 16 68 16 80 32 L66 46 H34 Z',
    B: 'M22 54 C30 84 70 84 80 54 L64 48 H36 Z',
    M: 'M18 30 C10 44 12 64 24 76 L38 50 L32 30 Z',
    D: 'M82 30 C90 44 88 64 76 76 L62 50 L68 30 Z',
    O: 'M42 44 H60 V58 H42 Z',
  },
};

export function shapeId(profile: ToothProfile) {
  const jaw = profile.jaw === 'upper' ? 'u' : 'l';
  if (profile.deciduous) {
    const part = profile.kind === 'central' ? 'c' : profile.kind === 'lateral' ? 'l' : profile.kind === 'canine' ? 'ca' : profile.index <= 1 ? 'm1' : 'm2';
    return `${jaw}d${part}`;
  }
  if (profile.kind === 'molar') return `${jaw}m${Math.min(3, profile.index)}`;
  if (profile.kind === 'premolar') return `${jaw}p${profile.index <= 1 ? 1 : 2}`;
  if (profile.kind === 'canine') return `${jaw}ca`;
  if (profile.kind === 'lateral') return `${jaw}l`;
  return `${jaw}c`;
}

function baseId(id: string) {
  return PRIMARY[id] ?? id;
}

const SPOT: Record<string, [number, number]> = {
  M: [34, 140],
  D: [66, 140],
  O: [50, 150],
  B: [50, 132],
  L: [50, 116],
  TOOTH: [50, 142],
};

const FACE_LABEL: { id: Face; x: number; y: number }[] = [
  { id: 'L', x: 50, y: 30 },
  { id: 'B', x: 50, y: 74 },
  { id: 'M', x: 26, y: 52 },
  { id: 'D', x: 74, y: 52 },
  { id: 'O', x: 50, y: 53 },
];

function BuccalSymbol({ spec, primary }: { spec: BuccalSpec; primary?: boolean }) {
  const roots = (
    <g style={{ opacity: 'var(--roots, 1)' }}>
      {spec.roots.map((root) => (
        <path key={root.d} d={root.d} style={{ fill: root.deep ? 'var(--root-deep)' : 'var(--root)' }} stroke="#b08968" strokeOpacity="0.35" strokeWidth="0.6" />
      ))}
    </g>
  );
  const crown = (
    <g>
      <path d={spec.crown} style={{ fill: 'var(--crown)' }} stroke="#8d7360" strokeOpacity="0.5" strokeWidth="0.8" />
      {spec.incisal && <path d={spec.incisal} fill="#f4fbff" opacity="0.42" />}
      {spec.groove && <path d={spec.groove} stroke="#c4a484" strokeWidth="1.15" fill="none" opacity="0.75" strokeLinecap="round" />}
      <path d={spec.highlight} fill="white" opacity="0.55" />
      <path d={spec.cervix} stroke="#c6aa90" strokeWidth="1.3" fill="none" opacity="0.85" />
      <path d={spec.crown} fill="none" stroke="var(--margin)" strokeWidth="2.4" style={{ opacity: 'var(--cap, 0)' }} />
    </g>
  );
  const canals = (
    <g style={{ opacity: 'var(--endo, 0)' }}>
      {spec.canals.map((d) => <path key={d} d={d} stroke="#e11d48" strokeWidth="3.2" fill="none" strokeLinecap="round" />)}
      {spec.canals.map((d) => <path key={`${d}-w`} d={d} stroke="#fff" strokeWidth="1.15" fill="none" strokeLinecap="round" />)}
    </g>
  );
  const screw = (
    <g style={{ opacity: 'var(--screw, 0)' }}>
      <path d="M43 104 L41 36 Q50 18 59 36 L57 104 Z" style={{ fill: 'var(--ti)' }} stroke="#667888" strokeWidth="0.7" />
      {[44, 56, 68, 80, 92].map((y) => <path key={y} d={`M39 ${y} H61`} stroke="#5c6b78" strokeWidth="2.15" strokeLinecap="round" />)}
      <rect x="37" y="100" width="26" height="10" rx="2" fill="#d5dee6" stroke="#7d8d9b" />
    </g>
  );
  if (!primary) {
    return <g>{roots}{screw}{canals}{crown}</g>;
  }
  return (
    <g>
      <g transform="translate(0 100) scale(1 0.62) translate(0 -100)">{roots}{screw}{canals}</g>
      <g transform="translate(50 138) scale(1.1 0.9) translate(-50 -138)">{crown}</g>
    </g>
  );
}

function OcclusalSymbol({ spec }: { spec: OcclusalSpec }) {
  return (
    <g>
      <path d={spec.outline} style={{ fill: 'var(--crown)' }} stroke="#8d7360" strokeOpacity="0.55" strokeWidth="1.1" />
      <path d={spec.outline} fill="none" stroke="var(--margin)" strokeWidth="2.6" style={{ opacity: 'var(--cap, 0)' }} />
      {spec.cusps.map(([cx, cy, rx, ry]) => <ellipse key={`${cx}-${cy}`} cx={cx} cy={cy} rx={rx} ry={ry} fill="white" opacity="0.28" />)}
      <path d={spec.fissure} stroke="#a67c52" strokeWidth="1.35" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <ellipse cx="38" cy="36" rx="10" ry="6" fill="white" opacity="0.35" />
    </g>
  );
}

export function ToothDefs({ id }: { id: string }) {
  const shapes = Object.keys(BUCCAL);
  return (
    <defs>
      <linearGradient id={`${id}-enamel`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#fffdf8" />
        <stop offset="38%" stopColor="#f4e6d4" />
        <stop offset="100%" stopColor="#ddc2a6" />
      </linearGradient>
      <radialGradient id={`${id}-table`} cx="40%" cy="38%" r="68%">
        <stop offset="0%" stopColor="#fffdf8" />
        <stop offset="58%" stopColor="#f0e0cc" />
        <stop offset="100%" stopColor="#d7b89a" />
      </radialGradient>
      <linearGradient id={`${id}-milk`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="55%" stopColor="#f7f2ea" />
        <stop offset="100%" stopColor="#eadfce" />
      </linearGradient>
      <linearGradient id={`${id}-root`} x1="0.2" y1="1" x2="0.8" y2="0">
        <stop offset="0%" stopColor="#f4e6d6" />
        <stop offset="100%" stopColor="#b9926e" />
      </linearGradient>
      <linearGradient id={`${id}-rootdeep`} x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stopColor="#e4cdb4" />
        <stop offset="100%" stopColor="#9a7454" />
      </linearGradient>
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
      <linearGradient id={`${id}-ti`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#8e9ba6" />
        <stop offset="38%" stopColor="#f7fafb" />
        <stop offset="100%" stopColor="#6e7d8a" />
      </linearGradient>
      <linearGradient id={`${id}-bridge`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f7f1e8" />
        <stop offset="100%" stopColor="#d9c4a4" />
      </linearGradient>
      <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="0" stdDeviation="2.4" floodColor="#14b8a6" floodOpacity="0.95" />
      </filter>
      {shapes.map((key) => (
        <symbol key={`${key}-b`} id={`${id}-b-${key}`} viewBox="0 0 100 180">
          <BuccalSymbol spec={BUCCAL[key]} />
        </symbol>
      ))}
      {Object.entries(PRIMARY).map(([key, from]) => (
        <symbol key={`${key}-b`} id={`${id}-b-${key}`} viewBox="0 0 100 180">
          <BuccalSymbol spec={BUCCAL[from]} primary />
        </symbol>
      ))}
      {shapes.map((key) => (
        <symbol key={`${key}-o`} id={`${id}-o-${key}`} viewBox="0 0 100 100">
          <OcclusalSymbol spec={OCCLUSAL[key]} />
        </symbol>
      ))}
      {Object.keys(PRIMARY).map((key) => (
        <symbol key={`${key}-o`} id={`${id}-o-${key}`} viewBox="0 0 100 100">
          <OcclusalSymbol spec={OCCLUSAL[baseId(key)]} />
        </symbol>
      ))}
    </defs>
  );
}

function spotFill(condition: string) {
  if (condition === 'CARIES') return '#3a241c';
  if (condition === 'PLANNED') return '#99f6e4';
  return '#d7ebe0';
}

function ToothGlyphBase({
  profile,
  mode,
  visual,
  gid,
  onSurface,
}: {
  profile: ToothProfile;
  mode: 'buccal' | 'occlusal';
  visual: Visual;
  gid: string;
  onSurface?: (surface: string) => void;
}) {
  const id = shapeId(profile);
  const spec = BUCCAL[baseId(id)] ?? BUCCAL.um1;
  const face = OCCLUSAL[baseId(id)] ?? OCCLUSAL.um1;
  const natural = mode === 'occlusal'
    ? (profile.deciduous ? `url(#${gid}-milk)` : `url(#${gid}-table)`)
    : (profile.deciduous ? `url(#${gid}-milk)` : `url(#${gid}-enamel)`);
  const crown = visual.gold ? `url(#${gid}-gold)` : visual.crown ? `url(#${gid}-ceramic)` : natural;
  const vars = {
    '--crown': crown,
    '--root': `url(#${gid}-root)`,
    '--root-deep': `url(#${gid}-rootdeep)`,
    '--ti': `url(#${gid}-ti)`,
    '--roots': visual.implant ? 0 : 1,
    '--screw': visual.implant ? 1 : 0,
    '--endo': visual.endo && !visual.implant ? 1 : 0,
    '--cap': visual.crown ? 1 : 0,
    '--margin': visual.gold ? '#8a6a22' : '#b7a48c',
  } as CSSProperties;
  const flip = profile.jaw === 'lower' ? 'translate(0 180) scale(1 -1)' : undefined;
  const mirror = profile.mirror ? 'translate(100 0) scale(-1 1)' : undefined;
  const paint = (surface: string) => (event: MouseEvent) => {
    event.stopPropagation();
    onSurface?.(surface);
  };
  if (mode === 'occlusal') {
    const spot = (surface: string) => visual.spots.find((item) => item.surface === surface || item.surface === 'TOOTH');
    return (
      <g opacity={visual.missing ? 0.24 : 1} style={{ transition: 'opacity 280ms ease' }}>
        <g transform={mirror}>
          <g style={vars}>
            <use href={`#${gid}-o-${id}`} width="100" height="100" />
          </g>
          {(['B', 'L', 'M', 'D', 'O'] as Face[]).map((surface) => {
            const hit = spot(surface);
            const fill = hit ? spotFill(hit.condition) : 'transparent';
            return (
              <path
                key={surface}
                className="fx-surf"
                data-surface={surface}
                d={face[surface]}
                fill={fill}
                fillOpacity={fill === 'transparent' ? 1 : 0.92}
                stroke="rgba(92,64,42,0.38)"
                strokeWidth="1.15"
                style={{ transition: 'fill 280ms ease, fill-opacity 280ms ease' }}
                onClick={paint(surface)}
              >
                <title>{surface}</title>
              </path>
            );
          })}
          {visual.endo && <circle cx="50" cy="50" r="4.5" fill="#e11d48" stroke="#fff" strokeWidth="1" pointerEvents="none" />}
          {visual.implant && <circle cx="50" cy="50" r="7" fill={`url(#${gid}-ti)`} stroke="#667888" pointerEvents="none" />}
          {visual.extract && <path d="M18 16 L82 84 M82 16 L18 84" stroke="#e11d48" strokeWidth="4" strokeLinecap="round" pointerEvents="none" />}
          {visual.planned && <path d={face.outline} fill="none" stroke="#0f766e" strokeWidth="1.6" strokeDasharray="3 2" pointerEvents="none" />}
        </g>
      </g>
    );
  }
  return (
    <g opacity={visual.missing ? 0.24 : 1} style={{ transition: 'opacity 280ms ease' }}>
      <g transform={flip}>
        <g transform={mirror}>
          <g style={vars}>
            <use href={`#${gid}-b-${id}`} width="100" height="180" pointerEvents="none" />
          </g>
          <g transform={profile.deciduous ? 'translate(0 100) scale(1 0.62) translate(0 -100)' : undefined}>
            {spec.roots.map((root) => (
              <path key={root.d} d={root.d} fill="transparent" onClick={paint('TOOTH')} />
            ))}
          </g>
          <g transform={profile.deciduous ? 'translate(50 138) scale(1.1 0.9) translate(-50 -138)' : undefined}>
            {visual.spots.map((spot) => {
              const [cx, cy] = SPOT[spot.surface] ?? SPOT.O;
              const dark = spot.condition === 'CARIES';
              return (
                <g key={`${spot.surface}-${spot.condition}`} pointerEvents="none" className="fx-spot">
                  <ellipse cx={cx} cy={cy} rx={dark ? 8 : 9} ry={dark ? 5.5 : 6.5} fill={spotFill(spot.condition)} opacity="0.95" stroke={dark ? 'none' : '#8aa394'} />
                  {dark && <ellipse cx={cx + 1} cy={cy + 0.5} rx="3.2" ry="2.2" fill="#1a0e0a" />}
                </g>
              );
            })}
            {visual.extract && <path d="M22 108 L78 166 M78 108 L22 166" stroke="#e11d48" strokeWidth="5" strokeLinecap="round" pointerEvents="none" />}
            {visual.planned && <path d={spec.crown} fill="none" stroke="#0f766e" strokeWidth="2" strokeDasharray="4 3" pointerEvents="none" />}
            <path d={spec.crown} fill="transparent" onClick={paint('TOOTH')}>
              <title>Весь зуб</title>
            </path>
          </g>
        </g>
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
  a.profile.kind === b.profile.kind
  && a.profile.jaw === b.profile.jaw
  && a.profile.mirror === b.profile.mirror
  && a.profile.deciduous === b.profile.deciduous
  && a.profile.index === b.profile.index
  && a.mode === b.mode
  && a.gid === b.gid
  && sameVisual(a.visual, b.visual)
));

export function faceAnchors(mirrored: boolean) {
  return FACE_LABEL.map((label) => ({
    ...label,
    x: mirrored ? 100 - label.x : label.x,
  }));
}
