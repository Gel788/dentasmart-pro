import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import { oleStreams, readBiffSheets } from './ole-biff.ts';
import { FIXTURE_DATA_ROWS, FIXTURE_PATIENTS, buildCorruptSqns } from './ole-fixture.ts';
import { guessPatientMap, readPatients } from './migrate.ts';

const bytes = buildCorruptSqns();
const streams = oleStreams(bytes);
const workbook = streams.find((stream) => stream.name === 'Workbook');

assert.ok(workbook, 'Workbook stream is present');
assert.equal(workbook.recovered, workbook.size);
assert.ok(workbook.chainBytes >= workbook.size, 'the shared FAT chain still covers the workbook');

const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
assert.equal(view.getUint32(0x28, true), 0, 'directory sector count stays 0, as in the corrupt export');
assert.equal(view.getUint32(0x30, true), 2);
const workbookStart = new DataView(bytes.buffer, bytes.byteOffset + 512 + 2 * 512 + 128).getUint32(116, true);
const rootStart = new DataView(bytes.buffer, bytes.byteOffset + 512 + 2 * 512).getUint32(116, true);
assert.equal(rootStart, 1);
assert.equal(workbookStart, 3);
assert.equal(new DataView(bytes.buffer, bytes.byteOffset + 512).getUint32(3 * 4, true), 4, 'FAT[3] == 4, the overlap xlrd reports');
assert.equal(new DataView(bytes.buffer, bytes.byteOffset + 512).getUint32(1 * 4, true), 3, 'the root chain already owns the workbook sector');

const sheets = readBiffSheets(bytes);
assert.equal(sheets[0]?.name, 'Пациенты');
assert.equal(sheets[0]?.rows.length, FIXTURE_DATA_ROWS);
const parsed = readPatients({ headers: sheets[0].headers, rows: sheets[0].rows }, guessPatientMap(sheets[0].headers));
assert.equal(parsed.rows.length, FIXTURE_PATIENTS);
assert.equal(parsed.issues.filter((issue) => issue.reason === 'Служебная строка').length, 1);
assert.ok(parsed.rows.some((row) => !row.phone), 'a named row without a phone still counts');

const truncated = new Uint8Array(bytes);
new DataView(truncated.buffer).setUint32(512 + 3 * 4, 0xfffffffe, true);
assert.equal(readBiffSheets(truncated)[0]?.rows.length, FIXTURE_DATA_ROWS, 'a chain that ends early still yields every row');

const full = XLSX.read(Buffer.from(bytes), { type: 'buffer', WTF: true, cellNF: true });
const fullGrid = XLSX.utils.sheet_to_json(full.Sheets[full.SheetNames[0]], { header: 1, raw: false, defval: '' });
const fullRows = fullGrid.filter((row) => row.some((cell) => String(cell ?? '').trim())).length - 1;
assert.equal(fullRows, FIXTURE_DATA_ROWS, 'the overlapping chain itself still contains every row');

let sheetJsRows = 0;
try {
  const book = XLSX.read(Buffer.from(truncated), { type: 'buffer', WTF: true, cellNF: true });
  const grid = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1, raw: false, defval: '' });
  sheetJsRows = grid.filter((row) => row.some((cell) => String(cell ?? '').trim())).length - 1;
} catch {
  sheetJsRows = 0;
}
assert.ok(sheetJsRows < FIXTURE_DATA_ROWS, `SheetJS kept ${sheetJsRows} rows of a short chain`);

console.log(`sqns corrupt fixture: ${parsed.rows.length} patients, ${FIXTURE_DATA_ROWS} data rows`);
