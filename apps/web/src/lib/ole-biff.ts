export type BiffSheet = { name: string; headers: string[]; rows: string[][] };

const ENDOFCHAIN = 0xfffffffe;
const FREESECT = 0xffffffff;
const FATSECT = 0xfffffffd;
const DIFSECT = 0xfffffffc;

const CP1251 = [
  0x0402, 0x0403, 0x201a, 0x0453, 0x201e, 0x2026, 0x2020, 0x2021, 0x20ac, 0x2030, 0x0409, 0x2039, 0x040a, 0x040c, 0x040b, 0x040f,
  0x0452, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x0098, 0x2122, 0x0459, 0x203a, 0x045a, 0x045c, 0x045b, 0x045f,
  0x00a0, 0x040e, 0x045e, 0x0408, 0x00a4, 0x0490, 0x00a6, 0x00a7, 0x0401, 0x00a9, 0x0404, 0x00ab, 0x00ac, 0x00ad, 0x00ae, 0x0407,
  0x00b0, 0x00b1, 0x0406, 0x0456, 0x0491, 0x00b5, 0x00b6, 0x00b7, 0x0451, 0x2116, 0x0454, 0x00bb, 0x0458, 0x0405, 0x0455, 0x0457,
  0x0410, 0x0411, 0x0412, 0x0413, 0x0414, 0x0415, 0x0416, 0x0417, 0x0418, 0x0419, 0x041a, 0x041b, 0x041c, 0x041d, 0x041e, 0x041f,
  0x0420, 0x0421, 0x0422, 0x0423, 0x0424, 0x0425, 0x0426, 0x0427, 0x0428, 0x0429, 0x042a, 0x042b, 0x042c, 0x042d, 0x042e, 0x042f,
  0x0430, 0x0431, 0x0432, 0x0433, 0x0434, 0x0435, 0x0436, 0x0437, 0x0438, 0x0439, 0x043a, 0x043b, 0x043c, 0x043d, 0x043e, 0x043f,
  0x0440, 0x0441, 0x0442, 0x0443, 0x0444, 0x0445, 0x0446, 0x0447, 0x0448, 0x0449, 0x044a, 0x044b, 0x044c, 0x044d, 0x044e, 0x044f,
];

type StreamInfo = { name: string; size: number; chainBytes: number; data: Uint8Array };

/** Read a BIFF8 workbook, including an OLE2 file whose sector chains overlap. */
export function readBiffSheets(input: ArrayBuffer | Uint8Array): BiffSheet[] {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const stream = workbookBytes(bytes);
  if (!stream) return [];
  return parseBiff(stream);
}

export function oleStreams(input: ArrayBuffer | Uint8Array): { name: string; size: number; chainBytes: number; recovered: number }[] {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (!isOle(bytes)) return [];
  return readStreams(bytes).map((stream) => ({
    name: stream.name,
    size: stream.size,
    chainBytes: stream.chainBytes,
    recovered: stream.data.length,
  }));
}

function workbookBytes(bytes: Uint8Array) {
  if (!isOle(bytes)) return startsWithBof(bytes) ? bytes : sliceAtBof(bytes);
  const streams = readStreams(bytes);
  const named = streams.find((stream) => stream.name === 'Workbook' || stream.name === 'Book');
  if (named && startsWithBof(named.data)) return named.data;
  const bofStreams = streams
    .map((stream) => ({ stream, at: findBof(stream.data) }))
    .filter((item) => item.at >= 0)
    .sort((a, b) => (b.stream.data.length - b.at) - (a.stream.data.length - a.at));
  if (bofStreams[0]) return bofStreams[0].stream.data.subarray(bofStreams[0].at);
  const largest = [...streams].sort((a, b) => b.data.length - a.data.length)[0];
  return largest ? sliceAtBof(largest.data) : null;
}

function isOle(bytes: Uint8Array) {
  return bytes.length > 512 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
}

function startsWithBof(bytes: Uint8Array) {
  return findBof(bytes) === 0;
}

function sliceAtBof(bytes: Uint8Array) {
  const at = findBof(bytes);
  return at >= 0 ? bytes.subarray(at) : null;
}

function findBof(bytes: Uint8Array) {
  const limit = Math.min(bytes.length - 4, 64);
  for (let index = 0; index <= limit; index += 1) {
    if (bytes[index] === 0x09 && bytes[index + 1] === 0x08) {
      const len = u16(bytes, index + 2);
      if (len === 8 || len === 16) return index;
    }
  }
  return -1;
}

