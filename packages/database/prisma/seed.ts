import { PrismaClient } from '../src/generated/prisma';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PERMISSIONS = [
  { code: 'org.manage', module: 'admin', description: 'Управление организацией' },
  { code: 'branch.read', module: 'admin', description: 'Просмотр филиалов' },
  { code: 'branch.write', module: 'admin', description: 'Редактирование филиалов' },
  { code: 'employee.read', module: 'admin', description: 'Просмотр сотрудников' },
  { code: 'employee.write', module: 'admin', description: 'Редактирование сотрудников' },
  { code: 'patient.read', module: 'patients', description: 'Просмотр пациентов' },
  { code: 'patient.write', module: 'patients', description: 'Редактирование пациентов' },
  { code: 'schedule.read', module: 'schedule', description: 'Просмотр расписания' },
  { code: 'schedule.write', module: 'schedule', description: 'Управление записями' },
  { code: 'finance.read', module: 'finance', description: 'Просмотр финансов' },
  { code: 'finance.write', module: 'finance', description: 'Управление финансами' },
  { code: 'medical.read', module: 'clinical', description: 'Просмотр медкарты' },
  { code: 'medical.write', module: 'clinical', description: 'Редактирование медкарты' },
  { code: 'warehouse.read', module: 'warehouse', description: 'Просмотр склада' },
  { code: 'warehouse.write', module: 'warehouse', description: 'Управление складом' },
  { code: 'marketing.read', module: 'marketing', description: 'Просмотр маркетинга' },
  { code: 'marketing.write', module: 'marketing', description: 'Управление маркетингом' },
  { code: 'communications.read', module: 'communications', description: 'Просмотр коммуникаций' },
  { code: 'communications.write', module: 'communications', description: 'Управление коммуникациями' },
  { code: 'analytics.read', module: 'analytics', description: 'Просмотр аналитики' },
];

const ROLES: Record<string, string[]> = {
  owner: PERMISSIONS.map((p) => p.code),
  manager: [
    'branch.read', 'branch.write', 'employee.read', 'employee.write',
    'patient.read', 'patient.write', 'schedule.read', 'schedule.write',
    'finance.read', 'medical.read',
  ],
  admin: ['patient.read', 'patient.write', 'schedule.read', 'schedule.write'],
  doctor: ['patient.read', 'patient.write', 'schedule.read', 'schedule.write', 'medical.read', 'medical.write'],
  assistant: ['patient.read', 'schedule.read', 'medical.read'],
};

