'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, assetUrl } from '@/lib/api';

type Mark = { id: string; toothNum: number | null; kind: string; source: string; label: string; confidence: number | null; sliceIndex: number | null; x: number; y: number; w: number; h: number };
type Study = { id: string; type: string; title: string | null; fileUrl: string; toothNum: number | null; takenAt: string; seriesKey: string | null; sliceIndex: number | null; annotations: Mark[] };
type Shot = { slot: string; label: string; fileUrl: string | null; toothNum: number | null };
type Protocol = { id: string; moment: string; title: string; phase: string | null; shots: Shot[] };
type Bundle = { compare: { before: string | null; after: string | null }; protocols: Protocol[]; studies: Study[] };

export function ImagingBoard({ patientId, appointmentId, tooth }: { patientId: string; appointmentId?: string; tooth?: number | null }) {
  const [data, setData] = useState<Bundle | null>(null);
  const [error, setError] = useState('');
  const [slot, setSlot] = useState('FACE_SMILE');
  const [moment, setMoment] = useState('BEFORE');

  const load = () => api<Bundle>(`/flow/patients/${patientId}/imaging`).then(setData).catch((err: Error) => setError(err.message));
  useEffect(() => { void load(); }, [patientId]);

  const upload = async (file: File, as: 'study' | 'shot') => {
    const body = new FormData();
    body.append('file', file);
    const saved = await api<{ url: string }>('/uploads/imaging', { method: 'POST', body });
    const name = file.name.toLowerCase();
    if (as === 'shot') {
      await api(`/flow/patients/${patientId}/shots`, {
        method: 'POST',
        body: JSON.stringify({ moment, slot, fileUrl: saved.url, toothNum: tooth ?? undefined, appointmentId }),
      });
    } else {
      const type = name.endsWith('.dcm') ? 'DICOM' : name.endsWith('.stl') ? 'STL' : name.endsWith('.ply') ? 'PLY' : name.includes('opg') ? 'OPG' : 'INTRAORAL';
      await api(`/flow/patients/${patientId}/studies`, {
        method: 'POST',
        body: JSON.stringify({ type, fileUrl: saved.url, title: file.name, toothNum: tooth ?? undefined, appointmentId }),
      });
    }
    await load();
  };

  if (error) return <p>{error}</p>;
  if (!data) return <p className="sd-muted">Открываем снимки…</p>;
  const studies = tooth ? data.studies.filter((study) => study.toothNum == null || study.toothNum === tooth || study.seriesKey) : data.studies;

  return (
    <div className="sd-stack">
      {data.compare.before && data.compare.after && <Compare before={data.compare.before} after={data.compare.after} />}
      <section className="sd-card sd-stack">
        <div className="sd-h" style={{ margin: 0 }}>
          <strong>Фотопротокол</strong>
          <div className="sd-seg">
            <button type="button" className={moment === 'BEFORE' ? 'on' : ''} onClick={() => setMoment('BEFORE')}>До</button>
            <button type="button" className={moment === 'AFTER' ? 'on' : ''} onClick={() => setMoment('AFTER')}>После</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
          {(data.protocols.find((protocol) => protocol.moment === moment)?.shots ?? data.protocols[0]?.shots ?? []).map((shot) => (
            <button key={shot.slot} type="button" className="sd-card" style={{ textAlign: 'left', borderColor: slot === shot.slot ? 'var(--accent)' : undefined }} onClick={() => setSlot(shot.slot)}>
              {shot.fileUrl ? <img src={assetUrl(shot.fileUrl)} alt={shot.label} style={{ width: '100%', height: 84, objectFit: 'cover', borderRadius: 6 }} /> : <div style={{ height: 84, display: 'grid', placeItems: 'center' }} className="sd-muted">пустой слот</div>}
              <div style={{ marginTop: 6 }}>{shot.label}</div>
            </button>
          ))}
          {data.protocols.length === 0 && <p className="sd-muted">Слотов ещё нет — загрузите первый кадр, протокол создастся сам.</p>}
        </div>
        <label className="sd-btn-ghost" style={{ width: 'fit-content' }}>
          Кадр в слот «{slot}»
          <input hidden type="file" accept="image/*,.svg" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, 'shot'); }} />
        </label>
      </section>
      <section className="sd-card sd-stack">
        <div className="sd-h" style={{ margin: 0 }}>
          <strong>Рентген, КТ и сканы{tooth ? ` · зуб ${tooth}` : ''}</strong>
          <label className="sd-btn">
            Загрузить
            <input hidden type="file" accept=".dcm,.stl,.ply,image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, 'study'); }} />
          </label>
        </div>
        <Viewer studies={studies} onChange={load} />
      </section>
    </div>
  );
}