function readStreams(bytes: Uint8Array): StreamInfo[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const shift = view.getUint16(0x1e, true);
  const sectorSize = 1 << shift;
  const fatCount = view.getUint32(0x2c, true);
  const dirStart = view.getUint32(0x30, true);
  const fat = loadFat(view, sectorSize, fatCount);
  const dir = readChain(bytes, fat, sectorSize, dirStart, 0);
  const streams: StreamInfo[] = [];
  for (let offset = 0; offset + 128 <= dir.length; offset += 128) {
    const nameLen = u16(dir, offset + 64);
    if (!nameLen) continue;
    const name = decodeUtf16(dir.subarray(offset, offset + Math.min(64, nameLen - 2)));
    const type = dir[offset + 66];
    const start = u32(dir, offset + 116);
    const size = u32(dir, offset + 120);
    if (type !== 2 || size === 0 || start >= 0xfffffff0) continue;
    const naive = readChain(bytes, fat, sectorSize, start, size, false);
    const data = readChain(bytes, fat, sectorSize, start, size, true);
    streams.push({ name, size, chainBytes: naive.length, data });
  }
  return streams;
}

function loadFat(view: DataView, sectorSize: number, fatCount: number) {
  const sectors: number[] = [];
  for (let index = 0; index < 109 && sectors.length < fatCount; index += 1) {
    const id = view.getUint32(0x4c + index * 4, true);
    if (id >= FREESECT) break;
    sectors.push(id);
  }
  let difat = view.getUint32(0x44, true);
  const difatCount = view.getUint32(0x48, true);
  for (let index = 0; index < difatCount && difat < 0xfffffff0 && sectors.length < fatCount; index += 1) {
    const offset = 512 + difat * sectorSize;
    const entries = sectorSize / 4 - 1;
    for (let entry = 0; entry < entries && sectors.length < fatCount; entry += 1) {
      const id = view.getUint32(offset + entry * 4, true);
      if (id < FREESECT) sectors.push(id);
    }
    difat = view.getUint32(offset + sectorSize - 4, true);
  }
  const fat: number[] = [];
  for (const sector of sectors) {
    const offset = 512 + sector * sectorSize;
    for (let index = 0; index < sectorSize; index += 4) fat.push(view.getUint32(offset + index, true));
  }
  return fat;
}

function readChain(bytes: Uint8Array, fat: number[], sectorSize: number, start: number, size: number, tolerant = false) {
  const chunks: Uint8Array[] = [];
  let sector = start;
  let collected = 0;
  const seen = new Set<number>();
  const target = size > 0 ? size : Number.MAX_SAFE_INTEGER;
  while (sector < 0xfffffff0 && collected < target && chunks.length < 100000) {
    if (seen.has(sector)) break;
    seen.add(sector);
    const offset = 512 + sector * sectorSize;
    if (offset >= bytes.length) break;
    const take = Math.min(sectorSize, bytes.length - offset);
    chunks.push(bytes.subarray(offset, offset + take));
    collected += take;
    const next = fat[sector] ?? ENDOFCHAIN;
    if (next >= 0xfffffff0 || next === FATSECT || next === DIFSECT) break;
    sector = next;
  }
  if (tolerant && size > collected) {
    let next = sector < 0xfffffff0 ? sector + 1 : start + chunks.length;
    while (collected < size && next < fat.length && chunks.length < 100000) {
      const kind = fat[next] ?? FREESECT;
      if (kind === FATSECT || kind === DIFSECT) {
        next += 1;
        continue;
      }
      const offset = 512 + next * sectorSize;
      if (offset >= bytes.length) break;
      const take = Math.min(sectorSize, bytes.length - offset);
      chunks.push(bytes.subarray(offset, offset + take));
      collected += take;
      next += 1;
    }
  }
  const joined = concat(chunks);
  return size > 0 && joined.length > size ? joined.subarray(0, size) : joined;
}

type Cell = { row: number; col: number; value: string };

