import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { deflateSync } from 'zlib';
import { PrismaClient } from '../src/generated/prisma';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

type SeedLine = {
  title: string;
  toothNum?: number;
  surfaces?: string[];
  price: number;
  listPrice?: number;
  discountPercent?: number;
  serviceId?: string;
  durationMin?: number;
  sortOrder: number;
};

async function seedTier(data: {
  id?: string;
  organizationId: string;
  patientId: string;
  doctorId?: string;
  title: string;
  tier?: 'ECONOM' | 'OPTIMUM' | 'PREMIUM';
  familyKey?: string;
  status?: 'PROPOSED' | 'ACCEPTED' | 'IN_PROGRESS';
  guaranteeMonths?: number;
  durationWeeks?: number;
  installmentMonths?: number;
  createdAt?: Date;
  presentedAt?: Date;
  phases: { title: string; specialty?: string; healingDays?: number; dependsOnSort?: number; items: SeedLine[] }[];
}) {
  const total = data.phases.flatMap((p) => p.items).reduce((sum, line) => sum + line.price, 0);
  const plan = await prisma.treatmentPlan.create({
    data: {
      id: data.id,
      organizationId: data.organizationId,
      patientId: data.patientId,
      doctorId: data.doctorId,
      title: data.title,
      status: data.status ?? 'PROPOSED',
      tier: data.tier,
      familyKey: data.familyKey,
      guaranteeMonths: data.guaranteeMonths ?? 12,
      durationWeeks: data.durationWeeks ?? 4,
      installmentMonths: data.installmentMonths ?? 0,
      totalPrice: total,
      presentedAt: data.presentedAt ?? new Date(),
      createdAt: data.createdAt,
    },
  });
  const phaseIds: string[] = [];
  for (let index = 0; index < data.phases.length; index++) {
    const phase = data.phases[index];
    const created = await prisma.planPhase.create({
      data: {
        planId: plan.id,
        title: phase.title,
        sortOrder: index + 1,
        specialty: phase.specialty,
        healingDays: phase.healingDays ?? 0,
        dependsOnId: phase.dependsOnSort ? phaseIds[phase.dependsOnSort - 1] : undefined,
      },
    });
    phaseIds.push(created.id);
    for (const line of phase.items) {
      await prisma.treatmentPlanItem.create({
        data: {
          planId: plan.id,
          phaseId: created.id,
          phase: index + 1,
          title: line.title,
          toothNum: line.toothNum,
          surfaces: line.surfaces ?? [],
          price: line.price,
          listPrice: line.listPrice ?? line.price,
          discountPercent: line.discountPercent ?? 0,
          serviceId: line.serviceId,
          durationMin: line.durationMin ?? 30,
          sortOrder: line.sortOrder,
          status: data.status === 'IN_PROGRESS' || data.status === 'ACCEPTED' ? 'ACCEPTED' : 'PROPOSED',
        },
      });
    }
  }
  return plan;
}

