const SECTOR = 512;
const PATIENTS = 48;

export const FIXTURE_PATIENTS = PATIENTS;
export const FIXTURE_DATA_ROWS = PATIENTS + 1;

/** Anonymized SQNS workbook whose OLE2 chains overlap the way the real export does. */
export function buildCorruptSqns(): Uint8Array {
  return wrapOle(buildWorkbook());
}

function buildWorkbook() {
  const strings: string[] = [];
  const refs: { row: number; col: number; index: number }[] = [];
  const numbers: { row: number; col: number; value: number }[] = [];
  const intern = (value: string) => {
    let index = strings.indexOf(value);
    if (index < 0) {
      strings.push(value);
      index = strings.length - 1;
    }
    return index;
  };
  const text = (row: number, col: number, value: string) => refs.push({ row, col, index: intern(value) });
  ['№', 'Фамилия', 'Имя', 'Телефон', 'Визитов', 'Дата последнего визита'].forEach((header, col) => text(0, col, header));
  numbers.push({ row: 1, col: 0, value: 1 });
  text(1, 1, 'Физическое лицо');
  numbers.push({ row: 1, col: 4, value: 0 });
  for (let index = 1; index <= PATIENTS; index += 1) {
    const row = index + 1;
    numbers.push({ row, col: 0, value: index });
    text(row, 1, `Фамилия${index}`);
    text(row, 2, `Имя${index}`);
    if (index % 2 === 0) text(row, 3, `+7900100${String(index).padStart(4, '0')}`);
    numbers.push({ row, col: 4, value: index % 3 === 0 ? 0 : 2 });
    if (index % 4 !== 0) text(row, 5, '2024-06-01');
  }
  const sst = splitSst(concat([u32(refs.length), u32(strings.length), ...strings.map(encodeUtf16)]));
  const sheetName = encodeShort('Пациенты');
  const head = concat([
    bof(0x0005),
    record(0x0042, u16(0x04b0)),
    record(0x0022, u16(0)),
    record(0x00e0, new Uint8Array(20)),
  ]);
  const eof = record(0x000a, new Uint8Array());
  const sheetOffset = head.length + (4 + 6 + sheetName.length) + sst.length + eof.length;
  const bound = record(0x0085, concat([u32(sheetOffset), new Uint8Array([0, 0]), sheetName]));
  const cells = concat([
    bof(0x0010),
    ...numbers.map((cell) => record(0x0203, numberCell(cell.row, cell.col, cell.value))),
    ...refs.map((cell) => record(0x00fd, labelCell(cell.row, cell.col, cell.index))),
    eof,
  ]);
  return concat([head, bound, sst, eof, cells]);
}

function splitSst(payload: Uint8Array) {
  let pos = 8;
  while (pos + 3 < payload.length) {
    const chars = payload[pos] | (payload[pos + 1] << 8);
    const wide = (payload[pos + 2] & 1) !== 0;
    const start = pos + 3;
    const bytes = chars * (wide ? 2 : 1);
    if (wide && chars >= 4) {
      const cut = start + 2;
      const tail = new Uint8Array(1 + payload.length - cut);
      tail[0] = 1;
      tail.set(payload.subarray(cut), 1);
      return concat([record(0x00fc, payload.subarray(0, cut)), record(0x003c, tail)]);
    }
    pos = start + bytes;
  }
  return record(0x00fc, payload);
}