function parseBiff(bytes: Uint8Array): BiffSheet[] {
  const sheets: BiffSheet[] = [];
  const names: string[] = [];
  let sst: string[] = [];
  let codepage = 1252;
  let date1904 = false;
  const dateXf = new Set<number>();
  const formats = new Map<number, string>();
  let cells: Map<number, Map<number, string>> | null = null;
  let xfIndex = 0;

  let offset = 0;
  while (offset + 4 <= bytes.length) {
    const type = u16(bytes, offset);
    const len = u16(bytes, offset + 2);
    if (offset + 4 + len > bytes.length) break;
    const data = bytes.subarray(offset + 4, offset + 4 + len);
    offset += 4 + len;
    if (type === 0x00fc) {
      const chunks = [data];
      while (offset + 4 <= bytes.length && u16(bytes, offset) === 0x003c) {
        const cont = u16(bytes, offset + 2);
        if (offset + 4 + cont > bytes.length) break;
        chunks.push(bytes.subarray(offset + 4, offset + 4 + cont));
        offset += 4 + cont;
      }
      sst = parseSst(chunks, codepage);
      continue;
    }
    if (type === 0x0809 && data.length >= 4) {
      const kind = u16(data, 2);
      if (kind === 0x0010 || kind === 0x0020) {
        if (cells) sheets.push(toSheet(names[sheets.length] || `Лист ${sheets.length + 1}`, cells));
        cells = new Map();
      } else cells = null;
      continue;
    }
    if (type === 0x000a) {
      if (cells) {
        sheets.push(toSheet(names[sheets.length] || `Лист ${sheets.length + 1}`, cells));
        cells = null;
      }
      continue;
    }
    if (type === 0x0085) {
      names.push(shortString(data.subarray(6), codepage));
      continue;
    }
    if (type === 0x0042 && data.length >= 2) {
      const page = u16(data, 0);
      codepage = page === 0x04e3 || page === 0x04e2 ? 1251 : page === 0x04e4 ? 1252 : page === 0x04b0 ? 1200 : page;
      continue;
    }
    if (type === 0x0022 && data.length >= 2) {
      date1904 = u16(data, 0) === 1;
      continue;
    }
    if (type === 0x041e && data.length >= 2) {
      formats.set(u16(data, 0), unicodeString(data.subarray(2), codepage));
      continue;
    }
    if (type === 0x00e0 && data.length >= 4) {
      const fmt = u16(data, 2);
      if (isDateFormat(fmt, formats.get(fmt) ?? '')) dateXf.add(xfIndex);
      xfIndex += 1;
      continue;
    }
    if (!cells) continue;
    const found = type === 0x00bd ? parseMulRk(data, dateXf, date1904) : readCell(type, data, sst, dateXf, date1904, codepage);
    for (const cell of found) {
      const row = cells.get(cell.row) ?? new Map<number, string>();
      row.set(cell.col, cell.value);
      cells.set(cell.row, row);
    }
  }
  if (cells && cells.size) sheets.push(toSheet(names[sheets.length] || `Лист ${sheets.length + 1}`, cells));
  return sheets.filter((sheet) => sheet.headers.some(Boolean) || sheet.rows.length > 0);
}

function readCell(type: number, data: Uint8Array, sst: string[], dateXf: Set<number>, date1904: boolean, codepage: number): Cell[] {
  if (data.length < 6) return [];
  const row = u16(data, 0);
  const col = u16(data, 2);
  const xf = u16(data, 4);
  if (type === 0x00fd && data.length >= 10) return [{ row, col, value: sst[u32(data, 6)] ?? '' }];
  if (type === 0x0204) return [{ row, col, value: unicodeString(data.subarray(6), codepage) }];
  if (type === 0x0203 && data.length >= 14) return [{ row, col, value: formatNumber(f64(data, 6), dateXf.has(xf), date1904) }];
  if (type === 0x027e && data.length >= 10) return [{ row, col, value: formatNumber(decodeRk(u32(data, 6)), dateXf.has(xf), date1904) }];
  if (type === 0x0006 && data.length >= 14 && data[12] !== 0xff) return [{ row, col, value: formatNumber(f64(data, 6), dateXf.has(xf), date1904) }];
  return [];
}

function parseMulRk(data: Uint8Array, dateXf: Set<number>, date1904: boolean): Cell[] {
  if (data.length < 6) return [];
  const row = u16(data, 0);
  let col = u16(data, 2);
  const cells: Cell[] = [];
  let offset = 4;
  while (offset + 6 <= data.length - 2) {
    const xf = u16(data, offset);
    cells.push({ row, col, value: formatNumber(decodeRk(u32(data, offset + 2)), dateXf.has(xf), date1904) });
    col += 1;
    offset += 6;
  }
  return cells;
}

function parseSst(chunks: Uint8Array[], codepage: number) {
  const bounds: number[] = [];
  let total = 0;
  for (const chunk of chunks) {
    bounds.push(total);
    total += chunk.length;
  }
  const buf = concat(chunks);
  const unique = buf.length >= 8 ? u32(buf, 4) : 0;
  const boundaries = bounds.filter((bound) => bound > 0);
  let pos = 8;
  const strings: string[] = [];
  for (let index = 0; index < unique && pos + 3 <= buf.length; index += 1) {
    const read = readRichString(buf, pos, boundaries, codepage);
    strings.push(read.text);
    pos = read.pos;
  }
  return strings;
}

