import snapshot from './snapshot.json';

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

function patientPage(bag: Bag, query: Record<string, string>) {
  const needle = (query.search || '').trim().toLowerCase();
  let items = patients(bag);
  if (needle) {
    items = items.filter((row) => `${row.lastName} ${row.firstName} ${row.middleName ?? ''} ${row.phone ?? ''}`.toLowerCase().includes(needle));
  }
  const pageSize = Number(query.pageSize || 40);
  const page = Number(query.page || 1);
  return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize };
}

function searchPeople(bag: Bag, raw: string) {
  const needle = decodeURIComponent(raw).replace(/\D/g, '').length > 3
    ? decodeURIComponent(raw).toLowerCase()
    : decodeURIComponent(raw).trim().toLowerCase();
  if (needle.length < 2) return [];
  return patients(bag)
    .filter((row) => `${row.lastName} ${row.firstName} ${row.phone ?? ''}`.toLowerCase().includes(needle)
      || (row.phone ?? '').replace(/\D/g, '').includes(needle.replace(/\D/g, '')))
    .slice(0, 8)
    .map((row) => ({ id: row.id, firstName: row.firstName, lastName: row.lastName, phone: row.phone ?? null, birthDate: row.birthDate ?? null }));
}

function scheduleFor(bag: Bag, date: string) {
  const shell = bag.gets[`/workspace/schedule?date=${ANCHOR}`] as AnyRec;
  const day = shiftString(date.slice(0, 10), -1);
  const appointments = bag.appointments.filter((row) => row.startsAt.slice(0, 10) === day);
  return { ...shell, date: `${day}T00:00:00.000Z`, appointments };
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
  if (patientPatch && method === 'PATCH') {
    const row = findPatient(bag, patientPatch[1]);
    if (row) Object.assign(row, data);
    return row ?? data;
  }

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
  if (pathname === '/config/stock') return pushConfig(bag, 'stock', { id: uid(), name: data.name, unit: data.unit ?? 'шт', minStock: data.minStock ?? 5, quantity: data.quantity ?? 10, cost: data.cost ?? 100 });
  const receive = pathname.match(/^\/config\/stock\/([^/]+)\/receive$/);
  if (receive) {
    const row = (config(bag).stock as AnyRec[]).find((item) => item.id === receive[1]);
    if (row) row.quantity = Number(row.quantity ?? 0) + Number(data.quantity ?? 1);
    return row ?? { ok: true };
  }
  if (pathname === '/config/visit-templates') return saveTemplate(bag, data);
  if (pathname === '/config/plan-templates') return pushConfig(bag, 'planTemplates', { id: uid(), ...data });
  if (pathname === '/config/documents') return pushConfig(bag, 'documents', { id: uid(), ...data });
  if (pathname === '/config/brand') {
    config(bag).brand = { ...(config(bag).brand ?? {}), ...data };
    return config(bag).brand;
  }
  if (pathname === '/config/cabinets') return pushConfig(bag, 'cabinets', { id: uid(), name: data.name });
  if (pathname === '/config/employees') return saveEmployee(bag, data);
  if (pathname === '/config/roles') return saveRole(bag, data);
  if (pathname === '/config/promos') return pushConfig(bag, 'promos', { id: uid(), code: data.code, discountPct: data.discountPct ?? 10, isActive: true });
  if (pathname === '/config/rules') return pushConfig(bag, 'rules', { id: uid(), ...data, isActive: true });

  if (pathname === '/workspace/appointments') return book(bag, data);
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
  const bookPhase = pathname.match(/^\/workspace\/plans\/([^/]+)\/phases\/([^/]+)\/book$/);
  if (bookPhase) return bookPhaseVisit(bag, bookPhase[1], bookPhase[2]);
  const accept = pathname.match(/^\/workspace\/plans\/([^/]+)\/(accept|accept-partial|abandon)$/);
  if (accept) return acceptPlan(bag, accept[1], accept[2], data);
  const restore = pathname.match(/^\/workspace\/plans\/([^/]+)\/versions\/([^/]+)\/restore$/);
  if (restore) return restorePlan(bag, restore[1], restore[2]);

  if (pathname === '/lab/orders' && method === 'POST') return addLab(bag, data);
  const labStatus = pathname.match(/^\/lab\/orders\/([^/]+)\/(status|scan)$/);
  if (labStatus) return patchLab(bag, labStatus[1], labStatus[2] === 'scan' ? { stlFileUrl: data.fileUrl } : { status: data.status });

  if (pathname === '/showcase/onboarding' && method === 'POST') {
    const current = bag.gets['/showcase/onboarding'] as AnyRec;
    Object.assign(current, data);
    return current;
  }
  if (pathname === '/showcase/import') return importRows(bag, data.rows ?? []);
  if (pathname === '/showcase/check-in') return checkIn(bag, data.code);
  if (pathname === '/showcase/retention/send') return sendRetention(bag, data.ids ?? []);
  if (pathname === '/market/copilot/apply') return applyCopilot(bag, data.patientId);
  const portalBook = pathname.match(/^\/showcase\/portal\/([^/]+)\/(book|chat)$/);
  if (portalBook) return portalWrite(bag, portalBook[1], portalBook[2], data);

  if (pathname === '/finance/invoices' && method === 'POST') return pushList(bag, '/finance/invoices', invoiceRow(bag, data));
  if (pathname === '/finance/payments' && method === 'POST') return pushList(bag, '/finance/payments', { id: uid(), ...data, paidAt: anchorNow() });
  if (pathname === '/finance/payroll/accrue') return { count: 1 };
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
  const row = {
    id: uid(),
    firstName: data.firstName ?? '',
    lastName: data.lastName ?? '',
    middleName: data.middleName ?? null,
    phone: data.phone ?? null,
    email: data.email ?? null,
    birthDate: data.birthDate ?? null,
    tags: [],
    allergies: [],
    isActive: true,
    source: data.source ?? 'WALK_IN',
    createdAt: anchorNow(),
  };
  patients(bag).unshift(row);
  const card = {
    patient: row,
    debt: 0,
    alerts: [],
    timeline: [],
    chart: { surfaces: [], events: [] },
    perio: null,
    families: [],
  };
  bag.gets[`/workspace/patients/${row.id}/card`] = card;
  bag.gets[`/workspace/patients/${row.id}/brief`] = { id: row.id, name: personName(row), alerts: [], next: null };
  bag.gets[`/patients/${row.id}`] = row;
  return row;
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
  if (data.id) {
    const row = list.find((item) => item.id === data.id);
    if (row) Object.assign(row, data);
    return row ?? data;
  }
  return pushConfig(bag, 'employees', { id: uid(), firstName: data.firstName, lastName: data.lastName, specialization: data.specialization ?? '', commission: data.commission ?? 0, days: data.days ?? [1, 2, 3, 4, 5] });
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
    allergies: patient?.allergies ?? [],
  };
  bag.appointments.push(row);
  const visit = visitFrom(row, patient);
  bag.gets[`/flow/visits/${row.id}`] = visit;
  return row;
}