function wrapOle(workbook: Uint8Array) {
  const sectors = Math.ceil(workbook.length / SECTOR);
  const first = 3;
  const last = first + sectors - 1;
  const file = new Uint8Array(SECTOR + (last + 1) * SECTOR);
  const view = new DataView(file.buffer);
  [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].forEach((byte, index) => { file[index] = byte; });
  view.setUint16(0x18, 0x003e, true);
  view.setUint16(0x1a, 0x0003, true);
  view.setUint16(0x1c, 0xfffe, true);
  view.setUint16(0x1e, 9, true);
  view.setUint16(0x20, 6, true);
  view.setUint32(0x28, 0, true);
  view.setUint32(0x2c, 1, true);
  view.setUint32(0x30, 2, true);
  view.setUint32(0x38, 4096, true);
  view.setUint32(0x3c, 0xfffffffe, true);
  view.setUint32(0x44, 0xfffffffe, true);
  view.setUint32(0x4c, 0, true);
  for (let index = 1; index < 109; index += 1) view.setUint32(0x4c + index * 4, 0xffffffff, true);

  const fat = new DataView(file.buffer, SECTOR, SECTOR);
  for (let index = 0; index < SECTOR / 4; index += 1) fat.setUint32(index * 4, 0xffffffff, true);
  fat.setUint32(0, 0xfffffffd, true);
  fat.setUint32(2 * 4, 0xfffffffe, true);
  fat.setUint32(1 * 4, 3, true);
  for (let sector = 3; sector < last; sector += 1) fat.setUint32(sector * 4, sector + 1, true);
  fat.setUint32(last * 4, 0xfffffffe, true);

  const dir = new DataView(file.buffer, SECTOR + 2 * SECTOR, SECTOR);
  writeEntry(dir, 0, 'Root Entry', 5, 1, (last - 1) * SECTOR, 1);
  writeEntry(dir, 1, 'Workbook', 2, 3, workbook.length);
  file.set(workbook, SECTOR + first * SECTOR);
  return file;
}

function writeEntry(dir: DataView, index: number, name: string, type: number, start: number, size: number, child = 0xffffffff, right = 0xffffffff) {
  const offset = index * 128;
  for (let char = 0; char < name.length; char += 1) dir.setUint16(offset + char * 2, name.charCodeAt(char), true);
  dir.setUint16(offset + 64, (name.length + 1) * 2, true);
  dir.setUint8(offset + 66, type);
  dir.setUint8(offset + 67, 1);
  dir.setUint32(offset + 68, 0xffffffff, true);
  dir.setUint32(offset + 72, right, true);
  dir.setUint32(offset + 76, child, true);
  dir.setUint32(offset + 116, start, true);
  dir.setUint32(offset + 120, size, true);
}

function bof(kind: number) {
  const payload = new Uint8Array([0x00, 0x06, kind & 0xff, kind >> 8, 0x62, 0x72, 0xcd, 0x07, 0x09, 0xc0, 0x01, 0x00, 0x06, 0x07, 0x00, 0x00]);
  return record(0x0809, payload);
}

function labelCell(row: number, col: number, index: number) {
  const payload = new Uint8Array(10);
  const view = new DataView(payload.buffer);
  view.setUint16(0, row, true);
  view.setUint16(2, col, true);
  view.setUint32(6, index, true);
  return payload;
}

function numberCell(row: number, col: number, value: number) {
  const payload = new Uint8Array(14);
  const view = new DataView(payload.buffer);
  view.setUint16(0, row, true);
  view.setUint16(2, col, true);
  view.setFloat64(6, value, true);
  return payload;
}

function encodeUtf16(value: string) {
  const out = new Uint8Array(3 + value.length * 2);
  out[0] = value.length & 0xff;
  out[1] = value.length >> 8;
  out[2] = 1;
  for (let index = 0; index < value.length; index += 1) {
    out[3 + index * 2] = value.charCodeAt(index) & 0xff;
    out[4 + index * 2] = value.charCodeAt(index) >> 8;
  }
  return out;
}

function encodeShort(value: string) {
  const out = new Uint8Array(2 + value.length * 2);
  out[0] = value.length;
  out[1] = 1;
  for (let index = 0; index < value.length; index += 1) {
    out[2 + index * 2] = value.charCodeAt(index) & 0xff;
    out[3 + index * 2] = value.charCodeAt(index) >> 8;
  }
  return out;
}

function record(type: number, payload: Uint8Array) {
  const out = new Uint8Array(4 + payload.length);
  out[0] = type & 0xff;
  out[1] = type >> 8;
  out[2] = payload.length & 0xff;
  out[3] = payload.length >> 8;
  out.set(payload, 4);
  return out;
}

function u16(value: number) {
  return new Uint8Array([value & 0xff, value >> 8]);
}

function u32(value: number) {
  return new Uint8Array([value & 0xff, value >> 8, value >> 16, value >> 24]);
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
