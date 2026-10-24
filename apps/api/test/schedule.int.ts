/**
 * The database itself refuses a double booking, whichever code path writes the visit.
 * Needs the constraints from packages/database/prisma/sql/appointment-overlap.sql (applied by db:push).
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@dentasmart/database';

const prisma = new PrismaClient();

async function main() {
  const branch = await prisma.branch.findFirstOrThrow({ include: { cabinets: true } });
  const cabinet = branch.cabinets[0];
  const patients = await prisma.patient.findMany({ where: { organizationId: branch.organizationId }, take: 4 });
  const doctor = await prisma.employee.findFirstOrThrow();
  const slot = { startsAt: new Date('2032-05-04T07:00:00Z'), endsAt: new Date('2032-05-04T07:30:00Z') };
  const base = { organizationId: branch.organizationId, branchId: branch.id, status: 'SCHEDULED' as const };
  const made: string[] = [];
  try {
    const chair = await Promise.allSettled(patients.map((p) => prisma.appointment.create({ data: { ...base, ...slot, cabinetId: cabinet.id, patientId: p.id } })));
    const ok = chair.filter((r): r is PromiseFulfilledResult<{ id: string }> => r.status === 'fulfilled');
    made.push(...ok.map((r) => r.value.id));
    assert.equal(ok.length, 1, 'в одно кресло на одно время проходит одна запись из четырёх');

    await assert.rejects(
      prisma.appointment.create({ data: { ...base, cabinetId: cabinet.id, patientId: patients[1].id, startsAt: new Date('2032-05-04T07:15:00Z'), endsAt: new Date('2032-05-04T07:45:00Z') } }),
      /appointments_cabinet_no_overlap/,
      'частичное пересечение тоже отклоняется',
    );
    const next = await prisma.appointment.create({ data: { ...base, cabinetId: cabinet.id, patientId: patients[1].id, startsAt: slot.endsAt, endsAt: new Date('2032-05-04T08:00:00Z') } });
    made.push(next.id);

    const first = await prisma.appointment.create({ data: { ...base, ...slot, doctorId: doctor.id, patientId: patients[2].id, startsAt: new Date('2032-05-05T07:00:00Z'), endsAt: new Date('2032-05-05T07:30:00Z') } });
    made.push(first.id);
    await assert.rejects(
      prisma.appointment.create({ data: { ...base, doctorId: doctor.id, patientId: patients[3].id, startsAt: new Date('2032-05-05T07:10:00Z'), endsAt: new Date('2032-05-05T07:20:00Z') } }),
      /appointments_doctor_no_overlap/,
      'у врача не бывает двух приёмов одновременно',
    );

    await prisma.appointment.update({ where: { id: first.id }, data: { status: 'CANCELLED' } });
    const again = await prisma.appointment.create({ data: { ...base, doctorId: doctor.id, patientId: patients[3].id, startsAt: new Date('2032-05-05T07:10:00Z'), endsAt: new Date('2032-05-05T07:20:00Z') } });
    made.push(again.id);

    await assert.rejects(
      prisma.appointment.create({ data: { ...base, cabinetId: cabinet.id, patientId: patients[0].id, startsAt: slot.endsAt, endsAt: slot.startsAt } }),
      /appointments_time_order/,
      'конец раньше начала',
    );
    console.log('schedule ok');
  } finally {
    await prisma.appointment.deleteMany({ where: { id: { in: made } } });
  }
}

main().finally(() => prisma.$disconnect());