async function main() {
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      create: p,
      update: { description: p.description },
    });
  }

  const org = await prisma.organization.upsert({
    where: { slug: 'demo-clinic' },
    create: {
      name: 'Sedrakoich dent Demo Clinic',
      slug: 'demo-clinic',
      phone: '+7 (495) 000-00-00',
      email: 'demo@dentasmart.local',
    },
    update: {},
  });

  const branch = await prisma.branch.upsert({
    where: { id: 'seed-branch-main' },
    create: {
      id: 'seed-branch-main',
      organizationId: org.id,
      name: 'Главный филиал',
      address: 'г. Москва, ул. Примерная, 1',
    },
    update: {},
  });

  await prisma.cabinet.upsert({
    where: { id: 'seed-cabinet-1' },
    create: {
      id: 'seed-cabinet-1',
      branchId: branch.id,
      name: 'Кабинет 1',
      number: '1',
      purpose: 'UNIVERSAL',
    },
    update: {},
  });

  const permissionMap = Object.fromEntries(
    (await prisma.permission.findMany()).map((p: { code: string; id: string }) => [p.code, p.id]),
  );

  for (const [code, perms] of Object.entries(ROLES)) {
    const role = await prisma.role.upsert({
      where: { organizationId_code: { organizationId: org.id, code } },
      create: {
        organizationId: org.id,
        code,
        name: { owner: 'Владелец', manager: 'Управляющий', admin: 'Администратор', doctor: 'Врач', assistant: 'Ассистент' }[code]!,
        isSystem: true,
      },
      update: {},
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: perms.map((permCode) => ({
        roleId: role.id,
        permissionId: permissionMap[permCode],
      })),
    });
  }

  const passwordHash = await bcrypt.hash('demo12345', 10);
  const user = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: 'owner@demo.local' } },
    create: {
      organizationId: org.id,
      email: 'owner@demo.local',
      passwordHash,
    },
    update: { passwordHash },
  });

  const ownerRole = await prisma.role.findFirstOrThrow({
    where: { organizationId: org.id, code: 'owner' },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: ownerRole.id } },
    create: { userId: user.id, roleId: ownerRole.id },
    update: {},
  });

  const employee = await prisma.employee.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      firstName: 'Иван',
      lastName: 'Демо',
      middleName: 'Петрович',
      specialization: 'Терапевт',
      status: 'ACTIVE',
    },
    update: {},
  });

  await prisma.employeeBranch.upsert({
    where: { employeeId_branchId: { employeeId: employee.id, branchId: branch.id } },
    create: { employeeId: employee.id, branchId: branch.id, isPrimary: true },
    update: {},
  });

  await prisma.employeeSchedule.deleteMany({ where: { employeeId: employee.id } });
  for (let d = 1; d <= 5; d++) {
    await prisma.employeeSchedule.create({
      data: {
        organizationId: org.id,
        employeeId: employee.id,
        branchId: branch.id,
        dayOfWeek: d,
        startsAt: '09:00',
        endsAt: '18:00',
        breakStart: '13:00',
        breakEnd: '14:00',
      },
    });
  }

  const doctorRole = await prisma.role.findFirstOrThrow({ where: { organizationId: org.id, code: 'doctor' } });
  const doctorUser = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: 'doctor@demo.local' } },
    create: { organizationId: org.id, email: 'doctor@demo.local', passwordHash },
    update: { passwordHash },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: doctorUser.id, roleId: doctorRole.id } },
    create: { userId: doctorUser.id, roleId: doctorRole.id },
    update: {},
  });
  const doctor2 = await prisma.employee.upsert({
    where: { userId: doctorUser.id },
    create: {
      userId: doctorUser.id,
      firstName: 'Елена',
      lastName: 'Козлова',
      specialization: 'Ортодонт',
      status: 'ACTIVE',
    },
    update: {},
  });
  await prisma.employeeBranch.upsert({
    where: { employeeId_branchId: { employeeId: doctor2.id, branchId: branch.id } },
    create: { employeeId: doctor2.id, branchId: branch.id, isPrimary: true },
    update: {},
  });

  await prisma.cabinet.upsert({
    where: { id: 'seed-cabinet-2' },
    create: {
      id: 'seed-cabinet-2',
      branchId: branch.id,
      name: 'Кабинет 2',
      number: '2',
      purpose: 'UNIVERSAL',
    },
    update: {},
  });

  await prisma.service.createMany({
    data: [
      { organizationId: org.id, name: 'Консультация', durationMin: 30, basePrice: 1500, code: 'CONSULT' },
      { organizationId: org.id, name: 'Профессиональная гигиена', durationMin: 60, basePrice: 5500, code: 'HYGIENE' },
      { organizationId: org.id, name: 'Лечение кариеса', durationMin: 60, basePrice: 4500, code: 'CARIES' },
    ],
    skipDuplicates: true,
  });

  const services = await prisma.service.findMany({ where: { organizationId: org.id } });
  const svc = (code: string) => services.find((s) => s.code === code) ?? services[0];
  const consult = svc('CONSULT');
  const hygiene = svc('HYGIENE');
  const caries = svc('CARIES');

  const todayAt = (hour: number, minute = 0) => {
    const d = new Date();
    d.setHours(hour, minute, 0, 0);
    return d;
  };
  const apptEnd = (start: Date, minutes: number) => new Date(start.getTime() + minutes * 60_000);

  type DemoPatient = {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
    tags?: string[];
    gender?: 'MALE' | 'FEMALE';
    birthDate?: Date;
    notes?: string;
    source?: string;
  };

  const DEMO_PATIENTS: DemoPatient[] = [
    { id: 'seed-patient-anna', firstName: 'Анна', lastName: 'Смирнова', phone: '+7 (900) 123-45-67', email: 'anna@example.com', tags: ['loyal', 'vip'], gender: 'FEMALE', birthDate: new Date('1988-03-12'), notes: 'VIP: депозит, план, частичная оплата' },
    { id: 'seed-patient-petr', firstName: 'Пётр', lastName: 'Волков', phone: '+7 (900) 111-11-11', tags: ['new'], gender: 'MALE', birthDate: new Date('1995-07-20'), notes: 'Сегодня 09:00 — ждёт приёма' },
    { id: 'seed-patient-maria', firstName: 'Мария', lastName: 'Орлова', phone: '+7 (900) 222-22-22', gender: 'FEMALE', notes: 'Сегодня 09:30 — подтверждена' },
    { id: 'seed-patient-oleg', firstName: 'Олег', lastName: 'Новиков', phone: '+7 (900) 333-33-33', gender: 'MALE', notes: 'Сегодня 10:00' },
    { id: 'seed-patient-elena', firstName: 'Елена', lastName: 'Морозова', phone: '+7 (900) 444-44-44', gender: 'FEMALE', notes: 'Сегодня 10:30' },
    { id: 'seed-patient-dmitry', firstName: 'Дмитрий', lastName: 'Кузнецов', phone: '+7 (900) 555-55-55', gender: 'MALE', notes: 'Сейчас на приёме' },
    { id: 'seed-patient-sofia', firstName: 'София', lastName: 'Лебедева', phone: '+7 (900) 666-66-66', gender: 'FEMALE', notes: 'Сегодня после обеда' },
    { id: 'seed-patient-igor', firstName: 'Игорь', lastName: 'Соколов', phone: '+7 (900) 777-77-77', gender: 'MALE', notes: 'Опоздал — утренняя запись' },
    { id: 'seed-patient-natalia', firstName: 'Наталья', lastName: 'Попова', phone: '+7 (900) 888-88-88', gender: 'FEMALE', notes: 'Крупный долг по счёту' },
    { id: 'seed-patient-alex', firstName: 'Алексей', lastName: 'Фёдоров', phone: '+7 (900) 999-99-99', gender: 'MALE', notes: 'Всё оплачено' },
    { id: 'seed-patient-yulia', firstName: 'Юлия', lastName: 'Васильева', phone: '+7 (900) 101-01-01', gender: 'FEMALE', notes: 'Лист ожидания' },
    { id: 'seed-patient-viktor', firstName: 'Виктор', lastName: 'Медведев', phone: '+7 (900) 202-02-02', gender: 'MALE', notes: 'В очереди — ожидание' },
    { id: 'seed-patient-tatiana', firstName: 'Татьяна', lastName: 'Романова', phone: '+7 (900) 303-03-03', gender: 'FEMALE', notes: 'В очереди — в кресле' },
    { id: 'seed-patient-roman', firstName: 'Роман', lastName: 'Григорьев', phone: '+7 (900) 404-04-04', gender: 'MALE', notes: 'Приём завершён сегодня' },
    { id: 'seed-patient-kate', firstName: 'Екатерина', lastName: 'Степанова', phone: '+7 (900) 505-05-05', gender: 'FEMALE', notes: 'Активный план лечения' },
    { id: 'seed-patient-max', firstName: 'Максим', lastName: 'Иванов', phone: '+7 (900) 606-06-06', gender: 'MALE', birthDate: new Date('2012-01-15'), notes: 'Ребёнок в семье' },
    { id: 'seed-patient-lidia', firstName: 'Лидия', lastName: 'Павлова', phone: '+7 (900) 707-07-07', gender: 'FEMALE', notes: 'Завтра — контроль' },
    { id: 'seed-patient-artem', firstName: 'Артём', lastName: 'Зайцев', phone: '+7 (900) 808-08-08', gender: 'MALE', notes: 'Неявка вчера' },
    { id: 'seed-patient-vera', firstName: 'Вера', lastName: 'Никитина', phone: '+7 (900) 909-09-09', gender: 'FEMALE', notes: 'Согласия и снимки' },
  ];

  const patientIds = DEMO_PATIENTS.map((p) => p.id);

  await prisma.receptionQueueItem.deleteMany({ where: { organizationId: org.id, patientId: { in: patientIds } } });
  await prisma.waitlistEntry.deleteMany({ where: { organizationId: org.id, patientId: { in: patientIds } } });
  await prisma.appointment.deleteMany({ where: { organizationId: org.id, patientId: { in: patientIds } } });

  const SOURCES = ['REFERRAL', 'SITE', 'CALL', 'WALK_IN', 'ADS', 'DOCTOR'];
  for (const [i, p] of DEMO_PATIENTS.entries()) {
    const source = p.source ?? (i % 4 === 3 ? null : SOURCES[i % SOURCES.length]);
    await prisma.patient.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        organizationId: org.id,
        firstName: p.firstName,
        lastName: p.lastName,
        phone: p.phone,
        email: p.email,
        tags: p.tags ?? [],
        gender: p.gender,
        birthDate: p.birthDate,
        notes: p.notes,
        source,
      },
      update: {
        firstName: p.firstName,
        lastName: p.lastName,
        phone: p.phone,
        email: p.email,
        tags: p.tags ?? [],
        gender: p.gender,
        birthDate: p.birthDate,
        notes: p.notes,
        source,
      },
    });
  }

  const patient = await prisma.patient.findUniqueOrThrow({ where: { id: 'seed-patient-anna' } });

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  const todayAppointments: {
    patientId: string;
    hour: number;
    minute?: number;
    status: 'SCHEDULED' | 'CONFIRMED' | 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'NO_SHOW';
    serviceId?: string;
    doctorId?: string;
    cabinetId?: string;
    notes: string;
  }[] = [
    { patientId: 'seed-patient-petr', hour: 9, status: 'CONFIRMED', serviceId: consult?.id, notes: 'seed:today' },
    { patientId: 'seed-patient-maria', hour: 9, minute: 30, status: 'SCHEDULED', serviceId: hygiene?.id, notes: 'seed:today' },
    { patientId: 'seed-patient-oleg', hour: 10, status: 'CONFIRMED', serviceId: consult?.id, doctorId: doctor2.id, cabinetId: 'seed-cabinet-2', notes: 'seed:today' },
    { patientId: 'seed-patient-elena', hour: 10, minute: 30, status: 'CONFIRMED', serviceId: caries?.id, notes: 'seed:today' },
    { patientId: 'seed-patient-dmitry', hour: 11, status: 'IN_PROGRESS', serviceId: caries?.id, notes: 'seed:today' },
    { patientId: 'seed-patient-igor', hour: 8, minute: 30, status: 'CONFIRMED', serviceId: consult?.id, notes: 'seed:today-late' },
    { patientId: 'seed-patient-sofia', hour: 14, status: 'CONFIRMED', serviceId: hygiene?.id, notes: 'seed:today' },
    { patientId: 'seed-patient-roman', hour: 12, status: 'COMPLETED', serviceId: consult?.id, notes: 'seed:today' },
    { patientId: 'seed-patient-viktor', hour: 11, minute: 30, status: 'WAITING', serviceId: consult?.id, notes: 'seed:today-queue' },
    { patientId: 'seed-patient-tatiana', hour: 11, minute: 45, status: 'IN_PROGRESS', serviceId: caries?.id, notes: 'seed:today-chair' },
  ];

  for (const a of todayAppointments) {
    const startsAt = todayAt(a.hour, a.minute ?? 0);
    const duration = a.serviceId === hygiene?.id ? 60 : 30;
    await prisma.appointment.create({
      data: {
        organizationId: org.id,
        branchId: branch.id,
        cabinetId: a.cabinetId ?? 'seed-cabinet-1',
        doctorId: a.doctorId ?? employee.id,
        patientId: a.patientId,
        serviceId: a.serviceId,
        startsAt,
        endsAt: apptEnd(startsAt, duration),
        status: a.status,
        notes: a.notes,
      },
    });
  }

  await prisma.appointment.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      cabinetId: 'seed-cabinet-1',
      doctorId: employee.id,
      patientId: 'seed-patient-lidia',
      serviceId: consult?.id,
      startsAt: tomorrow,
      endsAt: apptEnd(tomorrow, 30),
      status: 'CONFIRMED',
      notes: 'seed:tomorrow',
    },
  });

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(15, 0, 0, 0);
  await prisma.appointment.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      doctorId: employee.id,
      patientId: 'seed-patient-artem',
      serviceId: consult?.id,
      startsAt: yesterday,
      endsAt: apptEnd(yesterday, 30),
      status: 'NO_SHOW',
      notes: 'seed:yesterday',
      noShowReason: 'Не взял трубку',
    },
  });

  let queuePos = 1;
  await prisma.receptionQueueItem.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      patientId: 'seed-patient-viktor',
      status: 'WAITING',
      position: queuePos++,
    },
  });
  await prisma.receptionQueueItem.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      patientId: 'seed-patient-tatiana',
      status: 'IN_CHAIR',
      position: queuePos++,
    },
  });
  await prisma.receptionQueueItem.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      patientId: 'seed-patient-dmitry',
      status: 'CALLED',
      position: queuePos++,
    },
  });

  await prisma.waitlistEntry.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      patientId: 'seed-patient-yulia',
      serviceId: hygiene?.id,
      priority: 2,
      isActive: true,
    },
  });
  await prisma.waitlistEntry.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      patientId: 'seed-patient-igor',
      serviceId: consult?.id,
      priority: 1,
      isActive: true,
    },
  });

  await prisma.treatmentPlan.deleteMany({ where: { patientId: { in: patientIds } } });

  const plan = await prisma.treatmentPlan.create({
    data: {
      id: 'seed-plan-anna',
      organizationId: org.id,
      patientId: patient.id,
      doctorId: employee.id,
      title: 'Комплексная реставрация',
      status: 'PROPOSED',
      totalPrice: 45000,
      items: {
        create: [
          { title: 'Лечение 16', toothNum: 16, price: 4500, sortOrder: 1, serviceId: caries?.id },
          { title: 'Коронка 16', toothNum: 16, price: 25000, sortOrder: 2 },
        ],
      },
    },
  });

  await prisma.treatmentPlan.create({
    data: {
      id: 'seed-plan-kate',
      organizationId: org.id,
      patientId: 'seed-patient-kate',
      doctorId: employee.id,
      title: 'Имплантация и протезирование',
      status: 'IN_PROGRESS',
      totalPrice: 185000,
      items: {
        create: [
          { title: 'Имплант 36', toothNum: 36, price: 65000, sortOrder: 1, isCompleted: true },
          { title: 'Формирователь десны', toothNum: 36, price: 12000, sortOrder: 2, isCompleted: true },
          { title: 'Коронка на имплант', toothNum: 36, price: 48000, sortOrder: 3 },
          { title: 'КТ контроль', price: 3500, sortOrder: 4 },
        ],
      },
      diaryEntries: {
        create: [
          { notes: 'Имплант установлен без осложнений', toothNum: 36 },
          { notes: 'Запланирована коронка через 3 месяца' },
        ],
      },
    },
  });

  await prisma.treatmentPlan.create({
    data: {
      organizationId: org.id,
      patientId: 'seed-patient-natalia',
      doctorId: doctor2.id,
      title: 'Ортодонтия',
      status: 'ACCEPTED',
      totalPrice: 120000,
      items: {
        create: [
          { title: 'Брекеты', price: 90000, sortOrder: 1 },
          { title: 'Ретейнер', price: 15000, sortOrder: 2 },
        ],
      },
    },
  });

  await prisma.toothRecord.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.toothRecord.createMany({
    data: [
      { patientId: patient.id, toothNum: 16, condition: 'CARIES', diagnosis: 'K02.1' },
      { patientId: patient.id, toothNum: 26, condition: 'HEALTHY' },
      { patientId: 'seed-patient-kate', toothNum: 36, condition: 'IMPLANT', diagnosis: 'Имплант установлен' },
      { patientId: 'seed-patient-vera', toothNum: 11, condition: 'CARIES', diagnosis: 'K02.0' },
      { patientId: 'seed-patient-vera', toothNum: 21, condition: 'HEALTHY' },
    ],
  });

  await prisma.installmentSchedule.deleteMany({
    where: { plan: { organizationId: org.id } },
  });
  await prisma.installmentPlan.deleteMany({ where: { organizationId: org.id } });
  await prisma.payment.deleteMany({ where: { organizationId: org.id } });
  await prisma.invoice.deleteMany({ where: { organizationId: org.id } });

  await prisma.invoice.create({
    data: {
      organizationId: org.id,
      patientId: patient.id,
      number: 'INV-0001',
      status: 'ISSUED',
      totalAmount: 15000,
      paidAmount: 5000,
    },
  });
  await prisma.invoice.create({
    data: {
      organizationId: org.id,
      patientId: 'seed-patient-natalia',
      number: 'INV-0002',
      status: 'ISSUED',
      totalAmount: 48000,
      paidAmount: 8000,
    },
  });
  await prisma.invoice.create({
    data: {
      organizationId: org.id,
      patientId: 'seed-patient-natalia',
      number: 'INV-0003',
      status: 'ISSUED',
      totalAmount: 12000,
      paidAmount: 0,
    },
  });
  await prisma.invoice.create({
    data: {
      organizationId: org.id,
      patientId: 'seed-patient-alex',
      number: 'INV-0004',
      status: 'PAID',
      totalAmount: 5500,
      paidAmount: 5500,
    },
  });
  await prisma.invoice.create({
    data: {
      organizationId: org.id,
      patientId: 'seed-patient-roman',
      number: 'INV-0005',
      status: 'PAID',
      totalAmount: 1500,
      paidAmount: 1500,
    },
  });

  await prisma.payment.createMany({
    data: [
      { organizationId: org.id, patientId: patient.id, amount: 5000, method: 'CARD' },
      { organizationId: org.id, patientId: 'seed-patient-alex', amount: 5500, method: 'CASH' },
      { organizationId: org.id, patientId: 'seed-patient-natalia', amount: 8000, method: 'CARD' },
    ],
  });

  if (!(await prisma.inventoryItem.findFirst({ where: { organizationId: org.id, sku: 'COMP-A2' } }))) {
    await prisma.inventoryItem.create({
      data: {
        organizationId: org.id,
        name: 'Композит A2',
        sku: 'COMP-A2',
        category: 'MATERIAL',
        minStock: 5,
        batches: { create: { branchId: branch.id, quantity: 12, expiresAt: new Date('2027-01-01') } },
      },
    });
  }

  if (!(await prisma.labOrder.findFirst({ where: { organizationId: org.id, patientId: patient.id, title: 'Коронка E.max 16' } }))) {
    await prisma.labOrder.create({
      data: {
        organizationId: org.id,
        patientId: patient.id,
        doctorId: employee.id,
        title: 'Коронка E.max 16',
        status: 'IN_PROGRESS',
        shade: 'A2',
      },
    });
  }

  await prisma.marketingCampaign.create({
    data: {
      organizationId: org.id,
      name: 'Гигиена весна 2026',
      channel: 'SMS',
      status: 'ACTIVE',
    },
  });

  await prisma.automationChain.create({
    data: {
      organizationId: org.id,
      name: 'Забытый пациент 6 мес',
      trigger: 'NO_VISIT_6M',
      stepsJson: [{ delayDays: 0, channel: 'SMS', template: 'Давно не виделись!' }],
    },
  });

  await prisma.communicationThread.create({
    data: {
      organizationId: org.id,
      patientId: patient.id,
      channel: 'WHATSAPP',
      messages: {
        create: [{ direction: 'in', body: 'Здравствуйте, хочу записаться на гигиену' }],
      },
    },
  });

  await prisma.aiInsight.createMany({
    data: [
      {
        organizationId: org.id,
        type: 'CHURN_RISK',
        entityType: 'Patient',
        entityId: patient.id,
        payload: { score: 0.12, recommendation: 'Низкий риск оттока' },
        confidence: 0.88,
      },
      {
        organizationId: org.id,
        type: 'REVENUE_FORECAST',
        payload: { month: '2026-06', forecast: 1250000 },
        confidence: 0.75,
      },
    ],
  });

  await prisma.widgetConfig.create({
    data: { organizationId: org.id, primaryColor: '#3b9eff' },
  });

  await prisma.medicalRecordHash.create({
    data: {
      organizationId: org.id,
      patientId: patient.id,
      recordType: 'TreatmentPlan',
      recordId: plan.id,
      contentHash: 'sha256:demo-hash-chain',
    },
  });

  await prisma.cashShift.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      status: 'OPEN',
      openingCash: 5000,
      openedById: user.id,
    },
  });

  const petrAppt = await prisma.appointment.findFirst({
    where: { patientId: 'seed-patient-petr', notes: 'seed:today' },
  });
  await prisma.reminder.deleteMany({ where: { organizationId: org.id, patientId: { in: patientIds } } });
  await prisma.reminder.create({
    data: {
      organizationId: org.id,
      patientId: 'seed-patient-petr',
      appointmentId: petrAppt!.id,
      channel: 'SMS',
      message: 'Напоминание: не забудьте про визит в Sedrakoich dent Demo Clinic',
      scheduledAt: new Date(),
      status: 'PENDING',
    },
  });

  const segment = await prisma.patientSegment.upsert({
    where: { id: 'seed-segment-vip' },
    create: {
      id: 'seed-segment-vip',
      organizationId: org.id,
      name: 'VIP по тегу',
      rulesJson: { tag: 'vip' },
      isDynamic: true,
    },
    update: {},
  });
  await prisma.patientSegmentMember.deleteMany({ where: { segmentId: segment.id } });
  for (const p of DEMO_PATIENTS.filter((x) => x.tags?.includes('vip'))) {
    await prisma.patientSegmentMember.upsert({
      where: { segmentId_patientId: { segmentId: segment.id, patientId: p.id } },
      create: { segmentId: segment.id, patientId: p.id },
      update: {},
    });
  }

  await prisma.patientConsent.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.patientConsent.createMany({
    data: [
      { organizationId: org.id, patientId: 'seed-patient-vera', type: 'MEDICAL_TREATMENT', status: 'SIGNED', signedAt: new Date() },
      { organizationId: org.id, patientId: 'seed-patient-vera', type: 'PD_PROCESSING', status: 'SIGNED', signedAt: new Date() },
      { organizationId: org.id, patientId: 'seed-patient-petr', type: 'MEDICAL_TREATMENT', status: 'PENDING' },
      { organizationId: org.id, patientId: patient.id, type: 'MEDICAL_TREATMENT', status: 'SIGNED', signedAt: new Date() },
    ],
  });

  await prisma.imagingStudy.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.imagingStudy.createMany({
    data: [
      { patientId: 'seed-patient-vera', type: 'PHOTO', fileUrl: '/demo/snapshot-vera.jpg', title: 'Фото 11 зуб' },
      { patientId: 'seed-patient-kate', type: 'CT', fileUrl: '/demo/xray-36.jpg', title: 'КТ зона 36' },
      { patientId: patient.id, type: 'OPG', fileUrl: '/demo/xray-anna.jpg', title: 'Панорамный снимок' },
    ],
  });

  await prisma.patientDeposit.upsert({
    where: { patientId: patient.id },
    create: { organizationId: org.id, patientId: patient.id, balance: 15000 },
    update: { balance: 15000 },
  });

  const inv = await prisma.invoice.findFirst({ where: { patientId: patient.id, number: 'INV-0001' } });
  if (inv) {
    const inst = await prisma.installmentPlan.create({
      data: {
        organizationId: org.id,
        patientId: patient.id,
        invoiceId: inv.id,
        totalAmount: 30000,
        months: 3,
      },
    });
    for (let i = 1; i <= 3; i++) {
      const due = new Date();
      due.setMonth(due.getMonth() + i);
      await prisma.installmentSchedule.create({
        data: { planId: inst.id, dueDate: due, amount: 10000, status: i === 1 ? 'PAID' : 'PENDING', paidAt: i === 1 ? new Date() : null },
      });
    }
  }

  const family = await prisma.familyGroup.upsert({
    where: { id: 'seed-family-smirnov' },
    create: {
      id: 'seed-family-smirnov',
      organizationId: org.id,
      name: 'Семья Смирновых',
    },
    update: { name: 'Семья Смирновых' },
  });
  await prisma.familyMember.deleteMany({ where: { familyGroupId: family.id } });
  await prisma.familyMember.createMany({
    data: [
      { familyGroupId: family.id, patientId: patient.id, role: 'HEAD' },
      { familyGroupId: family.id, patientId: 'seed-patient-max', role: 'CHILD' },
    ],
  });

  const glove = await prisma.inventoryItem.findFirst({ where: { organizationId: org.id } });
  if (glove && hygiene) {
    await prisma.serviceMaterialNorm.upsert({
      where: { serviceId_itemId: { serviceId: hygiene.id, itemId: glove.id } },
      create: { organizationId: org.id, serviceId: hygiene.id, itemId: glove.id, quantity: 2 },
      update: { quantity: 2 },
    });
  }

  await prisma.reminderTemplate.create({
    data: {
      organizationId: org.id,
      name: 'Напоминание о визите',
      channel: 'SMS',
      body: 'Ждём вас завтра в {{time}} — Sedrakoich dent',
    },
  });

  await prisma.payrollRule.create({
    data: {
      organizationId: org.id,
      name: 'Процент от выручки врача',
      ruleType: 'PERCENT_REVENUE',
      paramsJson: { percent: 25 },
    },
  });

  for (const provider of ['YUKASSA', 'ATOL', 'EGISZ', 'HL7_FHIR'] as const) {
    await prisma.integrationConfig.upsert({
      where: { organizationId_provider: { organizationId: org.id, provider } },
      create: { organizationId: org.id, provider, configJson: { mode: 'stub', enabled: false }, isActive: false },
      update: {},
    });
  }

  await prisma.webhookEndpoint.create({
    data: {
      organizationId: org.id,
      url: 'https://example.com/webhooks/dentasmart',
      events: ['appointment.created', 'payment.completed'],
      secret: 'demo-webhook-secret',
    },
  });

  console.log(`✅ Seed OK: ${DEMO_PATIENTS.length} демо-пациентов, записи на сегодня, очередь, долги, планы`);
  console.log('   owner@demo.local / demo12345');
  console.log('   doctor@demo.local / demo12345');
  console.log('   Ресепшн: /reception · Пациенты: /patients');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