function writeClinicFiles() {
  const dir = join(__dirname, '../../../apps/api/uploads/imaging');
  mkdirSync(dir, { recursive: true });
  const svg = (body: string) => `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240">${body}</svg>`;
  writeFileSync(join(dir, 'smile-before.svg'), svg('<rect width="320" height="240" fill="#1c1917"/><ellipse cx="160" cy="110" rx="70" ry="86" fill="#e7c2a8"/><path d="M118 132 Q160 150 202 132" stroke="#7f1d1d" fill="none" stroke-width="4"/><text x="16" y="28" fill="#a8a29e" font-size="14" font-family="sans-serif">До · улыбка</text>'));
  writeFileSync(join(dir, 'smile-after.svg'), svg('<rect width="320" height="240" fill="#111827"/><ellipse cx="160" cy="110" rx="70" ry="86" fill="#f3d2ba"/><path d="M112 128 Q160 156 208 128" stroke="#f8fafc" fill="#f8fafc" stroke-width="8"/><text x="16" y="28" fill="#99f6e4" font-size="14" font-family="sans-serif">После · улыбка</text>'));
  writeFileSync(join(dir, 'face-rest.svg'), svg('<rect width="320" height="240" fill="#1c1917"/><ellipse cx="160" cy="112" rx="68" ry="84" fill="#e7c2a8"/><path d="M130 140 H190" stroke="#7c5a4a" stroke-width="3"/><text x="16" y="28" fill="#a8a29e" font-size="14" font-family="sans-serif">Покой</text>'));
  writeFileSync(join(dir, 'profile.svg'), svg('<rect width="320" height="240" fill="#1c1917"/><path d="M120 40 Q200 50 190 120 Q210 150 170 200 Q130 160 140 90 Z" fill="#e7c2a8"/><text x="16" y="28" fill="#a8a29e" font-size="14" font-family="sans-serif">Профиль</text>'));
  const teeth = Array.from({ length: 10 }, (_, i) => `<rect x="${82 + i * 16}" y="104" width="12" height="28" rx="2"/>`).join('');
  writeFileSync(join(dir, 'retract.svg'), svg(`<rect width="320" height="240" fill="#1c1917"/><rect x="70" y="90" width="180" height="70" rx="16" fill="#fecdd3"/><g fill="#f8fafc">${teeth}</g><text x="16" y="28" fill="#a8a29e" font-size="14" font-family="sans-serif">Ретрактор, анфас</text>`));
  writeFileSync(join(dir, 'tooth-16.svg'), svg('<rect width="320" height="240" fill="#0c0a09"/><rect x="118" y="36" width="84" height="150" rx="18" fill="#f5f5f4"/><ellipse cx="160" cy="78" rx="22" ry="14" fill="#7f1d1d"/><text x="16" y="28" fill="#a8a29e" font-size="14" font-family="sans-serif">Зуб 16</text>'));
  const arch = Array.from({ length: 16 }, (_, i) => `<rect x="${20 + i * 18}" y="${i < 8 ? 70 : 130}" width="12" height="40" fill="#d4d4d8"/>`).join('');
  writeFileSync(join(dir, 'opg.svg'), svg(`<rect width="320" height="240" fill="#09090b"/>${arch}<text x="16" y="28" fill="#e4e4e7" font-size="14" font-family="sans-serif">Панорама</text>`));
  for (let slice = 0; slice < 8; slice++) {
    writeFileSync(join(dir, `ct-${slice}.png`), pngGray(96, (x, y) => {
      const dx = x - 48;
      const dy = y - 48;
      const ring = Math.abs(Math.hypot(dx, dy) - (18 + slice * 3));
      return ring < 4 ? 210 : Math.hypot(dx, dy) < 14 ? 40 : 12;
    }));
  }
  writeFileSync(join(dir, 'slice.dcm'), dicomGray(32));
  writeFileSync(join(dir, 'tooth.stl'), `solid tooth
facet normal 0 0 0
  outer loop
    vertex 0 0 0
    vertex 20 0 0
    vertex 10 24 6
  endloop
endfacet
facet normal 0 0 0
  outer loop
    vertex 20 0 0
    vertex 16 0 16
    vertex 10 24 6
  endloop
endfacet
facet normal 0 0 0
  outer loop
    vertex 16 0 16
    vertex 0 0 0
    vertex 10 24 6
  endloop
endfacet
endsolid tooth
`);
}

