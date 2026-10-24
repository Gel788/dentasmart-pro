import assert from 'node:assert/strict';
import { guessPatientMap, readPatients } from './migrate.ts';

const headers = ['Фамилия', 'Имя', 'Телефон', 'День рождения', 'Пол', 'Тип', 'Сумма продаж'];
const sheet = {
  headers,
  rows: [
    ['Арутюнян', 'Нарек', '+7(900)111-22-33', '12.03', 'Муж', 'потенциальные', '0'],
    ['Петросян', 'Анна', '', '05.11.1990', 'Жен', 'отказавшиеся', '45000'],
  ],
};
const { rows, issues } = readPatients(sheet, guessPatientMap(headers));

assert.equal(rows[0].birthDate, '', 'a birthday without a year is not a date');
assert.equal(rows[0].comment, 'День рождения 12.03, год не указан', 'it is kept on the card instead');
assert.ok(issues.some((issue) => issue.reason === 'День рождения без года' && issue.level === 'warn'));
assert.ok(!issues.some((issue) => issue.reason === 'Дата рождения не читается'));
assert.equal(rows[1].birthDate, '1990-11-05');
assert.equal(rows[1].comment, '');
assert.deepEqual(rows.map((row) => row.gender), ['MALE', 'FEMALE']);
assert.deepEqual(rows.map((row) => row.segment), ['потенциальные', 'отказавшиеся'], 'the SQNS client type is carried over');
assert.equal(rows[1].revenue, '45000');

console.log('migrate: birthday without a year kept on the card');
