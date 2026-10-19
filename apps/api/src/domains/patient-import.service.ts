import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ImportPatientDto, ImportPatientsDto } from './dto/import-patients.dto';

const digits = (value?: string | null) => (value ?? '').replace(/\D/g, '');
const amount = (value?: string) => Number(String(value ?? '').replace(/\s/g, '').replace(',', '.'));
const rub = (value: number) => `${Math.round(value).toLocaleString('ru-RU').replace(/ /g, ' ')} ₽`;

/** What the old system knew that has no column of its own here; kept on the card so nothing is lost. */
export function importNotes(row: ImportPatientDto, source: string) {
  const balance = amount(row.balance);
  const revenue = amount(row.revenue);
  const visits = amount(row.visits);
  return [
    row.comment?.trim(),
    row.cardNumber?.trim() ? `Медкарта ${row.cardNumber.trim()}` : '',
    row.segment?.trim() ? `Тип в ${source}: ${row.segment.trim()}` : '',
    balance ? `Баланс при переезде ${rub(balance)}` : '',
    revenue ? `Сумма продаж в ${source} ${rub(revenue)}` : '',
    visits > 0 ? `Визитов в ${source}: ${visits}` : '',
    row.lastVisit ? `Последний визит ${row.lastVisit}` : '',
    /^(да|yes|1|true)$/i.test(row.sms?.trim() ?? '') ? 'SMS разрешены' : row.sms?.trim() ? 'SMS не отправлять' : '',
  ].filter(Boolean).join(' · ') || null;
}

@Injectable()
export class PatientImportService {
  constructor(private readonly prisma: PrismaService) {}

  async run(orgId: string, body: ImportPatientsDto) {
    const source = (body.source || 'IMPORT').toUpperCase();
    const reasons: Record<string, number> = {};
    const bump = (reason: string) => { reasons[reason] = (reasons[reason] ?? 0) + 1; };
    let created = 0;
    let skipped = 0;

    // Duplicates are matched on the phone only: two different people may share a name.
    const known = await this.prisma.patient.findMany({
      where: { organizationId: orgId, phone: { not: null } },
      select: { phone: true },
    });
    const phones = new Set(known.map((row) => digits(row.phone).slice(-10)).filter((tail) => tail.length === 10));

    for (const row of body.patients ?? []) {
      const lastName = row.lastName?.trim() ?? '';
      const firstName = row.firstName?.trim() ?? '';
      if (!lastName && !firstName) {
        skipped += 1;
        bump('Пустая строка');
        continue;
      }
      const tail = digits(row.phone).slice(-10);
      const phone = tail.length === 10 ? `+${digits(row.phone)}` : null;
      if (phone && phones.has(tail)) {
        skipped += 1;
        bump('Уже есть в базе');
        continue;
      }
      const birth = row.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(row.birthDate) ? new Date(`${row.birthDate}T00:00:00.000Z`) : null;
      await this.prisma.patient.create({
        data: {
          organizationId: orgId,
          lastName: lastName || firstName,
          firstName: lastName ? firstName || '—' : '—',
          middleName: row.middleName?.trim() || null,
          phone,
          email: row.email?.includes('@') ? row.email.trim() : null,
          birthDate: birth && !Number.isNaN(birth.getTime()) ? birth : null,
          gender: row.gender === 'MALE' || row.gender === 'FEMALE' ? row.gender : null,
          source,
          notes: importNotes(row, source),
        },
      });
      if (phone) phones.add(tail);
      created += 1;
    }

    const appointmentSkipped = body.appointments?.length ?? 0;
    if (appointmentSkipped) reasons['Визиты пока переносятся только в демо'] = appointmentSkipped;
    return { created, skipped, appointments: 0, appointmentSkipped, reasons };
  }
}
