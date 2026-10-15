export type Sheet = { headers: string[]; rows: string[][] };

export async function readTable(file: File): Promise<Sheet> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx')) return readXlsx(await file.arrayBuffer());
  const text = await file.text();
  return parseDelimited(text, text.includes('\t') && !text.includes(',') ? '\t' : detectComma(text));
}

export function parseDelimited(text: string, delimiter: string): Sheet {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  const cells = lines.map((line) => splitLine(line, delimiter));
  const headers = cells[0] ?? [];
  return { headers, rows: cells.slice(1) };
}

function detectComma(text: string) {
  const first = text.split(/\r?\n/)[0] ?? '';
  return first.split(';').length > first.split(',').length ? ';' : ',';
}

function splitLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = '';
    } else current += char;
  }
  cells.push(current.trim());
  return cells;
}

async function readXlsx(buf: ArrayBuffer): Promise<Sheet> {
  const files = await unzip(buf);
  const shared = decodeXml(files.get('xl/sharedStrings.xml'));
  const strings = [...shared.matchAll(/<si[\s\S]*?<\/si>/g)].map((match) =>
    [...match[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decode(part[1] ?? '')).join(''),
  );
  const sheetName = [...files.keys()].find((name) => /xl\/worksheets\/sheet1\.xml$/.test(name)) ?? 'xl/worksheets/sheet1.xml';
  const sheet = decodeXml(files.get(sheetName));
  const rows: string[][] = [];
  for (const row of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cell of row[1].matchAll(/<c([^>]*)>(?:<v>([\s\S]*?)<\/v>)?/g)) {
      const ref = /r="([A-Z]+)\d+"/.exec(cell[1] ?? '')?.[1] ?? '';
      const index = columnIndex(ref);
      const type = /t="([^"]+)"/.exec(cell[1] ?? '')?.[1];
      const raw = cell[2] ?? '';
      cells[index] = type === 's' ? strings[Number(raw)] ?? '' : decode(raw);
    }
    rows.push(cells.map((cell) => cell ?? ''));
  }
  return { headers: rows[0] ?? [], rows: rows.slice(1).filter((row) => row.some(Boolean)) };
}

function columnIndex(ref: string) {
  return ref.split('').reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function decode(value: string) {
  return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#10;/g, '\n');
}

function decodeXml(bytes?: Uint8Array) {
  return new TextDecoder().decode(bytes ?? new Uint8Array());
}

async function unzip(buf: ArrayBuffer) {
  const view = new DataView(buf);
  const files = new Map<string, Uint8Array>();
  let offset = 0;
  while (offset + 30 < view.byteLength) {
    if (view.getUint32(offset, true) !== 0x04034b50) break;
    const method = view.getUint16(offset + 8, true);
    const size = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(new Uint8Array(buf, offset + 30, nameLen));
    const start = offset + 30 + nameLen + extraLen;
    const compressed = new Uint8Array(buf.slice(start, start + size));
    files.set(name, method === 0 ? compressed : await inflate(compressed));
    offset = start + size;
  }
  return files;
}

async function inflate(bytes: Uint8Array) {
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