function moveAppointment(bag: Bag, id: string, data: AnyRec) {
  const row = bag.appointments.find((item) => item.id === id);
  if (!row) throw new Error('Запись не найдена');
  Object.assign(row, data);
  const visit = bag.gets[`/flow/visits/${id}`] as AnyRec | undefined;
  if (visit) Object.assign(visit, { startsAt: row.startsAt, endsAt: row.endsAt });
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
      const starts = new Date(Date.parse(`${ANCHOR}T09:00:00.000Z`) + (index + 1) * 86400000);
      const patientId = card?.patient?.id ?? family.patient?.id;
      if (patientId) {
        const row = book(bag, { patientId, startsAt: starts.toISOString(), durationMin: 60 });
        row.service = phase.title;
        appointments.push({ startsAt: row.startsAt, title: phase.title });
      }
    });
  });
  return { appointments };
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

function importRows(bag: Bag, rows: AnyRec[]) {
  let created = 0;
  let skipped = 0;
  for (const row of rows) {
    const exists = patients(bag).some((item) => item.phone && row.phone && item.phone === row.phone);
    if (exists || (!row.firstName && !row.lastName)) {
      skipped += 1;
      continue;
    }
    addPatient(bag, row);
    created += 1;
  }
  return { created, skipped };
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
  return { id: uid(), number: data.number || `СЧ-${Date.now().toString().slice(-4)}`, totalAmount: data.totalAmount, status: 'ISSUED', patientId: data.patientId, patient };
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
