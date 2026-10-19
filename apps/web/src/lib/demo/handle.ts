import { phoneDigits } from '../phone';
import { PLAN_TEMPLATES, composeFamily, lineTotal, type Mark } from '../plan-engine';
import { resultFor, serviceKit, surfacesFor } from '../service-kit';
import { canMoveVisit, dayLoad, fromKopecks, invoiceStatus, isVisitClosed, isVisitStatus, kopecks, labDueAt, parseWorkHours, patientSegments, phoneMatches, searchTerms, SEGMENTS, visitMoveError, wallDate, type PatientSegment, type VisitStatus } from '@dentasmart/shared';
import snapshot from './snapshot.json';
import { demoLabWork, demoRoute, reserveDemoLines, type DemoReservation } from './route';

const KEY = 'sd.demo.v1';
const ANCHOR = snapshot.anchor;
const ANCHOR_MS = Date.UTC(2026, 9, 15);
const WINDOW = 400 * 86400000;

type Bag = {
  gets: Record<string, unknown>;
  appointments: Appointment[];
  versions: Record<string, Version[]>;
};

type Appointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  cabinetId: string | null;
  doctorId: string | null;
  patientId: string;
  patient: string;
  doctor: string;
  cabinet: string;
  service: string;
  serviceId?: string | null;
  allergies?: string[];
};

type Version = { id: string; note: string | null; createdAt: string };
type AnyRec = Record<string, any>;

let memory: Bag | null = null;

