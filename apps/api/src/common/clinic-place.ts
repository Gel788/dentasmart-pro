import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * A visit's branch, doctor, chair and service must all be this clinic's, and the chair must stand in
 * the visit's branch. Every path that books or moves a visit goes through this check.
 */
export async function assertPlace(
  db: Pick<PrismaService, 'branch' | 'employee' | 'cabinet' | 'service'>,
  orgId: string,
  place: { branchId?: string | null; doctorId?: string | null; cabinetId?: string | null; serviceId?: string | null },
) {
  const [branch, doctor, cabinet, service] = await Promise.all([
    place.branchId ? db.branch.findFirst({ where: { id: place.branchId, organizationId: orgId } }) : null,
    place.doctorId ? db.employee.findFirst({ where: { id: place.doctorId, user: { organizationId: orgId } } }) : null,
    place.cabinetId ? db.cabinet.findFirst({ where: { id: place.cabinetId, branch: { organizationId: orgId } } }) : null,
    place.serviceId ? db.service.findFirst({ where: { id: place.serviceId, organizationId: orgId } }) : null,
  ]);
  if (place.branchId && !branch) throw new NotFoundException('Филиал не найден');
  if (place.doctorId && !doctor) throw new NotFoundException('Врач не найден');
  if (place.cabinetId && !cabinet) throw new NotFoundException('Кресло не найдено');
  if (place.serviceId && !service) throw new NotFoundException('Услуга не найдена');
  if (cabinet && place.branchId && cabinet.branchId !== place.branchId) throw new BadRequestException('Это кресло в другом филиале');
  if (doctor && doctor.status !== 'ACTIVE') throw new BadRequestException('Этот врач сейчас не принимает');
}
