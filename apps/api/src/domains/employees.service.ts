import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  listRoles(orgId: string) {
    return this.prisma.role.findMany({
      where: { organizationId: orgId, code: { not: 'owner' } },
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  list(orgId: string) {
    return this.prisma.employee.findMany({
      where: { user: { organizationId: orgId } },
      include: {
        user: { select: { email: true, isActive: true } },
        branches: { include: { branch: true } },
        certificates: true,
        schedules: true,
      },
      orderBy: { lastName: 'asc' },
    });
  }

  listSchedules(orgId: string, branchId?: string) {
    return this.prisma.employeeSchedule.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        ...(branchId ? { branchId } : {}),
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startsAt: 'asc' }],
    });
  }

  payroll(orgId: string) {
    return this.prisma.payrollEntry.findMany({
      where: { employee: { user: { organizationId: orgId } } },
      orderBy: { periodTo: 'desc' },
      take: 20,
    });
  }

  async create(
    orgId: string,
    data: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      middleName?: string;
      phone?: string;
      specialization?: string;
      roleCode: string;
      branchIds: string[];
    },
  ) {
    const dup = await this.prisma.user.findFirst({
      where: { organizationId: orgId, email: data.email.toLowerCase().trim() },
    });
    if (dup) throw new BadRequestException('Пользователь с таким email уже есть');

    const role = await this.prisma.role.findFirst({
      where: { organizationId: orgId, code: data.roleCode },
    });
    if (!role) throw new BadRequestException('Роль не найдена');

    const passwordHash = await bcrypt.hash(data.password, 10);
    const branchIds = data.branchIds.length ? data.branchIds : [];

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          organizationId: orgId,
          email: data.email.toLowerCase().trim(),
          passwordHash,
        },
      });
      await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
      const employee = await tx.employee.create({
        data: {
          userId: user.id,
          firstName: data.firstName.trim(),
          lastName: data.lastName.trim(),
          middleName: data.middleName?.trim(),
          phone: data.phone?.trim(),
          specialization: data.specialization?.trim(),
          status: 'ACTIVE',
        },
      });
      if (branchIds.length) {
        await tx.employeeBranch.createMany({
          data: branchIds.map((branchId, i) => ({
            employeeId: employee.id,
            branchId,
            isPrimary: i === 0,
          })),
        });
      }
      return employee;
    });
  }

  async update(
    orgId: string,
    id: string,
    data: {
      firstName?: string;
      lastName?: string;
      specialization?: string;
      status?: string;
      phone?: string;
      branchIds?: string[];
    },
  ) {
    const emp = await this.prisma.employee.findFirst({
      where: { id, user: { organizationId: orgId } },
    });
    if (!emp) throw new NotFoundException('Сотрудник не найден');

    const { branchIds, ...fields } = data;
    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(fields).length) {
        await tx.employee.update({
          where: { id },
          data: {
            ...fields,
            status: fields.status as never,
          },
        });
      }
      if (branchIds) {
        await tx.employeeBranch.deleteMany({ where: { employeeId: id } });
        if (branchIds.length) {
          await tx.employeeBranch.createMany({
            data: branchIds.map((branchId, i) => ({
              employeeId: id,
              branchId,
              isPrimary: i === 0,
            })),
          });
        }
      }
    });

    return this.list(orgId).then((list) => list.find((e) => e.id === id));
  }

  createSchedule(
    orgId: string,
    data: { employeeId: string; branchId: string; dayOfWeek: number; startsAt: string; endsAt: string },
  ) {
    return this.prisma.employeeSchedule.create({
      data: { organizationId: orgId, ...data },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });
  }

  deleteSchedule(orgId: string, scheduleId: string) {
    return this.prisma.employeeSchedule.deleteMany({
      where: { id: scheduleId, organizationId: orgId },
    });
  }
}