function pngGray(size: number, pixel: (x: number, y: number) => number) {
  const raw = Buffer.alloc((size + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size + 1)] = 0;
    for (let x = 0; x < size; x++) raw[y * (size + 1) + 1 + x] = pixel(x, y);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function crc32(buf: Buffer) {
  let crc = ~0;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function dicomGray(size: number) {
  const pixels = Buffer.alloc(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) pixels[y * size + x] = Math.hypot(x - size / 2, y - size / 2) < 10 ? 220 : 20;
  }
  const element = (group: number, tag: number, vr: string, value: Buffer) => {
    const header = Buffer.alloc(8);
    header.writeUInt16LE(group, 0);
    header.writeUInt16LE(tag, 2);
    header.write(vr, 4, 'ascii');
    const even = value.length % 2 === 0 ? value : Buffer.concat([value, Buffer.from([0])]);
    header.writeUInt16LE(even.length, 6);
    return Buffer.concat([header, even]);
  };
  const ui = (group: number, tag: number, text: string) => element(group, tag, 'UI', Buffer.from(text));
  const us = (group: number, tag: number, value: number) => {
    const data = Buffer.alloc(2);
    data.writeUInt16LE(value);
    return element(group, tag, 'US', data);
  };
  const body = Buffer.concat([
    ui(0x0008, 0x0016, '1.2.840.10008.5.1.4.1.1.2'),
    ui(0x0008, 0x0018, '1.2.3.4.5.6'),
    element(0x0008, 0x0060, 'CS', Buffer.from('CT')),
    us(0x0028, 0x0002, 1),
    element(0x0028, 0x0004, 'CS', Buffer.from('MONOCHROME2 ')),
    us(0x0028, 0x0010, size),
    us(0x0028, 0x0011, size),
    us(0x0028, 0x0100, 8),
    us(0x0028, 0x0101, 8),
    us(0x0028, 0x0102, 7),
    us(0x0028, 0x0103, 0),
  ]);
  const pixel = Buffer.alloc(12 + pixels.length);
  pixel.writeUInt16LE(0x7fe0, 0);
  pixel.writeUInt16LE(0x0010, 2);
  pixel.write('OB', 4, 'ascii');
  pixel.writeUInt16LE(0, 6);
  pixel.writeUInt32LE(pixels.length, 8);
  pixels.copy(pixel, 12);
  const preamble = Buffer.alloc(132);
  preamble.write('DICM', 128, 'ascii');
  return Buffer.concat([preamble, body, pixel]);
}

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
  admin: [
    'patient.read', 'patient.write', 'schedule.read', 'schedule.write',
    'finance.read', 'finance.write', 'medical.read',
  ],
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
      name: 'Седракович Дент',
      slug: 'demo-clinic',
      phone: '+7 (495) 120-45-45',
      email: 'hello@sedrakovich.demo',
    },
    update: {
      name: 'Седракович Дент',
      phone: '+7 (495) 120-45-45',
      email: 'hello@sedrakovich.demo',
    },
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

  const adminRole = await prisma.role.findFirstOrThrow({ where: { organizationId: org.id, code: 'admin' } });
  const adminUser = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: 'admin@demo.local' } },
    create: { organizationId: org.id, email: 'admin@demo.local', passwordHash },
    update: { passwordHash },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: adminRole.id } },
    create: { userId: adminUser.id, roleId: adminRole.id },
    update: {},
  });
  const receptionist = await prisma.employee.upsert({
    where: { userId: adminUser.id },
    create: {
      userId: adminUser.id,
      firstName: 'Марина',
      lastName: 'Соколова',
      specialization: 'Администратор ресепшн',
      status: 'ACTIVE',
    },
    update: { firstName: 'Марина', lastName: 'Соколова' },
  });
  await prisma.employeeBranch.upsert({
    where: { employeeId_branchId: { employeeId: receptionist.id, branchId: branch.id } },
    create: { employeeId: receptionist.id, branchId: branch.id, isPrimary: true },
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

  const CATALOG = [
    { code: 'CONSULT', name: 'Консультация стоматолога', durationMin: 30, basePrice: 1500, sortOrder: 10 },
    { code: 'HYGIENE', name: 'Профессиональная гигиена', durationMin: 60, basePrice: 6500, sortOrder: 20 },
    { code: 'CARIES', name: 'Лечение кариеса', durationMin: 60, basePrice: 5500, sortOrder: 30 },
    { code: 'ENDO', name: 'Лечение каналов', durationMin: 90, basePrice: 12000, sortOrder: 40 },
    { code: 'CROWN', name: 'Коронка керамическая', durationMin: 60, basePrice: 28000, sortOrder: 50 },
    { code: 'IMPLANT', name: 'Установка импланта', durationMin: 90, basePrice: 45000, sortOrder: 60 },
    { code: 'EXTRACT', name: 'Удаление зуба', durationMin: 40, basePrice: 4500, sortOrder: 70 },
    { code: 'WHITENING', name: 'Отбеливание', durationMin: 60, basePrice: 18000, sortOrder: 80 },
    { code: 'CHILD', name: 'Детский осмотр', durationMin: 30, basePrice: 2000, sortOrder: 90 },
  ];
  for (const service of CATALOG) {
    const existing = await prisma.service.findFirst({ where: { organizationId: org.id, code: service.code } });
    if (existing) {
      await prisma.service.update({ where: { id: existing.id }, data: service });
    } else {
      await prisma.service.create({ data: { organizationId: org.id, ...service } });
    }
  }
  const priceList = await prisma.priceList.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'BASE' } },
    create: { organizationId: org.id, name: 'Прайс клиники 2026', code: 'BASE', isDefault: true, isActive: true },
    update: { name: 'Прайс клиники 2026', isDefault: true, isActive: true },
  });

  const services = await prisma.service.findMany({ where: { organizationId: org.id, NOT: { code: { startsWith: 'GROUP' } } } });
  for (const service of services) {
    if (!service.code || service.code.startsWith('GROUP')) continue;
    await prisma.priceListItem.upsert({
      where: { priceListId_serviceId: { priceListId: priceList.id, serviceId: service.id } },
      create: { priceListId: priceList.id, serviceId: service.id, price: service.basePrice },
      update: { price: service.basePrice },
    });
  }
  const svc = (code: string) => services.find((s) => s.code === code) ?? services[0];
  const consult = svc('CONSULT');
  const hygiene = svc('HYGIENE');
  const caries = svc('CARIES');
  const crown = svc('CROWN');
  const implant = svc('IMPLANT');
  const endo = svc('ENDO');
  const whitening = svc('WHITENING');

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
    allergies?: string[];
    chronicConditions?: string;
    medications?: string;
    contraindications?: string;
    anamnesis?: string;
    anxiety?: 'NONE' | 'MILD' | 'HIGH';
    pregnant?: boolean;
    anticoagulant?: boolean;
  };

  const DEMO_PATIENTS: DemoPatient[] = [
    { id: 'seed-patient-anna', firstName: 'Анна', lastName: 'Смирнова', phone: '+7 (900) 123-45-67', email: 'anna@example.com', tags: ['VIP', 'постоянный'], gender: 'FEMALE', birthDate: new Date('1988-03-12'), notes: 'Боится уколов. Просит объяснять каждый шаг.', allergies: ['Лидокаин', 'Латекс'], chronicConditions: 'Гипертоническая болезнь, давление контролируется', medications: 'Эналаприл 5 мг утром', contraindications: 'Адреналин в анестезии — только после согласования с кардиологом', anamnesis: 'Пломбы в боковом отделе. Хочет закрыть 16 коронкой после лечения кариеса. На 46 — новая полость.', anxiety: 'HIGH' },
    { id: 'seed-patient-petr', firstName: 'Пётр', lastName: 'Волков', phone: '+7 (900) 111-11-11', tags: ['new'], gender: 'MALE', birthDate: new Date('1995-07-20'), notes: 'Сегодня 09:00 — ждёт приёма' },
    { id: 'seed-patient-maria', firstName: 'Мария', lastName: 'Орлова', phone: '+7 (900) 222-22-22', gender: 'FEMALE', notes: 'Сегодня 09:30 — подтверждена' },
    { id: 'seed-patient-oleg', firstName: 'Олег', lastName: 'Новиков', phone: '+7 (900) 333-33-33', gender: 'MALE', notes: 'Сегодня 10:00' },
    { id: 'seed-patient-elena', firstName: 'Елена', lastName: 'Морозова', phone: '+7 (900) 444-44-44', gender: 'FEMALE', notes: 'Беременность 22 недели, без рентгена', pregnant: true },
    { id: 'seed-patient-dmitry', firstName: 'Дмитрий', lastName: 'Кузнецов', phone: '+7 (900) 555-55-55', gender: 'MALE', notes: 'Сейчас на приёме' },
    { id: 'seed-patient-sofia', firstName: 'София', lastName: 'Лебедева', phone: '+7 (900) 666-66-66', gender: 'FEMALE', notes: 'Сегодня после обеда' },
    { id: 'seed-patient-igor', firstName: 'Игорь', lastName: 'Соколов', phone: '+7 (900) 777-77-77', gender: 'MALE', notes: 'Постоянно принимает варфарин', medications: 'Варфарин 2.5 мг', anticoagulant: true },
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
    { id: 'seed-patient-vera', firstName: 'Вера', lastName: 'Никитина', phone: '+7 (900) 909-09-09', gender: 'FEMALE', notes: 'Просит короткие визиты', anxiety: 'MILD' },
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
        allergies: p.allergies ?? [],
        chronicConditions: p.chronicConditions,
        medications: p.medications,
        contraindications: p.contraindications,
        anamnesis: p.anamnesis,
        anxiety: p.anxiety ?? 'NONE',
        pregnant: p.pregnant ?? false,
        anticoagulant: p.anticoagulant ?? false,
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
        allergies: p.allergies ?? [],
        chronicConditions: p.chronicConditions,
        medications: p.medications,
        contraindications: p.contraindications,
        anamnesis: p.anamnesis,
        anxiety: p.anxiety ?? 'NONE',
        pregnant: p.pregnant ?? false,
        anticoagulant: p.anticoagulant ?? false,
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
    id?: string;
  }[] = [
    { patientId: 'seed-patient-petr', hour: 9, status: 'CONFIRMED', serviceId: consult?.id, notes: 'seed:today' },
    { patientId: 'seed-patient-maria', hour: 9, minute: 30, status: 'SCHEDULED', serviceId: hygiene?.id, notes: 'seed:today' },
    { patientId: 'seed-patient-oleg', hour: 10, status: 'CONFIRMED', serviceId: consult?.id, doctorId: doctor2.id, cabinetId: 'seed-cabinet-2', notes: 'seed:today' },
    { patientId: 'seed-patient-elena', hour: 10, minute: 30, status: 'CONFIRMED', serviceId: caries?.id, notes: 'seed:today' },
    { patientId: 'seed-patient-dmitry', hour: 11, status: 'IN_PROGRESS', serviceId: caries?.id, notes: 'seed:today' },
    { patientId: 'seed-patient-igor', hour: 8, minute: 30, status: 'CONFIRMED', serviceId: consult?.id, notes: 'seed:today-late' },
    { patientId: 'seed-patient-sofia', hour: 14, status: 'CONFIRMED', serviceId: hygiene?.id, notes: 'seed:today' },
    { patientId: 'seed-patient-viktor', hour: 11, minute: 30, status: 'WAITING', serviceId: consult?.id, notes: 'seed:today-queue' },
    { patientId: 'seed-patient-tatiana', hour: 11, minute: 45, status: 'IN_PROGRESS', serviceId: caries?.id, notes: 'seed:today-chair' },
    { id: 'seed-appt-anna', patientId: 'seed-patient-anna', hour: 15, status: 'CONFIRMED', serviceId: consult?.id, notes: 'seed:today-anna' },
    { id: 'seed-appt-roman', patientId: 'seed-patient-roman', hour: 12, status: 'COMPLETED', serviceId: consult?.id, notes: 'seed:today' },
  ];

  for (const a of todayAppointments) {
    const startsAt = todayAt(a.hour, a.minute ?? 0);
    const duration = a.serviceId === hygiene?.id ? 60 : 30;
    await prisma.appointment.create({
      data: {
        ...(a.id ? { id: a.id } : {}),
        organizationId: org.id,
        branchId: branch.id,
        cabinetId: a.cabinetId ?? 'seed-cabinet-1',
        doctorId: a.doctorId ?? doctor2.id,
        patientId: a.patientId,
        serviceId: a.serviceId,
        startsAt,
        endsAt: apptEnd(startsAt, duration),
        status: a.status,
        notes: a.notes,
      },
    });
  }

  for (const offset of [-3, -2, 2, 3]) {
    const day = new Date();
    day.setDate(day.getDate() + offset);
    day.setHours(offset < 0 ? 15 : 16, 0, 0, 0);
    const patientId = offset < 0 ? 'seed-patient-vera' : 'seed-patient-lidia';
    await prisma.appointment.create({
      data: {
        organizationId: org.id,
        branchId: branch.id,
        cabinetId: offset % 2 === 0 ? 'seed-cabinet-2' : 'seed-cabinet-1',
        doctorId: offset % 2 === 0 ? doctor2.id : employee.id,
        patientId,
        serviceId: offset < 0 ? hygiene?.id : consult?.id,
        startsAt: day,
        endsAt: apptEnd(day, offset < 0 ? 60 : 30),
        status: offset < 0 ? 'COMPLETED' : 'CONFIRMED',
        notes: 'seed:week',
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

  await prisma.treatmentPlan.updateMany({
    where: { patientId: { in: patientIds } },
    data: { parentPlanId: null },
  });
  await prisma.treatmentPlanItem.updateMany({
    where: { plan: { patientId: { in: patientIds } } },
    data: { phaseId: null },
  });
  await prisma.planPhase.updateMany({
    where: { plan: { patientId: { in: patientIds } } },
    data: { dependsOnId: null },
  });
  await prisma.planPhase.deleteMany({ where: { plan: { patientId: { in: patientIds } } } });
  await prisma.treatmentPlan.deleteMany({ where: { patientId: { in: patientIds } } });

  const fill = (tooth: number, surfaces: string[], sort: number, discount = 0): SeedLine => ({
    title: 'Лечение кариеса',
    toothNum: tooth,
    surfaces,
    price: Math.round(5500 * (1 - discount / 100)),
    listPrice: 5500,
    discountPercent: discount,
    serviceId: caries?.id,
    durationMin: 60,
    sortOrder: sort,
  });
  await seedTier({
    id: 'seed-plan-anna-econom',
    organizationId: org.id,
    patientId: patient.id,
    doctorId: employee.id,
    title: 'Реставрация · Эконом',
    tier: 'ECONOM',
    familyKey: 'seed-family-anna',
    guaranteeMonths: 12,
    durationWeeks: 2,
    installmentMonths: 0,
    phases: [{ title: 'Санация', specialty: 'Терапия', healingDays: 0, items: [fill(16, ['O', 'D'], 1), fill(46, ['O'], 2)] }],
  });
  await seedTier({
    id: 'seed-plan-anna-optimum',
    organizationId: org.id,
    patientId: patient.id,
    doctorId: employee.id,
    title: 'Реставрация · Оптимум',
    tier: 'OPTIMUM',
    familyKey: 'seed-family-anna',
    guaranteeMonths: 24,
    durationWeeks: 6,
    installmentMonths: 3,
    phases: [
      { title: 'Санация', specialty: 'Терапия', healingDays: 14, items: [fill(16, ['O', 'D'], 1), fill(46, ['O'], 2)] },
      {
        title: 'Ортопедия',
        specialty: 'Ортопедия',
        healingDays: 0,
        dependsOnSort: 1,
        items: [{ title: 'Коронка керамическая', toothNum: 16, surfaces: [], price: 25200, listPrice: 28000, discountPercent: 10, serviceId: crown?.id, durationMin: 60, sortOrder: 1 }],
      },
    ],
  });
  await seedTier({
    id: 'seed-plan-anna-premium',
    organizationId: org.id,
    patientId: patient.id,
    doctorId: employee.id,
    title: 'Реставрация · Премиум',
    tier: 'PREMIUM',
    familyKey: 'seed-family-anna',
    guaranteeMonths: 36,
    durationWeeks: 12,
    installmentMonths: 6,
    phases: [
      {
        title: 'Эндодонтия',
        specialty: 'Терапия',
        healingDays: 21,
        items: [
          { title: 'Лечение каналов', toothNum: 16, surfaces: ['O', 'D'], price: 12000, listPrice: 12000, serviceId: endo?.id, durationMin: 90, sortOrder: 1 },
          fill(46, ['O'], 2),
        ],
      },
      {
        title: 'Ортопедия',
        specialty: 'Ортопедия',
        healingDays: 7,
        dependsOnSort: 1,
        items: [{ title: 'Коронка керамическая', toothNum: 16, surfaces: [], price: 32200, listPrice: 32200, serviceId: crown?.id, durationMin: 60, sortOrder: 1 }],
      },
      {
        title: 'Эстетика',
        specialty: 'Гигиена',
        healingDays: 0,
        dependsOnSort: 2,
        items: [{ title: 'Отбеливание', price: 18000, listPrice: 18000, serviceId: whitening?.id, durationMin: 60, sortOrder: 1 }],
      },
    ],
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
          { title: 'Установка импланта', toothNum: 36, phase: 1, price: 45000, listPrice: 45000, sortOrder: 1, isCompleted: true, status: 'DONE', serviceId: implant?.id, durationMin: 90, completedAt: new Date() },
          { title: 'Формирователь десны', toothNum: 36, phase: 1, price: 12000, listPrice: 12000, sortOrder: 2, isCompleted: true, status: 'DONE', completedAt: new Date() },
          { title: 'Коронка на имплант', toothNum: 36, phase: 2, price: 28000, listPrice: 28000, sortOrder: 3, status: 'ACCEPTED', serviceId: crown?.id, durationMin: 60 },
          { title: 'КТ контроль', phase: 2, price: 3500, listPrice: 3500, sortOrder: 4, status: 'PROPOSED', durationMin: 20 },
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
  await prisma.toothSurface.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.toothEvent.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.toothRecord.createMany({
    data: [
      { patientId: patient.id, toothNum: 16, condition: 'CARIES', layer: 'PATHOLOGY', surfaces: ['O', 'D'], diagnosis: 'K02.1' },
      { patientId: patient.id, toothNum: 26, condition: 'FILLED', layer: 'EXISTING', surfaces: ['O'], diagnosis: 'Пломба 2022' },
      { patientId: patient.id, toothNum: 46, condition: 'CARIES', layer: 'PATHOLOGY', surfaces: ['O'], diagnosis: 'K02.0' },
      { patientId: 'seed-patient-kate', toothNum: 36, condition: 'IMPLANT', layer: 'EXISTING', diagnosis: 'Имплант установлен' },
      { patientId: 'seed-patient-vera', toothNum: 11, condition: 'CARIES', layer: 'PATHOLOGY', surfaces: ['M'], diagnosis: 'K02.0' },
      { patientId: 'seed-patient-vera', toothNum: 21, condition: 'HEALTHY', layer: 'EXISTING' },
    ],
  });
  await prisma.toothSurface.createMany({
    data: [
      { patientId: patient.id, toothNum: 16, surface: 'O', condition: 'CARIES', layer: 'PATHOLOGY', diagnosis: 'K02.1' },
      { patientId: patient.id, toothNum: 16, surface: 'D', condition: 'CARIES', layer: 'PATHOLOGY', diagnosis: 'K02.1' },
      { patientId: patient.id, toothNum: 26, surface: 'O', condition: 'FILLED', layer: 'EXISTING' },
      { patientId: patient.id, toothNum: 46, surface: 'O', condition: 'CARIES', layer: 'PATHOLOGY', diagnosis: 'K02.0' },
      { patientId: 'seed-patient-kate', toothNum: 36, surface: 'TOOTH', condition: 'IMPLANT', layer: 'EXISTING' },
      { patientId: 'seed-patient-vera', toothNum: 11, surface: 'M', condition: 'CARIES', layer: 'PATHOLOGY', diagnosis: 'K02.0' },
    ],
  });
  await prisma.toothEvent.createMany({
    data: [
      { patientId: patient.id, toothNum: 16, surfaces: ['O', 'D'], condition: 'CARIES', layer: 'PATHOLOGY', note: 'K02.1, средний кариес', source: 'EXAM' },
      { patientId: patient.id, toothNum: 26, surfaces: ['O'], condition: 'FILLED', layer: 'EXISTING', note: 'Пломба стоит с 2022', source: 'EXAM' },
      { patientId: 'seed-patient-kate', toothNum: 36, surfaces: [], condition: 'IMPLANT', layer: 'EXISTING', note: 'Выполнено: установка импланта', source: 'PLAN_DONE' },
    ],
  });

  const ago = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  };
  await prisma.perioExam.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.perioExam.create({
    data: {
      organizationId: org.id,
      patientId: patient.id,
      notes: 'Кровоточивость 16 и 17, карман до 5 мм',
      teeth: {
        create: [16, 17, 26].map((toothNum) => ({
          toothNum,
          mobility: toothNum === 16 ? 1 : 0,
          sites: {
            create: [0, 1, 2, 3, 4, 5].map((position) => ({
              position,
              pocket: toothNum === 16 && position < 3 ? 5 : toothNum === 17 ? 4 : 2,
              bleeding: toothNum !== 26 && position % 2 === 0,
            })),
          },
        })),
      },
    },
  });

  await prisma.patientConsent.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.patientConsent.createMany({
    data: ['seed-patient-petr', 'seed-patient-maria', 'seed-patient-oleg', 'seed-patient-elena', 'seed-patient-dmitry', 'seed-patient-sofia', 'seed-patient-roman', 'seed-patient-viktor', 'seed-patient-tatiana'].map((patientId) => ({
      organizationId: org.id,
      patientId,
      type: 'MEDICAL_TREATMENT' as const,
      status: 'SIGNED' as const,
      signedAt: new Date(),
    })),
  });

  await prisma.patientCommunication.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.patientCommunication.createMany({
    data: [
      { patientId: patient.id, channel: 'PHONE', summary: 'Подтвердила визит. Просит анестезию без адреналина.', createdAt: ago(1) },
      { patientId: patient.id, channel: 'TELEGRAM', summary: 'Напоминание: сегодня в 15:00, кабинет 1.', createdAt: ago(0) },
      { patientId: patient.id, channel: 'WHATSAPP', summary: 'Пациентка прислала фото старой пломбы на 26.', createdAt: ago(12) },
    ],
  });

  const annaPast = ago(18);
  annaPast.setHours(11, 0, 0, 0);
  await prisma.appointment.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      cabinetId: 'seed-cabinet-1',
      doctorId: employee.id,
      patientId: patient.id,
      serviceId: consult?.id,
      startsAt: annaPast,
      endsAt: new Date(annaPast.getTime() + 30 * 60_000),
      status: 'COMPLETED',
      notes: 'seed:history',
    },
  });

  await seedTier({
    id: 'seed-plan-abandoned',
    organizationId: org.id,
    patientId: 'seed-patient-artem',
    doctorId: employee.id,
    title: 'Санация · Оптимум',
    tier: 'OPTIMUM',
    familyKey: 'seed-family-artem',
    guaranteeMonths: 24,
    durationWeeks: 4,
    installmentMonths: 2,
    createdAt: ago(45),
    presentedAt: ago(40),
    phases: [{ title: 'Санация', specialty: 'Терапия', items: [fill(36, ['O'], 1)] }],
  });

  await prisma.branch.upsert({
    where: { id: 'seed-branch-patriki' },
    create: {
      id: 'seed-branch-patriki',
      organizationId: org.id,
      name: 'Патриаршие',
      address: 'г. Москва, Малый Палашёвский пер., 4',
    },
    update: { name: 'Патриаршие' },
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

  const daysAgo = (days: number, hour = 12) => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    date.setHours(hour, 15, 0, 0);
    return date;
  };
  await prisma.payment.createMany({
    data: [
      { organizationId: org.id, patientId: patient.id, amount: 5000, method: 'CARD', paidAt: daysAgo(0, 11) },
      { organizationId: org.id, patientId: 'seed-patient-alex', amount: 5500, method: 'CASH', paidAt: daysAgo(1) },
      { organizationId: org.id, patientId: 'seed-patient-natalia', amount: 8000, method: 'CARD', paidAt: daysAgo(2) },
      { organizationId: org.id, patientId: 'seed-patient-roman', amount: 1500, method: 'CARD', paidAt: daysAgo(0, 13) },
      { organizationId: org.id, patientId: 'seed-patient-kate', amount: 45000, method: 'CARD', paidAt: daysAgo(6) },
      { organizationId: org.id, patientId: 'seed-patient-vera', amount: 6500, method: 'CARD', paidAt: daysAgo(4) },
      { organizationId: org.id, patientId: patient.id, amount: 12000, method: 'CARD', paidAt: daysAgo(9) },
      { organizationId: org.id, patientId: 'seed-patient-oleg', amount: 28000, method: 'CARD', paidAt: daysAgo(11) },
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

  await prisma.medicalRecordHash.deleteMany({ where: { organizationId: org.id, recordId: 'seed-plan-anna-optimum' } });
  await prisma.medicalRecordHash.create({
    data: {
      organizationId: org.id,
      patientId: patient.id,
      recordType: 'TreatmentPlan',
      recordId: 'seed-plan-anna-optimum',
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
      message: 'Напоминание: не забудьте про визит в «Седракович Дент»',
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
      rulesJson: { tag: 'VIP' },
      isDynamic: true,
    },
    update: {},
  });
  await prisma.patientSegmentMember.deleteMany({ where: { segmentId: segment.id } });
  for (const p of DEMO_PATIENTS.filter((x) => x.tags?.includes('VIP'))) {
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

  await prisma.imagingAnnotation.deleteMany({ where: { study: { patientId: { in: patientIds } } } });
  await prisma.imagingStudy.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.photoProtocol.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.prescription.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.followUp.deleteMany({ where: { patientId: { in: patientIds } } });
  writeClinicFiles();
  const ortho = await prisma.planPhase.findFirst({ where: { planId: 'seed-plan-anna-optimum', title: 'Ортопедия' } });
  const beforeProtocol = await prisma.photoProtocol.create({
    data: {
      organizationId: org.id,
      patientId: patient.id,
      appointmentId: 'seed-appt-anna',
      moment: 'BEFORE',
      title: 'До лечения',
      takenAt: ago(18),
      shots: {
        create: [
          { slot: 'FACE_SMILE', fileUrl: '/uploads/imaging/smile-before.svg' },
          { slot: 'FACE_REST', fileUrl: '/uploads/imaging/face-rest.svg' },
          { slot: 'FACE_PROFILE', fileUrl: '/uploads/imaging/profile.svg' },
          { slot: 'RETRACT_FRONT', fileUrl: '/uploads/imaging/retract.svg' },
          { slot: 'TOOTH', fileUrl: '/uploads/imaging/tooth-16.svg', toothNum: 16 },
        ],
      },
    },
  });
  await prisma.photoProtocol.create({
    data: {
      organizationId: org.id,
      patientId: patient.id,
      phaseId: ortho?.id,
      moment: 'AFTER',
      title: 'После ортопедии',
      shots: { create: [{ slot: 'FACE_SMILE', fileUrl: '/uploads/imaging/smile-after.svg' }] },
    },
  });
  const intraoral = await prisma.imagingStudy.create({
    data: {
      patientId: patient.id,
      appointmentId: 'seed-appt-anna',
      type: 'INTRAORAL',
      title: 'Прицельный 16',
      fileUrl: '/uploads/imaging/tooth-16.svg',
      toothNum: 16,
      takenAt: ago(18),
    },
  });
  await prisma.imagingAnnotation.create({
    data: {
      studyId: intraoral.id,
      toothNum: 16,
      kind: 'CARIES',
      source: 'AI',
      label: 'Черновик: затемнение на 16, не диагноз',
      confidence: 0.82,
      x: 0.42,
      y: 0.38,
      w: 0.18,
      h: 0.16,
    },
  });
  await prisma.imagingStudy.create({
    data: { patientId: patient.id, type: 'OPG', title: 'Панорама', fileUrl: '/uploads/imaging/opg.svg', takenAt: ago(18) },
  });
  await prisma.imagingStudy.create({
    data: { patientId: patient.id, type: 'DICOM', title: 'Срез КТ', fileUrl: '/uploads/imaging/slice.dcm', toothNum: 16, seriesKey: 'seed-ct-anna', sliceIndex: 0, takenAt: ago(18) },
  });
  for (let slice = 0; slice < 8; slice++) {
    await prisma.imagingStudy.create({
      data: {
        patientId: patient.id,
        type: 'CT',
        title: 'КТ нижней челюсти',
        fileUrl: `/uploads/imaging/ct-${slice}.png`,
        toothNum: 16,
        seriesKey: 'seed-ct-stack',
        sliceIndex: slice,
        takenAt: ago(18),
      },
    });
  }
  await prisma.imagingStudy.create({
    data: { patientId: patient.id, type: 'STL', title: 'Скан 16', fileUrl: '/uploads/imaging/tooth.stl', toothNum: 16, phaseId: ortho?.id },
  });
  await prisma.visitNote.upsert({
    where: { appointmentId: 'seed-appt-roman' },
    create: {
      appointmentId: 'seed-appt-roman',
      complaints: 'Чувствительность на холодное',
      objective: 'Зуб 26, пломба состоятельна',
      diagnosis: 'K03.8 гиперчувствительность',
      treatment: 'Осмотр, рекомендации по пасте',
      recommendations: 'Контроль через 6 месяцев',
    },
    update: {},
  });
  await prisma.prescription.create({
    data: {
      organizationId: org.id,
      patientId: 'seed-patient-roman',
      appointmentId: 'seed-appt-roman',
      doctorId: employee.id,
      drug: 'Ибупрофен',
      dose: '200 мг',
      sig: 'при боли, не чаще 3 раз в сутки',
      days: 3,
    },
  });
  const recallAt = new Date();
  recallAt.setDate(recallAt.getDate() - 200);
  await prisma.appointment.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      cabinetId: 'seed-cabinet-1',
      doctorId: employee.id,
      patientId: 'seed-patient-alex',
      serviceId: hygiene?.id,
      startsAt: recallAt,
      endsAt: new Date(recallAt.getTime() + 60 * 60_000),
      status: 'COMPLETED',
      notes: 'seed:recall',
    },
  });
  const followDue = new Date();
  followDue.setDate(followDue.getDate() + 5);
  await prisma.followUp.create({
    data: {
      organizationId: org.id,
      patientId: 'seed-patient-kate',
      dueAt: followDue,
      reason: 'Снять слепок под коронку на имплант 36',
    },
  });
  const birthday = new Date();
  birthday.setDate(birthday.getDate() + 2);
  birthday.setFullYear(1992);
  await prisma.patient.update({ where: { id: 'seed-patient-sofia' }, data: { birthDate: birthday } });
  void beforeProtocol;

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
      body: 'Ждём вас завтра в {{time}} — Седракович Дент',
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

  console.log(`✅ Seed OK: ${DEMO_PATIENTS.length} демо-пациентов, «Седракович Дент»`);
  console.log('   owner@demo.local / demo12345');
  console.log('   doctor@demo.local / demo12345');
  console.log('   admin@demo.local / demo12345');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
