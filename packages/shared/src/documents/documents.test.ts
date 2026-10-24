import { describe, expect, it } from 'vitest';
import { topicsOf } from './documents';

describe('topicsOf', () => {
  it('reads consent groups from service names', () => {
    expect(topicsOf('Удаление зуба сложное')).toEqual(['surgery']);
    expect(topicsOf('Лечение пульпита', 'Эндодонтия')).toEqual(['endo']);
    expect(topicsOf('Установка импланта Straumann')).toEqual(['implant']);
    expect(topicsOf('Коронка металлокерамическая')).toEqual(['prosthetics']);
    expect(topicsOf('Профессиональная гигиена Air Flow')).toEqual(['hygiene']);
    expect(topicsOf('Пломба светоотверждаемая')).toEqual(['therapy']);
    expect(topicsOf('Прицельный снимок (визиограф)')).toEqual(['xray']);
    expect(topicsOf('Консультация')).toEqual([]);
  });
});