function uid() {
  return `demo_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function dayShift() {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return today - ANCHOR_MS;
}

function shouldShift(value: string) {
  const iso = value.length === 10 ? `${value}T00:00:00.000Z` : value;
  const time = Date.parse(iso);
  return !Number.isNaN(time) && Math.abs(time - ANCHOR_MS) < WINDOW;
}

function shiftString(value: string, dir: 1 | -1) {
  if (/^\d{4}-\d{2}-\d{2}T/.test(value) && shouldShift(value)) {
    return new Date(Date.parse(value) + dir * dayShift()).toISOString();
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value) && shouldShift(value)) {
    return new Date(Date.parse(`${value}T00:00:00.000Z`) + dir * dayShift()).toISOString().slice(0, 10);
  }
  return value;
}

function shift<T>(value: T, dir: 1 | -1): T {
  if (typeof value === 'string') return shiftString(value, dir) as T;
  if (Array.isArray(value)) return value.map((item) => shift(item, dir)) as T;
  if (value && typeof value === 'object') {
    const out: AnyRec = {};
    for (const [key, item] of Object.entries(value)) out[key] = shift(item, dir);
    return out as T;
  }
  return value;
}

function emptyBag(): Bag {
  const gets = structuredClone(snapshot.gets) as Record<string, unknown>;
  const schedule = gets[`/workspace/schedule?date=${ANCHOR}`] as { appointments?: Appointment[] } | undefined;
  return {
    gets,
    appointments: structuredClone(schedule?.appointments ?? []),
    versions: {},
  };
}

function load(): Bag {
  if (memory) return memory;
  if (typeof window !== 'undefined') {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      try {
        memory = JSON.parse(raw) as Bag;
        return memory;
      } catch {
        window.localStorage.removeItem(KEY);
      }
    }
  }
  memory = emptyBag();
  return memory;
}

function persist() {
  if (typeof window === 'undefined' || !memory) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    /* the seed still works for this tab */
  }
}

function roleOf(token: string) {
  const email = Object.entries(snapshot.users).find(([, user]) => user.accessToken === token)?.[0] ?? '';
  if (email.startsWith('doctor')) return 'doctor';
  if (email.startsWith('admin')) return 'admin';
  return 'owner';
}

function patients(bag: Bag) {
  return ((bag.gets['/patients?pageSize=500'] as AnyRec).items ?? []) as AnyRec[];
}

function config(bag: Bag) {
  return bag.gets['/config'] as AnyRec;
}

function personName(row: AnyRec | undefined) {
  if (!row) return 'Пациент';
  return `${row.lastName ?? ''} ${row.firstName ?? ''}`.trim();
}

function findPatient(bag: Bag, id: string) {
  return patients(bag).find((row) => row.id === id);
}

function serviceById(bag: Bag, id?: string) {
  return (config(bag).services as AnyRec[]).find((row) => row.id === id);
}

function anchorNow() {
  return new Date(Date.now() - dayShift()).toISOString();
}

function cards(bag: Bag) {
  return Object.entries(bag.gets)
    .filter(([key]) => /^\/workspace\/patients\/[^/]+\/card$/.test(key))
    .map(([, value]) => value as AnyRec);
}

function eachPlan(bag: Bag, visit: (plan: AnyRec, family: AnyRec, card: AnyRec | null) => void) {
  for (const card of cards(bag)) {
    for (const family of card.families ?? []) {
      for (const plan of family.plans ?? []) visit(plan, family, card);
    }
  }
  for (const [key, value] of Object.entries(bag.gets)) {
    if (!key.startsWith('/workspace/families/')) continue;
    const payload = value as AnyRec;
    for (const plan of payload.plans ?? []) visit(plan, payload, null);
  }
}

function planItems(plan: AnyRec) {
  return [
    ...(plan.phases ?? []).flatMap((phase: AnyRec) => phase.items ?? []),
    ...(plan.looseItems ?? []),
  ] as AnyRec[];
}

function read(path: string, token: string): unknown {
  const bag = load();
  const url = new URL(path, 'http://demo.local');
  const pathname = url.pathname.replace(/\/$/, '') || '/';
  const query = Object.fromEntries(url.searchParams.entries());

  if (pathname === '/auth/me') {
    const user = Object.values(snapshot.users).find((row) => row.accessToken === token)?.user;
    if (!user) throw new Error('Сессия истекла');
    return user;
  }

  if (pathname === '/workspace/home') {
    return bag.gets[`role:${roleOf(token)}:/workspace/home`] ?? bag.gets['/workspace/home'];
  }

  if (pathname === '/patients') return patientPage(bag, query);
  if (pathname === '/workspace/search') return searchPeople(bag, query.q ?? '');
  if (pathname === '/flow/caller') return searchPeople(bag, query.phone ?? '');
  if (pathname === '/workspace/schedule/range') return scheduleRange(bag, query.from ?? ANCHOR, query.to ?? ANCHOR);
  if (pathname === '/workspace/schedule') return scheduleFor(bag, query.date || ANCHOR);
  if (pathname === '/showcase/copilot') {
    return bag.gets['/showcase/copilot'] ?? bag.gets[`/showcase/copilot?patientId=${query.patientId}&note=кариес`];
  }
  if (pathname === '/config/services/export') return priceCsv(bag);
  if (pathname.startsWith('/market/export/')) {
    const stored = bag.gets[pathname];
    return stored ?? { filename: `${pathname.split('/').pop()}.csv`, csv: '\uFEFFдемо\n' };
  }
  if (pathname === '/market/export-1c') return bag.gets[pathname] ?? { filename: '1c.json', json: { demo: true } };

  const route = pathname.match(/^\/route\/patients\/([^/]+)$/);
  if (route) return demoRoute(acceptedPlanOf(bag, route[1]), bag.appointments, (bag.gets['/lab/orders'] ?? []) as AnyRec[]);
  const sheetPath = pathname.match(/^\/workspace\/plans\/([^/]+)\/sheet$/);
  if (sheetPath) return buildSheet(bag, sheetPath[1]);
  if (pathname === '/config') {
    seedTemplates(bag);
    return config(bag);
  }
  if (pathname === '/workspace/recall') return recallList(bag);

  const anchored = anchorPath(pathname, query);
  if (anchored in bag.gets) return bag.gets[anchored];
  if (pathname + url.search in bag.gets) return bag.gets[pathname + url.search];

  const versions = pathname.match(/^\/workspace\/plans\/([^/]+)\/versions$/);
  if (versions) return bag.versions[versions[1]] ?? bag.gets[pathname] ?? [];

  if (pathname in bag.gets) return bag.gets[pathname];
  const prefixed = Object.keys(bag.gets).find((key) => key.startsWith(`${pathname}?`));
  if (prefixed) return bag.gets[prefixed];

  if (pathname === '/finance/cash-shift/current') {
    const key = Object.keys(bag.gets).find((item) => item.startsWith('/finance/cash-shift/current'));
    return key ? bag.gets[key] : null;
  }

  if (pathname === '/appointments/day' || pathname === '/appointments') {
    const key = Object.keys(bag.gets).find((item) => item.startsWith(pathname));
    return key ? bag.gets[key] : [];
  }

  throw new Error('Нет в демо');
}

function anchorPath(pathname: string, query: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    params.set(key, /^\d{4}-\d{2}-\d{2}/.test(value) ? shiftString(value.slice(0, 10), -1) : value);
  }
  const search = params.toString();
  return pathname + (search ? `?${search}` : '');
}

/** Mirrors PatientsService.findAll: same search, segments, counters, sorting and paging. */
function patientPage(bag: Bag, query: Record<string, string>) {
  const { words, digits } = searchTerms(query.search ?? '');
  const now = anchorNow();
  const fold = (text: string) => text.toLowerCase().replace(/ё/g, 'е');
  const invoices = (bag.gets['/finance/invoices'] ?? []) as AnyRec[];
  const found = patients(bag)
    .filter((row) => row.isActive !== false)
    .filter((row) => {
      const name = fold(`${row.lastName} ${row.firstName} ${row.middleName ?? ''}`);
      return words.every((word) => name.includes(word)) && phoneMatches(row.phone, digits);
    })
    .map((row) => {
      const own = bag.appointments.filter((visit) => visit.patientId === row.id);
      const lastVisit = own.filter((visit) => visit.status === 'COMPLETED').map((visit) => visit.startsAt).sort().at(-1) ?? null;
      const nextVisit = own
        .filter((visit) => visit.startsAt >= now && !['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(visit.status))
        .map((visit) => visit.startsAt)
        .sort()[0] ?? null;
      const debtKopecks = invoices
        .filter((invoice) => invoice.patientId === row.id && ['ISSUED', 'PARTIAL'].includes(invoice.status))
        .reduce((sum, invoice) => sum + Math.max(0, kopecks(invoice.totalAmount) - kopecks(invoice.discountAmount) - kopecks(invoice.paidAmount)), 0);
      const clientType = (row.clientType as string | null | undefined) ?? null;
      return {
        ...row,
        clientType,
        lastVisit,
        nextVisit,
        debt: fromKopecks(debtKopecks),
        deposit: String(row.deposit ?? '0.00'),
        segments: patientSegments({ phone: row.phone ?? null, lastVisit, nextVisit, debtKopecks, clientType }, new Date(now)),
      };
    });

  const segments = Object.fromEntries(SEGMENTS.map((item) => [item.id, 0])) as Record<string, number>;
  for (const row of found) {
    segments.all += 1;
    for (const id of row.segments) segments[id] += 1;
  }
  const segment = SEGMENTS.some((item) => item.id === query.segment) ? query.segment : 'all';
  const sort = ['name', 'lastVisit', 'nextVisit', 'debt', 'recent'].includes(query.sort) ? query.sort : 'name';
  const latin = (row: AnyRec) => (/^[A-Za-z]/.test(String(row.lastName)) ? 1 : 0);
  const byName = (a: AnyRec, b: AnyRec) => latin(a) - latin(b) || fold(`${a.lastName} ${a.firstName}`).localeCompare(fold(`${b.lastName} ${b.firstName}`), 'ru');
  const late = (value: string | null, empty: string) => value ?? empty;
  const order: Record<string, (a: AnyRec, b: AnyRec) => number> = {
    name: byName,
    lastVisit: (a, b) => late(b.lastVisit, '').localeCompare(late(a.lastVisit, '')),
    nextVisit: (a, b) => late(a.nextVisit, '9999').localeCompare(late(b.nextVisit, '9999')),
    debt: (a, b) => kopecks(b.debt) - kopecks(a.debt),
    recent: (a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')),
  };
  const items = found
    .filter((row) => segment === 'all' || row.segments.includes(segment as PatientSegment))
    .sort((a, b) => order[sort](a, b) || byName(a, b));
  const pageSize = Math.min(500, Math.max(1, Number(query.pageSize) || 20));
  const page = Math.max(1, Number(query.page) || 1);
  return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize, segment, sort, segments };
}

function searchPeople(bag: Bag, raw: string) {
  const needle = decodeURIComponent(raw).trim().toLowerCase();
  const digits = needle.replace(/\D/g, '');
  if (needle.length < 2 && digits.length < 4) return [];
  return patients(bag)
    .filter((row) => row.isActive !== false)
    .filter((row) => `${row.lastName} ${row.firstName} ${row.phone ?? ''}`.toLowerCase().includes(needle)
      || (digits.length >= 4 && phoneDigits(row.phone).includes(digits)))
    .slice(0, 8)
    .map((row) => ({ id: row.id, firstName: row.firstName, lastName: row.lastName, phone: row.phone ?? null, birthDate: row.birthDate ?? null }));
}

function scheduleFor(bag: Bag, date: string) {
  const shell = bag.gets[`/workspace/schedule?date=${ANCHOR}`] as AnyRec;
  const day = shiftString(date.slice(0, 10), -1);
  const appointments = bag.appointments.filter((row) => row.startsAt.slice(0, 10) === day && row.status !== 'CANCELLED');
  return { ...shell, date: `${day}T00:00:00.000Z`, appointments };
}

/** Same shape as the API's GET /workspace/schedule/range, worked out from the demo's stored visits. */
function scheduleRange(bag: Bag, fromRaw: string, toRaw: string) {
  const from = shiftString(fromRaw.slice(0, 10), -1);
  const to = shiftString(toRaw.slice(0, 10), -1);
  const fromDay = Date.parse(`${from}T00:00:00Z`);
  const days = Math.max(1, Math.min(62, Math.round((Date.parse(`${to}T00:00:00Z`) - fromDay) / 86400000) + 1));
  const shell = bag.gets[`/workspace/schedule?date=${ANCHOR}`] as AnyRec;
  const chairs = ((shell.branches ?? []) as AnyRec[]).reduce((sum, branch) => sum + (branch.cabinets?.length ?? 0), 0);
  const offset = 180;
  const hours = parseWorkHours((config(bag).brand as AnyRec | undefined)?.workHours);
  const visits = bag.appointments.filter((row) => row.status !== 'CANCELLED');
  const dates = Array.from({ length: days }, (_, index) => new Date(fromDay + index * 86400000).toISOString().slice(0, 10));
  const inRange = visits.filter((row) => dates.includes(wallDate(row.startsAt, offset)));
  return {
    from, to, timezone: 'Europe/Moscow', offsetMinutes: offset, hours, chairs,
    days: dates.map((date) => ({ date, ...dayLoad(inRange.filter((row) => wallDate(row.startsAt, offset) === date), { chairs, ...hours, tzOffsetMinutes: offset }) })),
    appointments: inRange.sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
  };
}

function priceCsv(bag: Bag) {
  const lines = ['Название;Код;Цена;Минуты'];
  for (const row of config(bag).services as AnyRec[]) {
    if (!row.code) continue;
    lines.push(`${row.name};${row.code};${row.price};${row.durationMin}`);
  }
  return { filename: 'price.csv', csv: `\uFEFF${lines.join('\n')}` };
}

function write(path: string, method: string, body: AnyRec, token: string): unknown {
  const bag = load();
  const url = new URL(path, 'http://demo.local');
  const pathname = url.pathname.replace(/\/$/, '') || '/';
  const data = shift(body, -1) as AnyRec;

  if (pathname === '/auth/login') return login(data);
  if (pathname === '/auth/refresh') {
    const email = String(data.refreshToken ?? '').replace('demo-refresh:', '');
    const user = (snapshot.users as AnyRec)[email];
    if (!user) throw new Error('Сессия истекла');
    return { accessToken: user.accessToken, refreshToken: user.refreshToken };
  }
  if (pathname === '/auth/2fa/setup') return { secret: 'DEMO2FASECRET', uri: 'otpauth://totp/Sedrakovich%20Dent?secret=DEMO2FASECRET&issuer=Sedrakovich%20Dent' };
  if (pathname === '/auth/2fa/enable' || pathname === '/auth/2fa/disable') return { enabled: pathname.endsWith('enable') };

  const patientCreate = pathname === '/patients' && method === 'POST';
  if (patientCreate) return addPatient(bag, data);

  const patientPatch = pathname.match(/^\/patients\/([^/]+)$/);
  if (patientPatch && method === 'PATCH') return patchPatient(bag, patientPatch[1], data);

  if (pathname === '/market/calls/missed') return addLead(bag, data);
  const leadPatch = pathname.match(/^\/market\/leads\/([^/]+)$/);
  if (leadPatch) return patchLead(bag, leadPatch[1], data);
  if (pathname === '/market/keys') {
    const tokenValue = `sd_demo_${uid().slice(0, 10)}`;
    const exchange = bag.gets['/market/exchange'] as AnyRec;
    exchange.keys = [{ token: tokenValue, name: data.name ?? 'Обмен' }, ...(exchange.keys ?? [])];
    return { token: tokenValue };
  }
  if (pathname.startsWith('/market/aggregators/')) return addLead(bag, { name: 'Заявка с агрегатора', phone: '+79000000000', source: pathname.includes('sber') ? 'СберЗдоровье' : 'ПроДокторов' });
  if (pathname === '/market/warranty' && method === 'POST') return pushNamed(bag, '/market/warranty', 'items', warrantyRow(bag, data));
  if (pathname === '/market/insurers') return pushNamed(bag, '/market/insurance', 'insurers', { id: uid(), name: data.name });
  if (pathname === '/market/policies') return pushNamed(bag, '/market/insurance', 'policies', policyRow(bag, data));
  const bill = pathname.match(/^\/market\/bills\/([^/]+)$/);
  if (bill) return patchIn(bag.gets['/market/insurance'] as AnyRec, 'bills', bill[1], data);
  const marketPatient = pathname.match(/^\/market\/patients\/([^/]+)(?:\/(.+))?$/);
  if (marketPatient) return marketWrite(bag, marketPatient[1], marketPatient[2], data);
  const esign = pathname.match(/^\/market\/esign\/([^/]+)\/confirm$/);
  if (esign) return { ok: true };

  if (pathname === '/config/services') return saveService(bag, data);
  const archive = pathname.match(/^\/config\/services\/([^/]+)\/archive$/);
  if (archive) {
    const row = (config(bag).services as AnyRec[]).find((item) => item.id === archive[1]);
    if (row && typeof data.active === 'boolean') row.isActive = data.active;
    return row ?? { ok: true };
  }
  if (pathname === '/config/services/bulk') {
    const percent = Number(data.percent) || 0;
    for (const row of config(bag).services as AnyRec[]) {
      if (row.code) row.price = Math.max(0, Math.round(row.price * (1 + percent / 100)));
    }
    return { ok: true };
  }
  if (pathname === '/config/stock') return data.id ? updateStock(bag, data.id, data) : addStock(bag, data);
  const receive = pathname.match(/^\/config\/stock\/([^/]+)\/receive$/);
  if (receive) return receiveStock(bag, receive[1], Number(data.quantity ?? 1));
  if (pathname === '/config/visit-templates') return saveTemplate(bag, data);
  if (pathname === '/config/plan-templates') return pushConfig(bag, 'planTemplates', { id: uid(), ...data });
  if (pathname === '/config/documents') return pushConfig(bag, 'documents', { id: uid(), ...data });
  if (pathname === '/config/brand') {
    config(bag).brand = { ...(config(bag).brand ?? {}), ...data };
    return config(bag).brand;
  }
  if (pathname === '/config/cabinets') return pushConfig(bag, 'cabinets', { id: uid(), name: data.name });
  if (pathname === '/config/employees') return saveEmployee(bag, data);
  if (pathname === '/employees' && method === 'POST') return saveEmployee(bag, data);
  if (pathname === '/employees/schedules' && method === 'POST') return addShift(bag, data);
  const employeePatch = pathname.match(/^\/employees\/([^/]+)$/);
  if (employeePatch && !['schedules', 'roles', 'payroll'].includes(employeePatch[1]) && (method === 'PATCH' || method === 'POST')) {
    return saveEmployee(bag, { id: employeePatch[1], ...data });
  }
  if (pathname === '/config/roles') return saveRole(bag, data);
  if (pathname === '/config/promos') return pushConfig(bag, 'promos', { id: uid(), code: data.code, discountPct: data.discountPct ?? 10, isActive: true });
  if (pathname === '/config/rules') return pushConfig(bag, 'rules', { id: uid(), ...data, isActive: true });

  if (pathname === '/workspace/appointments') {
    const startsAt = new Date(data.startsAt).toISOString();
    const endsAt = new Date(Date.parse(startsAt) + (Number(data.durationMin) || 30) * 60000).toISOString();
    assertFree(bag, { id: '' } as Appointment, startsAt, endsAt, data.cabinetId ?? null, data.doctorId ?? null);
    return book(bag, data);
  }
  const moveStatus = pathname.match(/^\/appointments\/([^/]+)\/status$/);
  if (moveStatus && method === 'PATCH') return setVisitStatus(bag, moveStatus[1], String(data.status ?? ''));
  const move = pathname.match(/^\/appointments\/([^/]+)$/);
  if (move && method === 'PATCH') return moveAppointment(bag, move[1], data);
  const visit = pathname.match(/^\/flow\/visits\/([^/]+)(?:\/([^/]+))?$/);
  if (visit && visit[2]) return visitAction(bag, visit[1], visit[2], data);

  const chart = pathname.match(/^\/workspace\/patients\/([^/]+)\/chart$/);
  if (chart) return paint(bag, chart[1], data);
  const perio = pathname.match(/^\/workspace\/patients\/([^/]+)\/perio$/);
  if (perio) return savePerio(bag, perio[1], data);
  if (pathname === '/workspace/plans/from-chart') return fromChart(bag, data.patientId);
  const save = pathname.match(/^\/workspace\/plans\/([^/]+)\/save$/);
  if (save) return savePlan(bag, save[1], data);
  const disclosure = pathname.match(/^\/workspace\/plans\/([^/]+)\/disclosure$/);
  if (disclosure && method === 'POST') return setDisclosure(bag, disclosure[1], data.showBreakdown !== false);
  const addItem = pathname.match(/^\/workspace\/plans\/([^/]+)\/items$/);
  if (addItem && method === 'POST') return addPlanItem(bag, addItem[1], data);
  const bookPhase = pathname.match(/^\/workspace\/plans\/([^/]+)\/phases\/([^/]+)\/book$/);
  if (bookPhase) return bookPhaseVisit(bag, bookPhase[1], bookPhase[2]);
  const accept = pathname.match(/^\/workspace\/plans\/([^/]+)\/(accept|accept-partial|abandon)$/);
  if (accept) return acceptPlan(bag, accept[1], accept[2], data);
  const restore = pathname.match(/^\/workspace\/plans\/([^/]+)\/versions\/([^/]+)\/restore$/);
  if (restore) return restorePlan(bag, restore[1], restore[2]);

  if (pathname === '/lab/orders' && method === 'POST') return addLab(bag, data);
  const labEdit = pathname.match(/^\/lab\/orders\/([^/]+)$/);
  if (labEdit && method === 'PATCH') return editLab(bag, labEdit[1], data);
  const labStatus = pathname.match(/^\/lab\/orders\/([^/]+)\/(status|scan)$/);
  if (labStatus) return patchLab(bag, labStatus[1], labStatus[2] === 'scan' ? { stlFileUrl: data.fileUrl } : { status: data.status });

  if (pathname === '/showcase/onboarding' && method === 'POST') {
    const current = bag.gets['/showcase/onboarding'] as AnyRec;
    Object.assign(current, data);
    return current;
  }
  if (pathname === '/showcase/import' || pathname === '/workspace/import') return importMigration(bag, data);
  if (pathname === '/config/ai' && method === 'POST') {
    seedTemplates(bag);
    config(bag).aiPlans = data.enabled !== false;
    return { enabled: config(bag).aiPlans !== false };
  }
  if (pathname === '/workspace/plans/compose' && method === 'POST') return saveComposed(bag, data);
  const applyTemplatePath = pathname.match(/^\/workspace\/plans\/([^/]+)\/apply-template$/);
  if (applyTemplatePath && method === 'POST') return applyPlanTemplate(bag, applyTemplatePath[1], data);
  const templateSave = pathname.match(/^\/workspace\/plans\/([^/]+)\/template$/);
  if (templateSave && method === 'POST') return savePlanTemplate(bag, templateSave[1], String(data.name ?? '').trim());
  const installment = pathname.match(/^\/workspace\/plans\/([^/]+)\/installment$/);
  if (installment && method === 'POST') return setInstallment(bag, installment[1], Number(data.months) || 0);
  const itemPatch = pathname.match(/^\/workspace\/plans\/([^/]+)\/items\/([^/]+)$/);
  if (itemPatch && method === 'POST') return patchPlanItem(bag, itemPatch[1], itemPatch[2], data);
  if (pathname === '/showcase/check-in') return checkIn(bag, data.code);
  if (pathname === '/showcase/retention/send') return sendRetention(bag, data.ids ?? []);
  if (pathname === '/market/copilot/apply') return applyCopilot(bag, data.patientId);
  if (pathname === '/showcase/xray/apply') return applyXray(bag, data);
  const portalBook = pathname.match(/^\/showcase\/portal\/([^/]+)\/(book|chat)$/);
  if (portalBook) return portalWrite(bag, portalBook[1], portalBook[2], data);

  if (pathname === '/finance/invoices' && method === 'POST') return pushList(bag, '/finance/invoices', invoiceRow(bag, data));
  const discount = pathname.match(/^\/finance\/invoices\/([^/]+)\/discount$/);
  if (discount) return discountInvoice(bag, discount[1], Number(data.discountAmount) || 0);
  if (pathname === '/finance/payments' && method === 'POST') return addPayment(bag, data);
  const refund = pathname.match(/^\/finance\/payments\/([^/]+)\/refund$/);
  if (refund) return refundPayment(bag, refund[1], Number(data.amount) || 0);
  if (pathname === '/finance/payroll/accrue') return { count: 1 };
  if (pathname === '/warehouse/items' && method === 'POST') return addStock(bag, data);
  const stockPatch = pathname.match(/^\/warehouse\/items\/([^/]+)$/);
  if (stockPatch && method === 'PATCH') return updateStock(bag, stockPatch[1], data);
  if (pathname === '/warehouse/inventory/start') return startInventory(bag);
  const stockLine = pathname.match(/^\/warehouse\/inventory\/lines\/([^/]+)$/);
  if (stockLine && method === 'PATCH') return patchInventoryLine(bag, stockLine[1], Number(data.actualQty));
  const stockDone = pathname.match(/^\/warehouse\/inventory\/([^/]+)\/complete$/);
  if (stockDone) return finishInventory(bag);
  const closeShift = pathname.match(/^\/finance\/cash-shift\/([^/]+)\/close$/);
  if (closeShift) {
    for (const key of Object.keys(bag.gets)) {
      if (!key.startsWith('/finance/cash-shift/current')) continue;
      const shift = bag.gets[key] as AnyRec | null;
      if (shift?.id === closeShift[1]) bag.gets[key] = { ...shift, status: 'CLOSED', closingCash: String(data.closingCash ?? 0) };
    }
    return { ok: true };
  }
  if (pathname === '/finance/cash-shift/open') {
    const opened = { id: uid(), status: 'OPEN', openingCash: String(data.openingCash ?? data.amount ?? 0), openedAt: anchorNow() };
    const key = Object.keys(bag.gets).find((item) => item.startsWith('/finance/cash-shift/current')) ?? '/finance/cash-shift/current';
    bag.gets[key] = opened;
    return opened;
  }

  return remember(bag, pathname, method, data, token);
}

function login(data: AnyRec) {
  const row = (snapshot.users as AnyRec)[String(data.email ?? '').toLowerCase()];
  if (!row || data.password !== 'demo12345') throw new Error('Неверный email или пароль');
  return row;
}

function addPatient(bag: Bag, data: AnyRec) {
  assertUniquePhone(bag, data.phone);
  if (data.consentPd === false) throw new Error('Нужно согласие на обработку персональных данных (152-ФЗ)');
  const row = patientRecord(data, uid());
  patients(bag).unshift(row);
  publishPatient(bag, row, true);
  if (data.dmsInsurer && data.dmsNumber) attachPolicy(bag, row, data.dmsInsurer, data.dmsNumber);
  return row;
}

function patchPatient(bag: Bag, id: string, data: AnyRec) {
  const row = findPatient(bag, id);
  if (!row) throw new Error('Пациент не найден');
  if (data.phone) assertUniquePhone(bag, data.phone, id);
  const next = patientRecord({ ...row, ...data, allergies: data.allergies ?? row.allergies }, id);
  if (data.isActive === false) next.isActive = false;
  Object.assign(row, next);
  publishPatient(bag, row, false);
  if (data.dmsInsurer && data.dmsNumber) attachPolicy(bag, row, data.dmsInsurer, data.dmsNumber);
  return row;
}

function patientRecord(data: AnyRec, id: string) {
  return {
    id,
    firstName: data.firstName ?? '',
    lastName: data.lastName ?? '',
    middleName: data.middleName ?? null,
    phone: data.phone ?? null,
    email: data.email ?? null,
    birthDate: data.birthDate ?? null,
    gender: data.gender ?? null,
    tags: data.tags ?? [],
    allergies: Array.isArray(data.allergies) ? data.allergies : [],
    chronicConditions: data.chronicConditions ?? null,
    medications: data.medications ?? null,
    contraindications: data.contraindications ?? null,
    anamnesis: data.anamnesis ?? null,
    notes: data.notes ?? null,
    anxiety: data.anxiety ?? 'NONE',
    pregnant: !!data.pregnant,
    anticoagulant: !!data.anticoagulant,
    isActive: data.isActive !== false,
    source: data.source ?? 'WALK_IN',
    dmsInsurer: data.dmsInsurer ?? null,
    dmsNumber: data.dmsNumber ?? null,
    createdAt: data.createdAt ?? anchorNow(),
    consentPd: data.consentPd !== false,
  };
}

function assertUniquePhone(bag: Bag, phone: string | undefined, exceptId?: string) {
  const digits = phoneDigits(phone);
  if (digits.length < 10) return;
  const hit = patients(bag).find((row) => row.isActive !== false && row.id !== exceptId && phoneDigits(row.phone).slice(-10) === digits.slice(-10));
  if (hit) throw new Error(`Пациент с таким телефоном уже есть: ${hit.lastName} ${hit.firstName}`);
}

function publishPatient(bag: Bag, row: AnyRec, created: boolean) {
  const alerts = alertsOf(row);
  const card = (bag.gets[`/workspace/patients/${row.id}/card`] as AnyRec | undefined) ?? {
    debt: 0,
    timeline: [],
    chart: { surfaces: [], events: [] },
    perio: null,
    families: [],
  };
  card.patient = row;
  card.alerts = alerts;
  if (created && row.consentPd !== false) {
    card.timeline = [{ id: uid(), at: anchorNow(), kind: 'consent', title: 'Согласие 152-ФЗ', detail: 'Подписано при создании карты' }, ...(card.timeline ?? [])];
  }
  bag.gets[`/workspace/patients/${row.id}/card`] = card;
  bag.gets[`/workspace/patients/${row.id}/brief`] = {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    middleName: row.middleName,
    phone: row.phone,
    birthDate: row.birthDate,
    allergies: row.allergies,
    anxiety: row.anxiety,
    pregnant: row.pregnant,
    anticoagulant: row.anticoagulant,
    contraindications: row.contraindications,
    debt: card.debt ?? 0,
    alerts,
    next: null,
  };
  bag.gets[`/patients/${row.id}`] = row;
  bag.gets[`/patients/${row.id}/full`] = row;
  bag.gets[`/flow/patients/${row.id}/imaging`] = bag.gets[`/flow/patients/${row.id}/imaging`] ?? { compare: { before: null, after: null }, protocols: [], studies: [] };
  const sample = bag.gets['/market/patients/seed-patient-anna'] as AnyRec | undefined;
  bag.gets[`/market/patients/${row.id}`] = bag.gets[`/market/patients/${row.id}`] ?? {
    curator: null,
    source: row.source,
    ortho: null,
    calls: [],
    allocations: [],
    threads: [],
    consents: row.consentPd === false ? [] : [{ id: uid(), status: 'SIGNED', documentUrl: null }],
    employees: sample?.employees ?? [],
    leads: [],
  };
}

function alertsOf(row: AnyRec) {
  const alerts: { tone: string; text: string }[] = [];
  for (const item of row.allergies ?? []) alerts.push({ tone: 'danger', text: `Аллергия: ${item}` });
  if (row.anticoagulant) alerts.push({ tone: 'danger', text: 'Антикоагулянты' });
  if (row.pregnant) alerts.push({ tone: 'warning', text: 'Беременность' });
  if (row.anxiety === 'HIGH') alerts.push({ tone: 'warning', text: 'Выраженный страх лечения' });
  return alerts;
}

function attachPolicy(bag: Bag, patient: AnyRec, insurerName: string, number: string) {
  patient.dmsInsurer = insurerName;
  patient.dmsNumber = number;
  const insurance = bag.gets['/market/insurance'] as AnyRec | undefined;
  const insurerId = uid();
  if (insurance) {
    const insurers = (insurance.insurers ?? []) as AnyRec[];
    let insurer = insurers.find((row) => row.name === insurerName);
    if (!insurer) {
      insurer = { id: insurerId, name: insurerName };
      insurers.unshift(insurer);
      insurance.insurers = insurers;
    }
    const policies = (insurance.policies ?? []) as AnyRec[];
    const existing = policies.find((row) => row.patientId === patient.id);
    const policy = { id: existing?.id ?? uid(), patientId: patient.id, number, insurer: { id: insurer.id, name: insurerName }, insurerId: insurer.id, limitAmount: '100000', patient: { firstName: patient.firstName, lastName: patient.lastName } };
    insurance.policies = [policy, ...policies.filter((row) => row.patientId !== patient.id)];
  }
  const finance = bag.gets['/finance/policies'];
  if (Array.isArray(finance)) {
    const policy = { id: uid(), patientId: patient.id, number, limitAmount: '100000', patient: { id: patient.id, firstName: patient.firstName, lastName: patient.lastName }, insurer: { name: insurerName } };
    const rest = (finance as AnyRec[]).filter((row) => row.patientId !== patient.id);
    finance.splice(0, finance.length, policy, ...rest);
  }
  bag.gets[`/patients/${patient.id}`] = { ...patient, insurancePolicies: [{ number, insurer: { name: insurerName } }] };
}

function addLead(bag: Bag, data: AnyRec) {
  const leads = bag.gets['/market/leads'] as AnyRec;
  const row = {
    id: uid(),
    name: data.name || 'Неизвестный номер',
    phone: data.phone,
    source: data.source || 'Звонок',
    status: 'CALLBACK',
    refusalReason: null,
    callbackAt: anchorNow(),
    createdAt: anchorNow(),
    calls: [{ id: uid(), missed: true }],
  };
  leads.items.unshift(row);
  refreshLeads(leads);
  return row;
}

function patchLead(bag: Bag, id: string, data: AnyRec) {
  const leads = bag.gets['/market/leads'] as AnyRec;
  const row = (leads.items as AnyRec[]).find((item) => item.id === id);
  if (!row) throw new Error('Лид не найден');
  if (data.status === 'REFUSED' && !data.refusalReason && !row.refusalReason) throw new Error('Укажите причину отказа');
  Object.assign(row, data);
  refreshLeads(leads);
  return row;
}

function refreshLeads(leads: AnyRec) {
  const items = leads.items as AnyRec[];
  const visited = items.filter((row) => row.status === 'VISITED').length;
  leads.conversion = items.length ? Math.round((visited / items.length) * 100) : 0;
}

function warrantyRow(bag: Bag, data: AnyRec) {
  const patient = findPatient(bag, data.patientId);
  return { id: uid(), title: data.title, status: 'OPEN', reason: data.reason, patient: { firstName: patient?.firstName ?? '', lastName: patient?.lastName ?? '' } };
}

function policyRow(bag: Bag, data: AnyRec) {
  const patient = findPatient(bag, data.patientId);
  const insurance = bag.gets['/market/insurance'] as AnyRec;
  const insurer = (insurance.insurers as AnyRec[]).find((row) => row.id === data.insurerId);
  return {
    id: uid(),
    number: data.number,
    letterNumber: data.letterNumber ?? null,
    limitAmount: data.limitAmount ?? 50000,
    patient: { firstName: patient?.firstName ?? '', lastName: patient?.lastName ?? '' },
    insurer: insurer?.name ?? '',
  };
}

function pushNamed(bag: Bag, key: string, field: string, row: AnyRec) {
  const host = bag.gets[key] as AnyRec;
  host[field] = [row, ...(host[field] ?? [])];
  return row;
}

function pushConfig(bag: Bag, field: string, row: AnyRec) {
  const host = config(bag);
  host[field] = [row, ...(host[field] ?? [])];
  return row;
}

function pushList(bag: Bag, key: string, row: AnyRec) {
  const list = bag.gets[key];
  if (Array.isArray(list)) list.unshift(row);
  return row;
}

function patchIn(host: AnyRec, field: string, id: string, data: AnyRec) {
  const row = (host[field] as AnyRec[]).find((item) => item.id === id);
  if (row) Object.assign(row, data);
  return row ?? data;
}

function saveService(bag: Bag, data: AnyRec) {
  const services = config(bag).services as AnyRec[];
  const stock = config(bag).stock as AnyRec[];
  const norms = (data.norms ?? []).map((norm: AnyRec) => ({
    itemId: norm.itemId,
    quantity: norm.quantity,
    name: stock.find((item) => item.id === norm.itemId)?.name,
  }));
  if (data.id) {
    const row = services.find((item) => item.id === data.id);
    if (row) Object.assign(row, { name: data.name, code: data.code || row.code, price: data.price, durationMin: data.durationMin, parentId: data.parentId || null, norms });
    return row;
  }
  const category = !data.code && !data.price;
  const row = {
    id: uid(),
    name: data.name,
    code: data.code || null,
    price: Number(data.price) || 0,
    durationMin: Number(data.durationMin) || 0,
    parentId: data.parentId || null,
    isCategory: category,
    isActive: true,
    norms,
    doctorPercent: 0,
  };
  services.push(row);
  return row;
}

function saveTemplate(bag: Bag, data: AnyRec) {
  const row = { id: data.id || uid(), name: data.name, complaints: data.complaints ?? '', diagnosis: data.diagnosis ?? '', treatment: data.treatment ?? '', recommendations: data.recommendations ?? '', anamnesis: data.anamnesis ?? '', objective: data.objective ?? '', isArchived: !!data.isArchived };
  const lists = [config(bag).visitTemplates, bag.gets['/config/visit-templates']].filter(Array.isArray) as AnyRec[][];
  for (const list of lists) {
    const index = list.findIndex((item) => item.id === row.id || item.name === data.name);
    if (index >= 0) list[index] = { ...list[index], ...row };
    else list.unshift(row);
  }
  return row;
}

function saveEmployee(bag: Bag, data: AnyRec) {
  const list = (config(bag).employees ?? []) as AnyRec[];
  let row = data.id ? list.find((item) => item.id === data.id) : undefined;
  if (!row) {
    row = {
      id: data.id || uid(),
      status: 'ACTIVE',
      commission: Number(data.commission ?? 30),
      schedule: (data.days ?? [1, 2, 3, 4, 5]).map((day: number) => ({ dayOfWeek: day, startsAt: data.startsAt ?? '09:00', endsAt: data.endsAt ?? '18:00' })),
    };
    list.unshift(row);
    config(bag).employees = list;
  }
  Object.assign(row, {
    firstName: data.firstName ?? row.firstName,
    lastName: data.lastName ?? row.lastName,
    email: data.email ?? row.email ?? '',
    phone: data.phone ?? row.phone ?? null,
    specialization: data.specialization ?? row.specialization ?? '',
    commission: data.commission ?? row.commission ?? 0,
    status: data.status ?? row.status ?? 'ACTIVE',
  });
  if (!Array.isArray(row.schedule)) row.schedule = [];
  syncStaff(bag, row);
  return row;
}

function syncStaff(bag: Bag, row: AnyRec) {
  const employees = bag.gets['/employees'] as AnyRec[];
  const shaped = {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone ?? null,
    specialization: row.specialization,
    status: row.status ?? 'ACTIVE',
    user: { email: row.email ?? '', isActive: row.status !== 'INACTIVE' },
    branches: [{ branch: { id: 'seed-branch-main', name: 'Главный филиал' }, isPrimary: true }],
  };
  const index = employees.findIndex((item) => item.id === row.id);
  if (index >= 0) employees[index] = { ...employees[index], ...shaped };
  else employees.unshift(shaped);
  const schedule = bag.gets[`/workspace/schedule?date=${ANCHOR}`] as AnyRec;
  const doctors = (schedule.doctors ?? []) as AnyRec[];
  const name = personName(row);
  const existing = doctors.find((item) => item.id === row.id);
  if (row.status === 'INACTIVE') schedule.doctors = doctors.filter((item) => item.id !== row.id);
  else if (existing) existing.name = name;
  else doctors.push({ id: row.id, name });
}

function addShift(bag: Bag, data: AnyRec) {
  const list = bag.gets['/employees/schedules'];
  const person = (bag.gets['/employees'] as AnyRec[]).find((item) => item.id === data.employeeId);
  const row = { id: uid(), dayOfWeek: data.dayOfWeek, startsAt: data.startsAt, endsAt: data.endsAt, employee: { firstName: person?.firstName ?? '', lastName: person?.lastName ?? '' } };
  if (Array.isArray(list)) list.unshift(row);
  return row;
}

function addStock(bag: Bag, data: AnyRec) {
  const id = uid();
  const quantity = Number(data.quantity ?? 10);
  const row = { id, name: data.name, sku: data.sku ?? null, unit: data.unit ?? 'шт', minStock: Number(data.minStock ?? 5), isActive: true, quantity, cost: Number(data.cost ?? 100) };
  (config(bag).stock as AnyRec[]).unshift(row);
  const item = { id, name: row.name, sku: row.sku, unit: row.unit, category: 'MATERIAL', minStock: String(row.minStock), isActive: true, batches: [{ id: uid(), quantity: String(quantity), costPrice: String(row.cost), expiresAt: null }] };
  const items = bag.gets['/warehouse/items'];
  if (Array.isArray(items)) items.unshift(item);
  return item;
}

function updateStock(bag: Bag, id: string, data: AnyRec) {
  const stock = (config(bag).stock as AnyRec[]).find((item) => item.id === id);
  const items = bag.gets['/warehouse/items'] as AnyRec[];
  const item = items.find((row) => row.id === id);
  if (stock) {
    if (data.name) stock.name = data.name;
    if (data.quantity != null) stock.quantity = Number(data.quantity);
    if (data.cost != null) stock.cost = Number(data.cost);
    if (data.minStock != null) stock.minStock = Number(data.minStock);
    if (typeof data.isActive === 'boolean') stock.isActive = data.isActive;
  }
  if (item) {
    if (data.name) item.name = data.name;
    if (typeof data.isActive === 'boolean') item.isActive = data.isActive;
    if (data.quantity != null && item.batches?.[0]) item.batches[0].quantity = String(data.quantity);
  }
  return stock ?? item ?? { id, ...data };
}

function receiveStock(bag: Bag, id: string, quantity: number) {
  const row = (config(bag).stock as AnyRec[]).find((item) => item.id === id);
  if (row) row.quantity = Number(row.quantity ?? 0) + quantity;
  const item = (bag.gets['/warehouse/items'] as AnyRec[]).find((entry) => entry.id === id);
  if (item?.batches?.[0] && row) item.batches[0].quantity = String(row.quantity);
  return row ?? { ok: true };
}

function startInventory(bag: Bag) {
  const items = (bag.gets['/warehouse/items'] as AnyRec[]).filter((item) => item.isActive !== false);
  const session = {
    id: uid(),
    lines: items.map((item) => {
      const expected = item.batches?.reduce((sum: number, batch: AnyRec) => sum + Number(batch.quantity), 0) ?? 0;
      return { id: uid(), expectedQty: String(expected), actualQty: String(expected), diffQty: '0', item: { name: item.name } };
    }),
  };
  for (const key of Object.keys(bag.gets)) {
    if (key.startsWith('/warehouse/inventory/active')) bag.gets[key] = session;
  }
  return session;
}

function patchInventoryLine(bag: Bag, id: string, actualQty: number) {
  for (const key of Object.keys(bag.gets)) {
    if (!key.startsWith('/warehouse/inventory/active')) continue;
    const session = bag.gets[key] as AnyRec | null;
    const line = session?.lines?.find((item: AnyRec) => item.id === id);
    if (!line) continue;
    line.actualQty = String(actualQty);
    line.diffQty = String(actualQty - Number(line.expectedQty));
    return line;
  }
  return { id, actualQty };
}

function finishInventory(bag: Bag) {
  for (const key of Object.keys(bag.gets)) {
    if (key.startsWith('/warehouse/inventory/active')) bag.gets[key] = null;
  }
  return { ok: true };
}

function saveRole(bag: Bag, data: AnyRec) {
  const list = (config(bag).roles ?? []) as AnyRec[];
  const row = list.find((item) => item.id === data.id);
  if (row) Object.assign(row, data);
  return row ?? data;
}

function book(bag: Bag, data: AnyRec) {
  const patient = findPatient(bag, data.patientId);
  const service = serviceById(bag, data.serviceId);
  const schedule = bag.gets[`/workspace/schedule?date=${ANCHOR}`] as AnyRec;
  const doctor = (schedule.doctors as AnyRec[]).find((row) => row.id === data.doctorId);
  const cabinet = (schedule.branches as AnyRec[]).flatMap((branch) => branch.cabinets).find((row: AnyRec) => row.id === data.cabinetId);
  const starts = new Date(data.startsAt);
  const ends = new Date(starts.getTime() + (Number(data.durationMin) || 30) * 60000);
  const row: Appointment = {
    id: uid(),
    startsAt: starts.toISOString(),
    endsAt: ends.toISOString(),
    status: 'CONFIRMED',
    cabinetId: data.cabinetId ?? null,
    doctorId: data.doctorId ?? null,
    patientId: data.patientId,
    patient: personName(patient),
    doctor: doctor?.name ?? 'Врач',
    cabinet: cabinet?.name ?? 'Кресло',
    service: service?.name ?? 'Приём',
    serviceId: data.serviceId ?? null,
    allergies: patient?.allergies ?? [],
  };
  bag.appointments.push(row);
  const visit = visitFrom(row, patient);
  bag.gets[`/flow/visits/${row.id}`] = visit;
  return row;
}

/** The API's rules, in the browser: allowed status moves only. */
function setVisitStatus(bag: Bag, id: string, status: string) {
  const row = bag.appointments.find((item) => item.id === id);
  if (!row) throw new Error('Запись не найдена');
  const from = (row.status === 'ARRIVED' ? 'WAITING' : row.status) as VisitStatus;
  if (!isVisitStatus(status)) throw new Error('Неизвестный статус визита');
  if (!canMoveVisit(from, status)) throw new Error(visitMoveError(from, status));
  row.status = status;
  const visit = bag.gets[`/flow/visits/${id}`] as AnyRec | undefined;
  if (visit) visit.status = status;
  return row;
}

/** Mirrors the database's no-overlap constraints for one chair and one doctor. */
function assertFree(bag: Bag, row: Appointment, startsAt: string, endsAt: string, cabinetId: string | null, doctorId: string | null) {
  const live = (item: Appointment) => item.id !== row.id && item.status !== 'CANCELLED' && item.status !== 'NO_SHOW';
  const overlaps = (item: Appointment) => item.startsAt < endsAt && startsAt < item.endsAt;
  if (cabinetId && bag.appointments.some((item) => live(item) && item.cabinetId === cabinetId && overlaps(item))) {
    throw new Error('Кресло на это время уже занято. Выберите другое время или кресло');
  }
  if (doctorId && bag.appointments.some((item) => live(item) && item.doctorId === doctorId && overlaps(item))) {
    throw new Error('У врача на это время уже есть приём. Выберите другое время');
  }
}

function moveAppointment(bag: Bag, id: string, data: AnyRec) {
  const row = bag.appointments.find((item) => item.id === id);
  if (!row) throw new Error('Запись не найдена');
  if (isVisitClosed((row.status === 'ARRIVED' ? 'WAITING' : row.status) as VisitStatus) && (data.startsAt || data.cabinetId || data.doctorId)) {
    throw new Error('Закрытый визит не переносят. Создайте новую запись');
  }
  if (data.startsAt || data.endsAt || data.cabinetId || data.doctorId) {
    const startsAt = data.startsAt ?? row.startsAt;
    const endsAt = data.endsAt ?? (data.startsAt && data.durationMin ? new Date(Date.parse(data.startsAt) + Number(data.durationMin) * 60000).toISOString() : row.endsAt);
    if (!(endsAt > startsAt)) throw new Error('Конец приёма должен быть позже начала');
    assertFree(bag, row, startsAt, endsAt, data.cabinetId ?? row.cabinetId, data.doctorId ?? row.doctorId);
  }
  if (data.patientId) {
    const patient = findPatient(bag, data.patientId);
    row.patientId = data.patientId;
    row.patient = personName(patient);
    row.allergies = patient?.allergies ?? [];
  }
  if (data.serviceId) {
    const service = serviceById(bag, data.serviceId);
    if (service) row.service = service.name;
    row.serviceId = data.serviceId;
  }
  if (data.startsAt) row.startsAt = data.startsAt;
  if (data.endsAt) row.endsAt = data.endsAt;
  else if (data.startsAt && data.durationMin) row.endsAt = new Date(Date.parse(data.startsAt) + Number(data.durationMin) * 60000).toISOString();
  if (data.cabinetId) row.cabinetId = data.cabinetId;
  if (data.doctorId) row.doctorId = data.doctorId;
  if (data.status) row.status = data.status;
  const schedule = bag.gets[`/workspace/schedule?date=${ANCHOR}`] as AnyRec;
  const doctor = (schedule.doctors as AnyRec[]).find((item) => item.id === row.doctorId);
  const cabinet = (schedule.branches as AnyRec[]).flatMap((branch) => branch.cabinets).find((item: AnyRec) => item.id === row.cabinetId);
  if (doctor) row.doctor = doctor.name;
  if (cabinet) row.cabinet = cabinet.name;
  const visit = bag.gets[`/flow/visits/${id}`] as AnyRec | undefined;
  if (visit) Object.assign(visit, { startsAt: row.startsAt, endsAt: row.endsAt, status: row.status, service: row.service });
  return row;
}

function visitFrom(row: Appointment, patient: AnyRec | undefined) {
  return {
    id: row.id,
    status: 'CONFIRMED',
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    actions: ['check-in'],
    service: row.service,
    servicePrice: 0,
    doctor: row.doctor,
    cabinet: row.cabinet,
    debt: 0,
    patient: patient ?? { id: row.patientId, firstName: row.patient, lastName: '', phone: null, allergies: [], anxiety: 'NONE', pregnant: false, anticoagulant: false, contraindications: null },
    note: null,
    reminders: [],
    prescriptions: [],
    followUps: [],
    invoices: [],
    imaging: [],
  };
}

function visitAction(bag: Bag, id: string, action: string, data: AnyRec) {
  const visit = (bag.gets[`/flow/visits/${id}`] ?? {}) as AnyRec;
  bag.gets[`/flow/visits/${id}`] = visit;
  if (action === 'note') visit.note = { ...(visit.note ?? {}), ...data };
  if (action === 'check-in') {
    visit.status = 'ARRIVED';
    visit.actions = ['start'];
  }
  if (action === 'start') {
    visit.status = 'IN_PROGRESS';
    visit.actions = ['complete'];
  }
  if (action === 'complete') {
    visit.status = 'COMPLETED';
    visit.actions = [];
    consumeDemoVisit(bag, id);
  }
  if (action === 'no-show') {
    visit.status = 'NO_SHOW';
    visit.actions = [];
  }
  const appt = bag.appointments.find((item) => item.id === id);
  if (appt) appt.status = visit.status;
  return visit;
}

function paint(bag: Bag, patientId: string, data: AnyRec) {
  const card = bag.gets[`/workspace/patients/${patientId}/card`] as AnyRec;
  const whole = new Set(['CROWN', 'IMPLANT', 'MISSING', 'TO_EXTRACT', 'ROOT_CANAL']);
  card.chart.surfaces = (card.chart.surfaces as AnyRec[]).filter((row) => {
    if (row.toothNum !== data.toothNum) return true;
    if (row.surface === data.surface) return false;
    if (data.condition === 'MISSING') return false;
    if (whole.has(String(data.condition)) && whole.has(String(row.condition))) return false;
    return true;
  });
  card.chart.surfaces.push({ toothNum: data.toothNum, formula: 'ADULT', surface: data.surface, condition: data.condition, layer: 'CURRENT' });
  card.chart.events.unshift({ id: uid(), toothNum: data.toothNum, note: data.diagnosis ?? null, condition: data.condition, at: anchorNow() });
  return { ok: true };
}

function savePerio(bag: Bag, patientId: string, data: AnyRec) {
  const card = bag.gets[`/workspace/patients/${patientId}/card`] as AnyRec;
  card.perio = { notes: data.notes ?? '', teeth: data.teeth ?? [] };
  return card.perio;
}

function fromChart(bag: Bag, patientId: string) {
  const card = bag.gets[`/workspace/patients/${patientId}/card`] as AnyRec;
  if (!card) throw new Error('Пациент не найден');
  if ((card.families ?? []).some((family: AnyRec) => family.plans?.length)) return card;
  const family = makeFamily('Санация');
  card.families = [family];
  publishFamily(bag, patientId, family);
  return family;
}

function makeFamily(title: string) {
  const tier = (code: string, label: string, price: number, months: number) => ({
    id: uid(),
    tier: code,
    tierLabel: label,
    title,
    status: 'PROPOSED',
    total: price,
    discountPercent: 0,
    guaranteeMonths: code === 'PREMIUM' ? 24 : 12,
    durationWeeks: 4,
    installmentMonths: months,
    signedAt: null,
    signedName: null,
    abandonedAt: null,
    looseItems: [],
    explanation: '',
    phases: [{
      id: uid(),
      title: 'Санация',
      specialty: 'Терапия',
      healingDays: 0,
      dependsOnTitle: null,
      waitDays: 0,
      items: [{ id: uid(), title: 'Лечение кариеса', toothNum: 16, surfaces: ['O'], price, status: 'PROPOSED' }],
    }],
  });
  return {
    key: uid(),
    title,
    plans: [tier('ECONOM', 'Эконом', 11000, 0), tier('OPTIMUM', 'Оптимум', 18000, 3), tier('PREMIUM', 'Премиум', 32000, 6)],
  };
}

function publishFamily(bag: Bag, patientId: string, family: AnyRec) {
  const patient = findPatient(bag, patientId);
  const card = bag.gets[`/workspace/patients/${patientId}/card`] as AnyRec;
  bag.gets[`/workspace/families/${family.key}`] = {
    familyKey: family.key,
    patient: { id: patientId, firstName: patient?.firstName ?? '', lastName: patient?.lastName ?? '' },
    alerts: card?.alerts ?? [],
    debt: card?.debt ?? 0,
    plans: family.plans,
  };
}

function addPlanItem(bag: Bag, planId: string, data: AnyRec) {
  const service = serviceById(bag, String(data.serviceId ?? ''));
  if (!service || service.isCategory || !service.code) throw new Error('Услуги нет в прайсе');
  const name = String(service.name ?? 'Услуга');
  const item = {
    id: uid(),
    title: name,
    toothNum: data.toothNum == null || data.toothNum === '' ? null : Number(data.toothNum),
    surfaces: surfacesFor(name, service.code),
    price: Number(service.price) || 0,
    listPrice: Number(service.price) || 0,
    discountPercent: 0,
    status: 'PROPOSED',
    durationMin: Number(service.durationMin) || 30,
    result: resultFor(name, service.code),
    kit: serviceKit(name, service.norms),
  };
  const seen = new Set<AnyRec>();
  let added = false;
  eachPlan(bag, (plan) => {
    if (plan.id !== planId || seen.has(plan)) return;
    seen.add(plan);
    const phaseId = data.phaseId ? String(data.phaseId) : '';
    const phases = (plan.phases ?? []) as AnyRec[];
    let phase = phaseId && phaseId !== 'loose' ? phases.find((row) => row.id === phaseId) : null;
    if (!phase && phaseId !== 'loose' && phases.length) {
      phase = phases.find((row) => (row.items ?? []).some((line: AnyRec) => line.status !== 'DONE' && line.status !== 'ACCEPTED')) ?? phases[0];
    }
    const copy = { ...item, surfaces: [...item.surfaces] };
    if (phase) phase.items = [...(phase.items ?? []), copy];
    else plan.looseItems = [...(plan.looseItems ?? []), copy];
    plan.total = planItems(plan).reduce((sum, line) => sum + (Number(line.price) || 0), 0);
    added = true;
  });
  if (!added) throw new Error('План не найден');
  return item;
}

function buildSheet(bag: Bag, planId: string) {
  const found: AnyRec[] = [];
  eachPlan(bag, (row) => {
    if (row.id === planId && found.length === 0) found.push(row);
  });
  const plan = found[0];
  const stored = bag.gets[`/workspace/plans/${planId}/sheet`] as AnyRec | undefined;
  if (!plan) {
    if (stored) return stored;
    throw new Error('План не найден');
  }
  const months = Number(plan.installmentMonths) >= 2 ? Number(plan.installmentMonths) : 0;
  const total = Number(plan.total) || 0;
  const parts = stored && Number(stored.plan?.total) === total ? stored.parts : (months ? installments(total, months) : []);
  return {
    clinic: stored?.clinic ?? 'Седракович Дент',
    city: stored?.city ?? 'Москва',
    patient: stored?.patient ?? { firstName: '', lastName: '' },
    doctor: stored?.doctor ?? 'Козлова Елена',
    plan: { ...plan, showBreakdown: plan.showBreakdown !== false },
    parts,
    share: stored?.share ?? '',
  };
}

function installments(total: number, months: number) {
  const each = Math.floor(total / months);
  return Array.from({ length: months }, (_, index) => ({
    dueDate: new Date(Date.parse(`${ANCHOR}T00:00:00.000Z`) + (index + 1) * 30 * 86400000).toISOString(),
    amount: index === months - 1 ? total - each * (months - 1) : each,
  }));
}

function setDisclosure(bag: Bag, planId: string, show: boolean) {
  const seen = new Set<AnyRec>();
  let found = false;
  eachPlan(bag, (plan) => {
    if (plan.id !== planId || seen.has(plan)) return;
    seen.add(plan);
    plan.showBreakdown = show;
    found = true;
  });
  if (!found) throw new Error('План не найден');
  return { showBreakdown: show };
}

function savePlan(bag: Bag, planId: string, data: AnyRec) {
  const discount = Number(data.discountPercent) || 0;
  eachPlan(bag, (plan) => {
    if (plan.id === planId) plan.discountPercent = discount;
  });
  const version = { id: uid(), note: `Скидка ${discount}%`, createdAt: anchorNow() };
  bag.versions[planId] = [version, ...(bag.versions[planId] ?? (bag.gets[`/workspace/plans/${planId}/versions`] as Version[] | undefined) ?? [])];
  return { savedAt: anchorNow() };
}

function bookPhaseVisit(bag: Bag, planId: string, phaseId: string) {
  let title = 'Этап';
  let patientId = patients(bag)[0]?.id;
  eachPlan(bag, (plan, family, card) => {
    if (plan.id !== planId) return;
    const phase = (plan.phases as AnyRec[]).find((item) => item.id === phaseId);
    if (phase) title = phase.title;
    patientId = card?.patient?.id ?? family.patient?.id ?? patientId;
  });
  const starts = new Date(Date.parse(`${ANCHOR}T10:00:00.000Z`) + 86400000);
  const row = book(bag, { patientId, startsAt: starts.toISOString(), durationMin: 60 });
  row.service = title;
  return { startsAt: row.startsAt };
}

function acceptPlan(bag: Bag, planId: string, action: string, data: AnyRec) {
  const appointments: { startsAt: string; title: string }[] = [];
  // The same plan lives in the patient card and in its plan family: decide each stage once, then copy it to every copy.
  const placed = new Map<string, { appointmentId: string; reservations: Map<string, DemoReservation[]> }>();
  eachPlan(bag, (plan, family, card) => {
    if (plan.id !== planId) return;
    if (action === 'abandon') {
      plan.status = 'ABANDONED';
      plan.abandonedAt = anchorNow();
      return;
    }
    plan.status = 'ACCEPTED';
    plan.signedAt = anchorNow();
    plan.signedName = data.signedName ?? null;
    const chosen = new Set<string>(data.phaseIds ?? (plan.phases as AnyRec[]).map((phase) => phase.id));
    (plan.phases as AnyRec[]).forEach((phase, index) => {
      if (!chosen.has(phase.id)) return;
      const items = (phase.items ?? []) as AnyRec[];
      let stage = placed.get(phase.id);
      if (!stage && phase.appointmentId) stage = { appointmentId: phase.appointmentId, reservations: new Map() };
      if (!stage) {
        const patientId = card?.patient?.id ?? family.patient?.id;
        if (!patientId) return;
        const starts = new Date(Date.parse(`${ANCHOR}T09:00:00.000Z`) + (index + 1) * 86400000);
        const row = book(bag, { patientId, startsAt: starts.toISOString(), durationMin: 60 });
        row.service = phase.title;
        appointments.push({ startsAt: row.startsAt, title: phase.title });
        const reservations = reserveDemoLines(items, config(bag).services as AnyRec[], bag.gets['/warehouse/items'] as AnyRec[], heldReservations(bag));
        const work = demoLabWork(phase);
        if (work) {
          const lab = addLab(bag, { patientId, title: work });
          Object.assign(lab, { status: 'WAITING_IMPRESSION', planPhaseId: phase.id, appointmentId: row.id, dueAt: labDueAt(starts).toISOString() });
        }
        stage = { appointmentId: row.id, reservations };
      }
      placed.set(phase.id, stage);
      phase.appointmentId = stage.appointmentId;
      for (const item of items) {
        item.status = 'ACCEPTED';
        item.appointmentId = stage.appointmentId;
        if (stage.reservations.has(item.id)) item.reservations = stage.reservations.get(item.id);
      }
    });
  });
  return { appointments };
}

/** Reservations already held by signed plans, so a second plan does not count the same shelf twice. */
function heldReservations(bag: Bag) {
  const seen = new Set<string>();
  const rows: DemoReservation[] = [];
  eachPlan(bag, (plan) => {
    if (seen.has(plan.id)) return;
    seen.add(plan.id);
    for (const item of planItems(plan)) rows.push(...((item.reservations ?? []) as DemoReservation[]));
  });
  return rows;
}

function acceptedPlanOf(bag: Bag, patientId: string) {
  let found: AnyRec | null = null;
  eachPlan(bag, (plan, family, card) => {
    const owner = card?.patient?.id ?? family.patient?.id;
    if (owner !== patientId || !['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'].includes(plan.status)) return;
    if (!found || String(plan.signedAt ?? '') > String(found.signedAt ?? '')) found = plan;
  });
  return found;
}

/** A closed visit marks the materials held for it as used, as the API does. */
function consumeDemoVisit(bag: Bag, appointmentId: string) {
  eachPlan(bag, (plan) => {
    for (const item of planItems(plan)) {
      if (item.appointmentId !== appointmentId) continue;
      for (const row of (item.reservations ?? []) as DemoReservation[]) {
        if (row.status === 'RESERVED' || row.status === 'SHORT') row.status = 'CONSUMED';
      }
    }
  });
}

function restorePlan(bag: Bag, planId: string, versionId: string) {
  const version = (bag.versions[planId] ?? []).find((item) => item.id === versionId);
  const match = version?.note?.match(/(\d+)/);
  if (match) {
    eachPlan(bag, (plan) => {
      if (plan.id === planId) plan.discountPercent = Number(match[1]);
    });
  }
  return { ok: true };
}

function addLab(bag: Bag, data: AnyRec) {
  const patient = findPatient(bag, data.patientId);
  const doctor = (bag.gets['/employees'] as AnyRec[]).find((row) => row.id === data.doctorId);
  const row = {
    id: uid(),
    title: data.title,
    status: 'RECEIVED',
    patient: patient ? { firstName: patient.firstName, lastName: patient.lastName } : null,
    doctor: doctor ? { firstName: doctor.firstName, lastName: doctor.lastName } : null,
    dueAt: data.dueAt ?? null,
    fittingAt: data.fittingAt ?? null,
    costAmount: data.costAmount ?? null,
    labName: data.labName ?? null,
    technician: data.technician ?? null,
    stlFileUrl: null,
  };
  return pushList(bag, '/lab/orders', row);
}

function patchLab(bag: Bag, id: string, data: AnyRec) {
  const list = bag.gets['/lab/orders'] as AnyRec[];
  const row = list.find((item) => item.id === id);
  if (row) Object.assign(row, data);
  return row ?? data;
}

function editLab(bag: Bag, id: string, data: AnyRec) {
  const patient = data.patientId ? findPatient(bag, data.patientId) : undefined;
  const doctor = data.doctorId ? (bag.gets['/employees'] as AnyRec[]).find((row) => row.id === data.doctorId) : undefined;
  return patchLab(bag, id, {
    ...data,
    ...(patient ? { patient: { firstName: patient.firstName, lastName: patient.lastName } } : {}),
    ...(doctor ? { doctor: { firstName: doctor.firstName, lastName: doctor.lastName } } : {}),
    costAmount: data.costAmount ?? undefined,
  });
}

function importRows(bag: Bag, rows: AnyRec[]) {
  return importMigration(bag, { patients: rows });
}

function seedTemplates(bag: Bag) {
  const host = config(bag);
  const list = (host.planTemplates ?? []) as AnyRec[];
  host.planTemplates = list;
  if (host.aiPlans == null) host.aiPlans = true;
  for (const template of PLAN_TEMPLATES) {
    if (list.some((row) => row.name === template.name)) continue;
    list.push({ id: `tpl-${template.name}`, name: template.name, note: template.note, isArchived: false, marks: template.marks });
  }
}

function materializePlan(plan: AnyRec) {
  const phases = ((plan.phases ?? []) as AnyRec[]).map((phase) => ({
    id: uid(),
    title: phase.title,
    specialty: phase.specialty ?? null,
    healingDays: Number(phase.healingDays) || 0,
    dependsOnTitle: phase.dependsOnTitle ?? null,
    waitDays: Number(phase.waitDays) || 0,
    items: ((phase.items ?? []) as AnyRec[]).map((item) => {
      const money = lineTotal(item.unitPrice ?? item.price, item.qty ?? 1, item.discountPercent ?? 0);
      const title = String(item.title || 'Услуга');
      return {
        id: uid(),
        title,
        toothNum: item.toothNum ?? null,
        surfaces: surfacesFor(title, item.code),
        ...money,
        listPrice: money.unitPrice,
        status: 'PROPOSED',
        durationMin: Number(item.durationMin) || 30,
        kit: item.kit || '',
        result: resultFor(title, item.code),
      };
    }),
  }));
  const total = phases.reduce((sum, phase) => sum + phase.items.reduce((inner, item) => inner + item.price, 0), 0);
  return {
    id: uid(),
    tier: plan.tier ?? null,
    tierLabel: plan.tierLabel ?? 'План',
    title: plan.tierLabel ?? plan.title ?? 'План',
    status: 'PROPOSED',
    total,
    discountPercent: 0,
    guaranteeMonths: Number(plan.guaranteeMonths) || 12,
    durationWeeks: Number(plan.durationWeeks) || 4,
    installmentMonths: Number(plan.installmentMonths) || 0,
    signedAt: null,
    signedName: null,
    abandonedAt: null,
    looseItems: [],
    explanation: '',
    showBreakdown: true,
    phases,
  };
}

function saveComposed(bag: Bag, data: AnyRec) {
  const patientId = String(data.patientId ?? '');
  const card = bag.gets[`/workspace/patients/${patientId}/card`] as AnyRec | undefined;
  if (!card) throw new Error('Пациент не найден');
  const plans = ((data.plans ?? []) as AnyRec[]).map(materializePlan);
  if (!plans.length) throw new Error('План пустой');
  const existing = ((card.families ?? []) as AnyRec[])[0];
  const family = existing ?? { key: uid(), title: 'План лечения', plans: [] };
  family.title = data.title || family.title || 'План лечения';
  family.plans = plans;
  const others = ((card.families ?? []) as AnyRec[]).filter((row) => row !== family && row.key !== family.key);
  card.families = [family, ...others];
  publishFamily(bag, patientId, family);
  const optimum = plans.find((plan) => plan.tier === 'OPTIMUM') ?? plans[0];
  return { familyKey: family.key, planId: optimum.id, plans };
}

function patchPlanItem(bag: Bag, planId: string, itemId: string, data: AnyRec) {
  const seen = new Set<AnyRec>();
  let updated: AnyRec | null = null;
  eachPlan(bag, (plan) => {
    if (plan.id !== planId || seen.has(plan)) return;
    seen.add(plan);
    for (const item of planItems(plan)) {
      if (item.id !== itemId) continue;
      const money = lineTotal(data.unitPrice ?? item.unitPrice ?? item.price, data.qty ?? item.qty ?? 1, data.discountPercent ?? item.discountPercent ?? 0);
      Object.assign(item, money, { kit: data.kit ?? item.kit ?? '', title: data.title ?? item.title });
      updated = item;
    }
    plan.total = planItems(plan).reduce((sum, line) => sum + (Number(line.price) || 0), 0);
  });
  if (!updated) throw new Error('Строка не найдена');
  return updated;
}

function setInstallment(bag: Bag, planId: string, months: number) {
  const count = months >= 2 ? Math.min(24, Math.round(months)) : 0;
  const seen = new Set<AnyRec>();
  let total = 0;
  let found = false;
  eachPlan(bag, (plan) => {
    if (plan.id !== planId || seen.has(plan)) return;
    seen.add(plan);
    plan.installmentMonths = count;
    total = Number(plan.total) || 0;
    found = true;
  });
  if (!found) throw new Error('План не найден');
  return { installmentMonths: count, parts: count ? installments(total, count) : [] };
}

function applyPlanTemplate(bag: Bag, planId: string, data: AnyRec) {
  seedTemplates(bag);
  const template = ((config(bag).planTemplates ?? []) as AnyRec[]).find((row) => row.id === data.templateId || row.name === data.name);
  if (!template) throw new Error('Шаблон не найден');
  const tooth = data.toothNum == null || data.toothNum === '' ? null : Number(data.toothNum);
  let phases = (template.phases ?? []) as AnyRec[];
  if (!phases.length && template.marks) {
    const marks = (template.marks as Mark[]).map((mark) => ({ ...mark, tooth: mark.tooth ?? tooth }));
    const draft = composeFamily(marks, (config(bag).services ?? []) as { name: string; code?: string | null; price?: number; durationMin?: number }[]);
    const picked = draft?.plans.find((plan) => plan.tier === (data.tier || 'OPTIMUM')) ?? draft?.plans[0];
    phases = (picked?.phases ?? []) as unknown as AnyRec[];
  }
  if (!phases.length) throw new Error('В шаблоне нет этапов');
  mergePhases(bag, planId, phases.map((phase) => ({
    ...phase,
    items: (phase.items ?? []).map((item: AnyRec) => ({ ...item, toothNum: item.toothNum ?? tooth })),
  })));
  return { ok: true };
}

function mergePhases(bag: Bag, planId: string, phases: AnyRec[]) {
  const seen = new Set<AnyRec>();
  let found = false;
  eachPlan(bag, (plan) => {
    if (plan.id !== planId || seen.has(plan)) return;
    seen.add(plan);
    found = true;
    const hostPhases = (plan.phases ?? []) as AnyRec[];
    plan.phases = hostPhases;
    for (const phase of phases) {
      let host = hostPhases.find((row) => row.title === phase.title);
      if (!host) {
        host = { id: uid(), title: phase.title, specialty: phase.specialty ?? null, healingDays: Number(phase.healingDays) || 0, dependsOnTitle: phase.dependsOnTitle ?? null, waitDays: Number(phase.waitDays) || 0, items: [] };
        hostPhases.push(host);
      }
      for (const item of (phase.items ?? []) as AnyRec[]) {
        const money = lineTotal(item.unitPrice ?? item.price, item.qty ?? 1, item.discountPercent ?? 0);
        const title = String(item.title || 'Услуга');
        host.items.push({
          id: uid(),
          title,
          toothNum: item.toothNum ?? null,
          surfaces: surfacesFor(title, item.code),
          ...money,
          listPrice: money.unitPrice,
          status: 'PROPOSED',
          durationMin: Number(item.durationMin) || 30,
          kit: item.kit || '',
          result: resultFor(title, item.code),
        });
      }
    }
    plan.total = planItems(plan).reduce((sum, line) => sum + (Number(line.price) || 0), 0);
  });
  if (!found) throw new Error('План не найден');
}

function savePlanTemplate(bag: Bag, planId: string, name: string) {
  if (!name) throw new Error('Назовите шаблон');
  seedTemplates(bag);
  let source: AnyRec | null = null;
  eachPlan(bag, (plan) => {
    if (plan.id === planId && !source) source = plan;
  });
  if (!source) throw new Error('План не найден');
  const plan = source as AnyRec;
  const row = {
    id: uid(),
    name,
    note: 'Свой шаблон',
    isArchived: false,
    phases: ((plan.phases ?? []) as AnyRec[]).map((phase) => ({
      title: phase.title,
      specialty: phase.specialty,
      healingDays: phase.healingDays,
      dependsOnTitle: phase.dependsOnTitle,
      waitDays: phase.waitDays,
      items: ((phase.items ?? []) as AnyRec[]).map((item) => ({
        title: item.title,
        toothNum: item.toothNum,
        qty: item.qty ?? 1,
        unitPrice: item.unitPrice ?? item.price,
        discountPercent: item.discountPercent ?? 0,
        price: item.price,
        kit: item.kit ?? '',
        durationMin: item.durationMin ?? 30,
        code: item.code,
      })),
    })),
  };
  (config(bag).planTemplates as AnyRec[]).unshift(row);
  return row;
}

function importMigration(bag: Bag, data: AnyRec) {
  const incoming = (data.patients ?? data.rows ?? []) as AnyRec[];
  const visits = (data.appointments ?? []) as AnyRec[];
  const reasons: Record<string, number> = {};
  let created = 0;
  let skipped = 0;
  let appointments = 0;
  let appointmentSkipped = 0;
  const bump = (reason: string) => { reasons[reason] = (reasons[reason] ?? 0) + 1; };
  for (const row of incoming) {
    if (created >= 400) {
      skipped += 1;
      bump('В демо помещается 400 новых карт');
      continue;
    }
    if (!row.firstName && !row.lastName) {
      skipped += 1;
      bump('Пустая строка');
      continue;
    }
    const digits = phoneDigits(row.phone);
    if (digits.length >= 10) {
      const hit = patients(bag).find((item) => item.isActive !== false && phoneDigits(item.phone).slice(-10) === digits.slice(-10));
      if (hit) {
        skipped += 1;
        bump('Уже есть в базе');
        continue;
      }
    }
    try {
      const patient = addPatient(bag, {
        ...row,
        phone: digits.length >= 10 ? row.phone : null,
        source: data.source || 'IMPORT',
        clientType: row.segment?.trim() || null,
        notes: [row.comment, row.cardNumber ? `Медкарта ${row.cardNumber}` : '', row.balance ? `Баланс при переезде ${row.balance}` : ''].filter(Boolean).join(' · ') || null,
        consentPd: true,
      });
      if (row.lastVisit) (patient as AnyRec).lastVisit = String(row.lastVisit).slice(0, 10);
      created += 1;
    } catch (err) {
      skipped += 1;
      bump(err instanceof Error ? err.message : 'Не записался');
    }
  }
  const schedule = bag.gets[`/workspace/schedule?date=${ANCHOR}`] as AnyRec;
  const doctors = (schedule?.doctors ?? []) as AnyRec[];
  const cabinet = (schedule?.branches as AnyRec[] | undefined)?.flatMap((branch) => branch.cabinets ?? [])[0];
  for (const visit of visits) {
    const patient = matchImported(bag, String(visit.phone ?? ''), String(visit.patient ?? visit.name ?? ''));
    if (!patient || !visit.date) {
      appointmentSkipped += 1;
      bump('Запись без пациента');
      continue;
    }
    const doctorName = String(visit.doctor ?? '');
    const doctor = doctors.find((row) => doctorName && String(row.name).toLowerCase().includes(doctorName.split(/\s+/)[0].toLowerCase())) ?? doctors[0];
    const time = String(visit.time || '09:00');
    const starts = new Date(`${String(visit.date).slice(0, 10)}T${time.length === 5 ? time : '09:00'}:00.000Z`);
    if (Number.isNaN(starts.getTime())) {
      appointmentSkipped += 1;
      bump('Кривая дата записи');
      continue;
    }
    const row: Appointment = {
      id: uid(),
      startsAt: starts.toISOString(),
      endsAt: new Date(starts.getTime() + 30 * 60000).toISOString(),
      status: String(visit.status || 'CONFIRMED'),
      cabinetId: cabinet?.id ?? null,
      doctorId: doctor?.id ?? null,
      patientId: patient.id,
      patient: personName(patient),
      doctor: doctor?.name ?? (doctorName || 'Врач'),
      cabinet: cabinet?.name ?? 'Кресло',
      service: String(visit.service || 'Приём'),
      serviceId: null,
    };
    bag.appointments.push(row);
    bag.gets[`/flow/visits/${row.id}`] = visitFrom(row, patient);
    appointments += 1;
  }
  return { created, skipped, appointments, appointmentSkipped, reasons, source: data.source ?? 'GENERIC' };
}

function matchImported(bag: Bag, phone: string, name: string) {
  const digits = phoneDigits(phone);
  if (digits.length >= 10) {
    const hit = patients(bag).find((row) => phoneDigits(row.phone).slice(-10) === digits.slice(-10));
    if (hit) return hit;
  }
  const parts = name.toLowerCase().split(/\s+/).filter((part) => part.length > 1);
  if (parts.length < 2) return undefined;
  return patients(bag).find((row) => parts.every((part) => `${row.lastName} ${row.firstName} ${row.middleName ?? ''}`.toLowerCase().includes(part)));
}

function recallList(bag: Bag) {
  const today = Date.parse(`${ANCHOR}T00:00:00.000Z`);
  const horizon = today - 183 * 86400000;
  const checkups: AnyRec[] = [];
  for (const patient of patients(bag)) {
    if (patient.isActive === false) continue;
    let last = patient.lastVisit ? Date.parse(`${String(patient.lastVisit).slice(0, 10)}T00:00:00.000Z`) : NaN;
    for (const visit of bag.appointments) {
      if (visit.patientId !== patient.id || visit.status === 'CANCELLED') continue;
      const time = Date.parse(visit.startsAt);
      if (!Number.isNaN(time) && time <= today && (Number.isNaN(last) || time > last)) last = time;
    }
    if (Number.isNaN(last) || last > horizon) continue;
    checkups.push({
      id: patient.id,
      patient: personName(patient),
      phone: patient.phone ?? null,
      lastVisit: new Date(last).toISOString(),
      days: Math.round((today - last) / 86400000),
    });
  }
  checkups.sort((a, b) => b.days - a.days);
  const plans: AnyRec[] = [];
  const seen = new Set<string>();
  eachPlan(bag, (plan, _family, card) => {
    if (seen.has(plan.id)) return;
    seen.add(plan.id);
    if (plan.signedAt || plan.status === 'ACCEPTED' || plan.status === 'COMPLETED' || plan.status === 'REJECTED') return;
    const patient = card?.patient;
    if (!patient) return;
    plans.push({
      planId: plan.id,
      patientId: patient.id,
      patient: personName(patient),
      phone: patient.phone ?? null,
      title: plan.tierLabel || plan.title,
      total: plan.total,
      status: plan.status,
    });
  });
  return { checkups: checkups.slice(0, 50), plans: plans.slice(0, 50) };
}

function checkIn(bag: Bag, code: string) {
  const people = bag.gets['/showcase/patients'] as AnyRec[];
  const person = people.find((row) => row.code === code) ?? people[0];
  if (!person) throw new Error('Код не подошёл');
  return { patient: personName(person), status: 'ARRIVED' };
}

function sendRetention(bag: Bag, ids: string[]) {
  const board = bag.gets['/showcase/retention'] as AnyRec;
  const picked = new Set(ids);
  let sent = 0;
  for (const row of board.queue as AnyRec[]) {
    if (!picked.size || picked.has(row.id)) {
      row.status = 'SENT';
      sent += 1;
    }
  }
  if (board.stats) board.stats.sentToday = Number(board.stats.sentToday ?? 0) + sent;
  return { sent };
}

function applyXray(bag: Bag, data: AnyRec) {
  const patientId = String(data.patientId ?? '');
  const card = bag.gets[`/workspace/patients/${patientId}/card`] as AnyRec | undefined;
  if (!card?.chart) throw new Error('Пациент не найден');
  const findings = (data.findings ?? []) as AnyRec[];
  for (const finding of findings) {
    paint(bag, patientId, {
      toothNum: finding.toothNum,
      surface: finding.surface ?? 'O',
      condition: finding.condition,
      diagnosis: finding.title,
    });
  }
  const items = findings.map((finding) => ({
    id: uid(),
    title: finding.title || 'Находка',
    toothNum: finding.toothNum ?? null,
    surfaces: [finding.surface || 'O'],
    price: Number(finding.price) || 0,
    status: 'PROPOSED',
  }));
  const total = items.reduce((sum, item) => sum + item.price, 0);
  const family = {
    key: uid(),
    title: 'По снимку',
    plans: [{
      id: uid(),
      tier: 'OPTIMUM',
      tierLabel: 'Оптимум',
      title: 'По снимку',
      status: 'PROPOSED',
      total,
      discountPercent: 0,
      guaranteeMonths: 12,
      durationWeeks: 4,
      installmentMonths: 0,
      signedAt: null,
      signedName: null,
      abandonedAt: null,
      looseItems: [],
      explanation: 'Собрано из находок снимка.',
      phases: [{
        id: uid(),
        title: 'По снимку',
        specialty: 'Терапия',
        healingDays: 0,
        dependsOnTitle: null,
        waitDays: 0,
        items,
      }],
    }],
  };
  card.families = [...(card.families ?? []), family];
  publishFamily(bag, patientId, family);
  return { familyKey: family.key, total, count: items.length };
}

function applyCopilot(bag: Bag, patientId: string) {
  const card = bag.gets[`/workspace/patients/${patientId}/card`] as AnyRec | undefined;
  const family = makeFamily('План из подсказки');
  family.plans = [family.plans[1]];
  if (card) {
    card.families = [...(card.families ?? []), family];
    publishFamily(bag, patientId, family);
  }
  return { title: 'План из подсказки', total: 18000 };
}

function portalWrite(bag: Bag, patientId: string, action: string, data: AnyRec) {
  const portal = bag.gets[`/showcase/portal/${patientId}`] as AnyRec;
  if (action === 'chat') {
    portal.messages = [...(portal.messages ?? []), { id: uid(), direction: 'OUT', body: data.body }];
    return { demo: true };
  }
  const service = serviceById(bag, data.serviceId);
  const row = book(bag, { patientId, startsAt: data.startsAt, durationMin: service?.durationMin ?? 30, serviceId: data.serviceId });
  portal.appointments = [...(portal.appointments ?? []), { id: row.id, startsAt: row.startsAt, status: row.status, service: row.service, doctor: row.doctor }];
  return row;
}

function marketWrite(bag: Bag, patientId: string, action: string | undefined, data: AnyRec) {
  const desk = bag.gets[`/market/patients/${patientId}`] as AnyRec;
  if (!desk) return { demo: true };
  if (action === 'curator') {
    const employees = (config(bag).employees ?? bag.gets['/employees'] ?? []) as AnyRec[];
    const person = employees.find((row) => row.id === data.curatorId);
    desk.curator = person ? { id: person.id, name: personName(person) } : null;
  }
  if (action === 'ortho') desk.ortho = { classAngle: data.classAngle, notes: data.notes, monthlyFee: String(data.monthlyFee ?? ''), contractSigned: !!data.contractSigned };
  if (action === 'message') {
    desk.threads = [...(desk.threads ?? []), { id: uid(), channel: data.channel, subject: data.body }];
    return { demo: true };
  }
  if (action === 'esign') {
    const id = uid();
    desk.consents = [...(desk.consents ?? []), { id, status: 'PENDING', documentUrl: null }];
    return { id, code: '2468', hint: 'Код из SMS (демо): 2468' };
  }
  return desk;
}

function invoiceRow(bag: Bag, data: AnyRec) {
  const patient = findPatient(bag, data.patientId);
  const row = {
    id: uid(),
    number: data.number || `СЧ-${Date.now().toString().slice(-4)}`,
    totalAmount: String(data.totalAmount ?? 0),
    paidAmount: '0',
    discountAmount: '0',
    status: 'ISSUED',
    patientId: data.patientId,
    patient: { id: patient?.id, firstName: patient?.firstName ?? '', lastName: patient?.lastName ?? '' },
  };
  const summary = bag.gets['/finance/summary'] as AnyRec | undefined;
  if (summary) {
    summary.openInvoices = Number(summary.openInvoices ?? 0) + 1;
    summary.receivable = Number(summary.receivable ?? 0) + Number(row.totalAmount);
  }
  return row;
}

function addPayment(bag: Bag, data: AnyRec) {
  const row = { id: uid(), patientId: data.patientId, invoiceId: data.invoiceId ?? null, amount: String(data.amount), method: data.method || 'CASH', paidAt: anchorNow() };
  pushList(bag, '/finance/payments', row);
  applyPaid(bag, data.invoiceId, Number(data.amount) || 0);
  const summary = bag.gets['/finance/summary'] as AnyRec | undefined;
  if (summary) {
    summary.totalPayments = Number(summary.totalPayments ?? 0) + Number(data.amount || 0);
    summary.paymentCount = Number(summary.paymentCount ?? 0) + 1;
  }
  return row;
}

function discountInvoice(bag: Bag, id: string, discountAmount: number) {
  const invoice = (bag.gets['/finance/invoices'] as AnyRec[]).find((item) => item.id === id);
  if (!invoice) throw new Error('Счёт не найден');
  const total = Number(invoice.totalAmount);
  const discount = Math.min(Math.max(0, discountAmount), total);
  invoice.discountAmount = String(discount);
  const due = total - discount;
  const paid = Number(invoice.paidAmount ?? 0);
  invoice.status = paid <= 0 ? 'ISSUED' : paid >= due ? 'PAID' : 'PARTIAL';
  return invoice;
}

function refundPayment(bag: Bag, id: string, amount: number) {
  const payments = bag.gets['/finance/payments'] as AnyRec[];
  const payment = payments.find((item) => item.id === id);
  if (!payment) throw new Error('Оплата не найдена');
  const refund = { id: uid(), patientId: payment.patientId, invoiceId: payment.invoiceId, amount: String(-Math.abs(amount || Number(payment.amount))), method: payment.method, paidAt: anchorNow(), refundOfId: id };
  payments.unshift(refund);
  if (payment.invoiceId) applyPaid(bag, payment.invoiceId, -Math.abs(amount || Number(payment.amount)));
  return refund;
}

function applyPaid(bag: Bag, invoiceId: string | undefined, delta: number) {
  if (!invoiceId) return;
  const invoice = (bag.gets['/finance/invoices'] as AnyRec[]).find((item) => item.id === invoiceId);
  if (!invoice) return;
  const paid = Math.max(0, kopecks(invoice.paidAmount) + kopecks(delta));
  invoice.paidAmount = fromKopecks(paid);
  invoice.status = invoiceStatus({ total: kopecks(invoice.totalAmount), discount: kopecks(invoice.discountAmount), paid, current: invoice.status });
}

function remember(bag: Bag, pathname: string, method: string, data: AnyRec, _token: string) {
  const created = { id: data.id || uid(), createdAt: anchorNow(), ...data };
  if (method === 'POST') {
    if (Array.isArray(bag.gets[pathname])) (bag.gets[pathname] as AnyRec[]).unshift(created);
    const host = bag.gets[pathname] as AnyRec | undefined;
    if (host && Array.isArray(host.items)) host.items.unshift(created);
  }
  if (method === 'PATCH' || method === 'PUT') {
    const id = pathname.split('/').filter(Boolean).pop();
    walk(bag.gets, (row) => {
      if (row && row.id === id) Object.assign(row, data);
    });
  }
  return created;
}

function walk(value: unknown, visit: (row: AnyRec) => void) {
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, visit));
    return;
  }
  if (value && typeof value === 'object') {
    visit(value as AnyRec);
    for (const item of Object.values(value as AnyRec)) walk(item, visit);
  }
}

export async function demoRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const token = header(options.headers, 'authorization').replace(/^Bearer\s+/i, '');
  const body = typeof options.body === 'string' && options.body ? JSON.parse(options.body) as AnyRec : {};
  if (method === 'GET') return shift(read(path, token), 1) as T;
  const result = write(path, method, body, token);
  persist();
  return shift(result, 1) as T;
}

function header(headers: HeadersInit | undefined, name: string) {
  if (!headers) return '';
  if (headers instanceof Headers) return headers.get(name) ?? '';
  if (Array.isArray(headers)) return headers.find(([key]) => key.toLowerCase() === name)?.[1] ?? '';
  const record = headers as Record<string, string>;
  return record[name] ?? record[name.toLowerCase()] ?? record.Authorization ?? '';
}

export function demoFileUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Ошибка загрузки'));
    reader.readAsDataURL(file);
  });
}
