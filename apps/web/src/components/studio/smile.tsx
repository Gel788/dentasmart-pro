'use client';

import { useEffect, useRef, useState } from 'react';

export function SmilePreview({ sampleUrl }: { sampleUrl?: string | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const photo = useRef<HTMLImageElement | null>(null);
  const [amount, setAmount] = useState(72);
  const [label, setLabel] = useState('Загрузите фото улыбки или откройте пример');
  const [ready, setReady] = useState(false);

  const paint = (value: number) => {
    const surface = canvas.current;
    const image = photo.current;
    if (!surface || !image) return;
    const ctx = surface.getContext('2d');
    if (!ctx) return;
    const width = surface.width;
    const height = surface.height;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    if (value <= 0) return;
    const off = document.createElement('canvas');
    off.width = width;
    off.height = height;
    const glow = off.getContext('2d');
    if (!glow) return;
    glow.filter = `brightness(${1 + value / 180}) contrast(${1 + value / 700}) saturate(${1 - value / 260})`;
    glow.drawImage(image, 0, 0, width, height);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(width * 0.5, height * 0.58, width * 0.27, height * 0.14, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalAlpha = value / 100;
    ctx.drawImage(off, 0, 0);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = (value / 100) * 0.9;
    drawArch(ctx, width, height);
    ctx.restore();
  };

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      photo.current = image;
      setLabel(sampleUrl ? 'Фото из карты пациента' : 'Пример улыбки');
      setReady(true);
    };
    image.onerror = () => {
      const fallback = new Image();
      fallback.onload = () => {
        photo.current = fallback;
        setLabel('Пример улыбки');
        setReady(true);
      };
      fallback.src = drawSample();
    };
    image.src = sampleUrl || drawSample();
  }, [sampleUrl]);

  useEffect(() => { paint(amount); }, [amount, ready]);

  const load = (src: string, caption: string) => {
    const image = new Image();
    image.onload = () => {
      photo.current = image;
      setLabel(caption);
      setReady(true);
      paint(amount);
    };
    image.src = src;
  };

  const onFile = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => load(String(reader.result), file.name);
    reader.readAsDataURL(file);
  };

  return (
    <div className="wow-smile">
      <div className="wow-smile-head">
        <div>
          <span className="wow-demo">Симуляция</span>
          <strong>Smile Preview</strong>
          <p>{label}. Это фильтр и шаблон зубов, не обещание результата.</p>
        </div>
        <div className="wow-smile-actions">
          <label className="sd-btn-ghost">
            Загрузить фото
            <input type="file" accept="image/*" hidden onChange={(event) => onFile(event.target.files?.[0])} />
          </label>
          <button className="sd-btn" type="button" onClick={() => load(sampleUrl || drawSample(), sampleUrl ? 'Фото из карты' : 'Пример улыбки')}>Пример</button>
        </div>
      </div>
      <canvas ref={canvas} width={880} height={520} />
      <label className="wow-slider">
        <span>Сейчас</span>
        <input type="range" min={0} max={100} value={amount} onChange={(event) => setAmount(Number(event.target.value))} />
        <span>После</span>
      </label>
    </div>
  );
}

function drawArch(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const cx = width * 0.5;
  const cy = height * 0.58;
  for (let index = -4; index <= 3; index += 1) {
    const t = index + 0.5;
    const x = cx + t * width * 0.055;
    const y = cy + (t * t) * height * 0.004 - height * 0.02;
    ctx.fillStyle = '#f8faf8';
    ctx.strokeStyle = 'rgba(15, 118, 110, 0.35)';
    ctx.lineWidth = 1.5;
    roundTooth(ctx, x, y, width * 0.042, height * 0.09);
  }
}

function roundTooth(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.quadraticCurveTo(x - w / 2, y - h, x, y - h * 0.92);
  ctx.quadraticCurveTo(x + w / 2, y - h, x + w / 2, y);
  ctx.quadraticCurveTo(x, y + h * 0.35, x - w / 2, y);
  ctx.fill();
  ctx.stroke();
}

function drawSample() {
  const canvas = document.createElement('canvas');
  canvas.width = 880;
  canvas.height = 520;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const sky = ctx.createLinearGradient(0, 0, 0, 520);
  sky.addColorStop(0, '#d9efe9');
  sky.addColorStop(1, '#f6f1e7');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 880, 520);
  ctx.fillStyle = '#f3d2c2';
  ctx.beginPath();
  ctx.ellipse(440, 300, 210, 250, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c98484';
  ctx.beginPath();
  ctx.ellipse(440, 330, 120, 46, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#efe6d4';
  ctx.fillRect(330, 292, 220, 36);
  ctx.fillStyle = '#d7c7a4';
  for (let index = 0; index < 8; index += 1) ctx.fillRect(338 + index * 26, 294, 22, 30);
  return canvas.toDataURL('image/png');
}