function Compare({ before, after }: { before: string; after: string }) {
  const [pos, setPos] = useState(18);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const run = (now: number) => {
      const progress = Math.min(1, (now - start) / 1400);
      const eased = 0.5 - Math.cos(progress * Math.PI) / 2;
      setPos(18 + eased * 62);
      if (progress < 1) frame = requestAnimationFrame(run);
    };
    frame = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame);
  }, []);
  const move = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    setPos(Math.min(96, Math.max(4, ((clientX - rect.left) / rect.width) * 100)));
  };
  return (
    <section className="sd-card">
      <strong>До и после</strong>
      <div
        className="sd-compare"
        ref={box}
        style={{ marginTop: 8 }}
        onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); move(event.clientX); }}
        onPointerMove={(event) => { if (event.buttons) move(event.clientX); }}
      >
        <img src={assetUrl(after)} alt="После" />
        <img src={assetUrl(before)} alt="До" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
        <div className="sd-compare-bar" style={{ left: `${pos}%` }} />
      </div>
    </section>
  );
}

function Viewer({ studies, onChange }: { studies: Study[]; onChange: () => Promise<void> | void }) {
  const series = useMemo(() => {
    const groups = new Map<string, Study[]>();
    for (const study of studies) {
      const key = study.seriesKey ?? study.id;
      groups.set(key, [...(groups.get(key) ?? []), study]);
    }
    return [...groups.entries()].map(([key, slices]) => ({ key, slices: slices.sort((a, b) => (a.sliceIndex ?? 0) - (b.sliceIndex ?? 0)), title: slices[0]?.title ?? 'Снимок' }));
  }, [studies]);
  const [key, setKey] = useState(series[0]?.key ?? '');
  const group = series.find((item) => item.key === key) ?? series[0];
  const [slice, setSlice] = useState(0);
  const [level, setLevel] = useState(40);
  const [width, setWidth] = useState(80);
  const [zoom, setZoom] = useState(1);
  const [marks, setMarks] = useState<{ x: number; y: number }[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const study = group?.slices[Math.min(slice, (group?.slices.length ?? 1) - 1)];

  useEffect(() => { setSlice(0); setMarks([]); }, [key]);

  useEffect(() => {
    if (!study || !canvas.current) return;
    const ctx = canvas.current.getContext('2d');
    if (!ctx) return;
    let cancel = false;
    const draw = async () => {
      if (study.fileUrl.endsWith('.dcm')) {
        const buffer = await fetch(assetUrl(study.fileUrl)).then((res) => res.arrayBuffer());
        if (cancel) return;
        const image = parseDicom(new Uint8Array(buffer));
        paintGray(ctx, image.pixels, image.width, image.height, level, width, zoom);
      } else if (study.fileUrl.endsWith('.stl') || study.type === 'STL' || study.type === 'PLY') {
        const text = await fetch(assetUrl(study.fileUrl)).then((res) => res.text());
        if (cancel) return;
        paintMesh(ctx, text, level);
      } else {
        const img = new Image();
        img.src = assetUrl(study.fileUrl);
        await img.decode();
        if (cancel) return;
        paintPhoto(ctx, img, level, width, zoom);
      }
      for (const mark of study.annotations.filter((mark) => mark.sliceIndex == null || mark.sliceIndex === study.sliceIndex)) {
        ctx.strokeStyle = mark.source === 'AI' ? '#fbbf24' : '#2dd4bf';
        ctx.setLineDash(mark.source === 'AI' ? [4, 3] : []);
        ctx.strokeRect(mark.x * 320, mark.y * 240, mark.w * 320, mark.h * 240);
        ctx.setLineDash([]);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.font = '12px sans-serif';
        ctx.fillText(mark.label, mark.x * 320, Math.max(12, mark.y * 240 - 4));
      }
      if (marks.length === 2) {
        ctx.strokeStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(marks[0].x, marks[0].y);
        ctx.lineTo(marks[1].x, marks[1].y);
        ctx.stroke();
        const dist = Math.hypot(marks[1].x - marks[0].x, marks[1].y - marks[0].y);
        ctx.fillStyle = '#fff';
        ctx.fillText(`${Math.round(dist)} px`, marks[1].x + 6, marks[1].y);
      }
    };
    void draw().catch((err: Error) => ctx.fillText(err.message, 12, 24));
    return () => { cancel = true; };
  }, [study, level, width, zoom, marks]);

  if (!group || !study) return <p className="sd-muted">Снимков пока нет. Загрузите прицельный, ОПТГ, DICOM, STL или серию срезов.</p>;

  return (
    <div className="sd-stack">
      <div className="sd-chips">
        {series.map((item) => <button key={item.key} className={`sd-chip ${item.key === group.key ? 'info' : ''}`} type="button" onClick={() => setKey(item.key)}>{item.slices[0].title ?? item.slices[0].type}{item.slices[0].toothNum ? ` · ${item.slices[0].toothNum}` : ''}</button>)}
      </div>
      <canvas
        ref={canvas}
        width={320}
        height={240}
        style={{ width: '100%', maxWidth: 640, background: '#09090b', borderRadius: 8, cursor: 'crosshair' }}
        onClick={async (event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = ((event.clientX - rect.left) / rect.width) * 320;
          const y = ((event.clientY - rect.top) / rect.height) * 240;
          if (event.shiftKey) {
            const label = window.prompt('Подпись находки', study.toothNum ? `Зуб ${study.toothNum}` : 'Находка');
            if (!label) return;
            await api(`/flow/studies/${study.id}/annotations`, {
              method: 'POST',
              body: JSON.stringify({ kind: 'NOTE', label, x: x / 320 - 0.08, y: y / 240 - 0.08, w: 0.16, h: 0.16, sliceIndex: study.sliceIndex, toothNum: study.toothNum }),
            });
            await onChange();
            return;
          }
          setMarks((points) => points.length >= 2 ? [{ x, y }] : [...points, { x, y }]);
        }}
      />
      <div className="sd-split">
        <label className="sd-field">Срез {slice + 1}/{group.slices.length}<input type="range" min={0} max={Math.max(0, group.slices.length - 1)} value={Math.min(slice, group.slices.length - 1)} onChange={(event) => setSlice(Number(event.target.value))} /></label>
        <label className="sd-field">Масштаб<input type="range" min={1} max={3} step={0.1} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
        <label className="sd-field">Яркость / уровень<input type="range" min={0} max={100} value={level} onChange={(event) => setLevel(Number(event.target.value))} /></label>
        <label className="sd-field">Контраст / окно<input type="range" min={10} max={100} value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label>
      </div>
      <p className="sd-muted">Клик ставит точки измерения. Shift+клик — рамка находки. Жёлтая рамка — черновик, его можно принять или скрыть.</p>
      {study.annotations.map((mark) => (
        <div key={mark.id} className="sd-row" style={{ gridTemplateColumns: '1fr auto auto' }}>
          <span>{mark.source === 'AI' ? 'Черновик' : 'Врач'} · {mark.label}{mark.confidence ? ` · ${Math.round(mark.confidence * 100)}%` : ''}</span>
          {mark.source === 'AI' && <button className="sd-btn-ghost" type="button" onClick={async () => { await api(`/flow/annotations/${mark.id}/accept`, { method: 'POST' }); await onChange(); }}>Принять</button>}
          <button className="sd-btn-ghost" type="button" onClick={async () => { await api(`/flow/annotations/${mark.id}/hide`, { method: 'POST' }); await onChange(); }}>Скрыть</button>
        </div>
      ))}
    </div>
  );
}

function paintPhoto(ctx: CanvasRenderingContext2D, img: HTMLImageElement, level: number, width: number, zoom: number) {
  ctx.fillStyle = '#09090b';
  ctx.fillRect(0, 0, 320, 240);
  const scale = Math.min(320 / img.width, 240 / img.height) * zoom;
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.filter = `brightness(${0.5 + level / 100}) contrast(${width / 50})`;
  ctx.drawImage(img, (320 - w) / 2, (240 - h) / 2, w, h);
  ctx.filter = 'none';
}

function paintGray(ctx: CanvasRenderingContext2D, pixels: Uint8Array, width: number, height: number, level: number, windowWidth: number, zoom: number) {
  const image = ctx.createImageData(width, height);
  const center = (level / 100) * 255;
  const half = Math.max(1, (windowWidth / 100) * 255);
  for (let i = 0; i < pixels.length; i++) {
    const value = Math.min(255, Math.max(0, ((pixels[i] - center) / half) * 128 + 128));
    image.data[i * 4] = value;
    image.data[i * 4 + 1] = value;
    image.data[i * 4 + 2] = value;
    image.data[i * 4 + 3] = 255;
  }
  const off = document.createElement('canvas');
  off.width = width;
  off.height = height;
  off.getContext('2d')!.putImageData(image, 0, 0);
  ctx.fillStyle = '#09090b';
  ctx.fillRect(0, 0, 320, 240);
  const scale = Math.min(320 / width, 240 / height) * zoom;
  const w = width * scale;
  const h = height * scale;
  ctx.drawImage(off, (320 - w) / 2, (240 - h) / 2, w, h);
}

function paintMesh(ctx: CanvasRenderingContext2D, text: string, turn: number) {
  ctx.fillStyle = '#09090b';
  ctx.fillRect(0, 0, 320, 240);
  const verts: number[][] = [];
  if (text.includes('vertex')) {
    for (const line of text.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts[0] === 'vertex') verts.push([Number(parts[1]), Number(parts[2]), Number(parts[3])]);
    }
  }
  const angle = (turn / 100) * Math.PI * 2;
  ctx.strokeStyle = '#5eead4';
  ctx.beginPath();
  verts.forEach((vertex, index) => {
    const x = vertex[0] * Math.cos(angle) - vertex[2] * Math.sin(angle);
    const y = vertex[1];
    const px = 160 + x * 4;
    const py = 140 - y * 4;
    if (index % 3 === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
}

function parseDicom(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 132;
  let width = 64;
  let height = 64;
  let pixelOffset = -1;
  let pixelLength = 0;
  while (offset + 8 < bytes.length) {
    const group = view.getUint16(offset, true);
    const element = view.getUint16(offset + 2, true);
    const vr = String.fromCharCode(bytes[offset + 4], bytes[offset + 5]);
    let length = 0;
    let valueAt = offset + 8;
    if (['OB', 'OW', 'SQ', 'UN'].includes(vr)) {
      length = view.getUint32(offset + 8, true);
      valueAt = offset + 12;
    } else {
      length = view.getUint16(offset + 6, true);
    }
    if (group === 0x0028 && element === 0x0010) height = view.getUint16(valueAt, true);
    if (group === 0x0028 && element === 0x0011) width = view.getUint16(valueAt, true);
    if (group === 0x7fe0 && element === 0x0010) {
      pixelOffset = valueAt;
      pixelLength = length;
      break;
    }
    offset = valueAt + length + (length % 2);
  }
  if (pixelOffset < 0) throw new Error('В DICOM нет пикселей');
  return { width, height, pixels: bytes.slice(pixelOffset, pixelOffset + pixelLength) };
}
