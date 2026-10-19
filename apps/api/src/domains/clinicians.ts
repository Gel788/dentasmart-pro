import type { Prisma } from '@dentasmart/database';

/**
 * Who appears as a doctor in schedules and reports: active staff who may edit the medical record.
 * Reception and accounting have logins too, but never get a column in the calendar.
 */
export function clinicianWhere(orgId: string): Prisma.EmployeeWhereInput {
  return {
    status: 'ACTIVE',
    user: {
      organizationId: orgId,
      isActive: true,
      userRoles: { some: { role: { rolePermissions: { some: { permission: { code: 'medical.write' } } } } } },
    },
  };
}