function readRichString(buf: Uint8Array, start: number, boundaries: number[], codepage: number) {
  let pos = start;
  const chars = u16(buf, pos);
  pos += 2;
  const flags = buf[pos] ?? 0;
  pos += 1;
  let wide = (flags & 0x1) !== 0;
  const runs = flags & 0x8 ? u16(buf, pos) : 0;
  if (flags & 0x8) pos += 2;
  const ext = flags & 0x4 ? u32(buf, pos) : 0;
  if (flags & 0x4) pos += 4;
  let text = '';
  let left = chars;
  while (left > 0 && pos < buf.length) {
    if (boundaries.includes(pos)) {
      wide = (buf[pos] & 0x1) !== 0;
      pos += 1;
      continue;
    }
    const next = nextBound(pos, boundaries, buf.length);
    const width = wide ? 2 : 1;
    const room = Math.floor((next - pos) / width);
    const take = Math.min(left, room);
    if (take <= 0) break;
    text += wide ? decodeUtf16(buf.subarray(pos, pos + take * 2)) : decodeBytes(buf.subarray(pos, pos + take), codepage);
    pos += take * width;
    left -= take;
  }
  pos += runs * 4 + ext;
  return { text, pos };
}

function nextBound(pos: number, boundaries: number[], length: number) {
  let next = length;
  for (const bound of boundaries) if (bound > pos && bound < next) next = bound;
  return next;
}

function toSheet(name: string, cells: Map<number, Map<number, string>>): BiffSheet {
  let minRow = Number.POSITIVE_INFINITY;
  let maxRow = 0;
  let maxCol = 0;
  for (const [row, cols] of cells) {
    minRow = Math.min(minRow, row);
    maxRow = Math.max(maxRow, row);
    for (const [col, value] of cols) if (value.trim()) maxCol = Math.max(maxCol, col);
  }
  if (!Number.isFinite(minRow)) return { name, headers: [], rows: [] };
  const width = maxCol + 1;
  const headers = readRow(cells.get(minRow), width);
  const rows: string[][] = [];
  for (let row = minRow + 1; row <= maxRow; row += 1) {
    const values = readRow(cells.get(row), width);
    if (values.some((value) => value.trim())) rows.push(values);
  }
  return { name, headers, rows };
}

function readRow(cols: Map<number, string> | undefined, width: number) {
  const row: string[] = [];
  for (let col = 0; col < width; col += 1) row.push((cols?.get(col) ?? '').trim());
  return row;
}

function isDateFormat(id: number, pattern: string) {
  if ((id >= 14 && id <= 22) || (id >= 27 && id <= 36) || (id >= 45 && id <= 47) || (id >= 50 && id <= 58)) return true;
  return /[dmy]/i.test(pattern) && !/[hns]/i.test(pattern.replace(/\[.*?\]/g, ''));
}

function formatNumber(value: number, date: boolean, date1904: boolean) {
  if (!Number.isFinite(value)) return '';
  if (date) {
    const epoch = Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30);
    const stamp = new Date(epoch + Math.floor(value) * 86400000);
    const year = stamp.getUTCFullYear();
    if (year >= 1900 && year <= 2100) {
      const month = String(stamp.getUTCMonth() + 1).padStart(2, '0');
      const day = String(stamp.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }
  if (Math.abs(value) < 1e15 && Math.abs(value - Math.round(value)) < 1e-6) return String(Math.round(value));
  return String(Math.round(value * 1e6) / 1e6);
}

function decodeRk(value: number) {
  if (value & 2) {
    let integer = value >>> 2;
    if (integer & 0x20000000) integer -= 0x40000000;
    return (value & 1) ? integer / 100 : integer;
  }
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, value & 0xfffffffc, true);
  const number = view.getFloat64(0, true);
  return (value & 1) ? number / 100 : number;
}

function shortString(data: Uint8Array, codepage: number) {
  if (data.length < 2) return '';
  const chars = data[0] ?? 0;
  const wide = (data[1] & 1) !== 0;
  const width = wide ? 2 : 1;
  const body = data.subarray(2, 2 + chars * width);
  return (wide ? decodeUtf16(body) : decodeBytes(body, codepage)).replace(/\0/g, '');
}

function unicodeString(data: Uint8Array, codepage: number) {
  if (data.length < 3) return '';
  const chars = u16(data, 0);
  const wide = (data[2] & 1) !== 0;
  const body = data.subarray(3, 3 + chars * (wide ? 2 : 1));
  return wide ? decodeUtf16(body) : decodeBytes(body, codepage);
}

function decodeBytes(data: Uint8Array, codepage: number) {
  let text = '';
  for (const byte of data) {
    text += codepage === 1251 && byte >= 0x80 ? String.fromCharCode(CP1251[byte - 0x80] ?? byte) : String.fromCharCode(byte);
  }
  return text;
}

function decodeUtf16(data: Uint8Array) {
  let text = '';
  for (let index = 0; index + 1 < data.length; index += 2) text += String.fromCharCode(u16(data, index));
  return text;
}

function concat(parts: Uint8Array[]) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function u16(bytes: Uint8Array, offset: number) {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function u32(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16) | ((bytes[offset + 3] ?? 0) << 24)) >>> 0;
}

function f64(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getFloat64(0, true);
}
