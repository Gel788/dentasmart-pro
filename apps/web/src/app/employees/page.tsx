'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Protected } from '@/components/protected';
import { PatientAvatar } from '@/components/patient-avatar';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { ListRow } from '@/components/ui/list-row';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api';
import { useBranch } from '@/lib/branch-context';
import { EMPLOYEE_STATUS, label } from '@/lib/format';

const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  specialization?: string;
  status: string;
  phone?: string;
  user: { email: string };
  branches: { branch: { id: string; name: string } }[];
};

type Schedule = {
  id: string;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
  employee: { firstName: string; lastName: string };
};

export default function EmployeesPage() {
  const { branches, branchId } = useBranch();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [payroll, setPayroll] = useState<unknown[]>([]);
  const [editEmp, setEditEmp] = useState<Employee | null>(null);
  const [editForm, setEditForm] = useState({ specialization: '', status: 'ACTIVE', branchIds: [] as string[] });
  const [schedModal, setSchedModal] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [roles, setRoles] = useState<{ code: string; name: string }[]>([]);
  const [schedForm, setSchedForm] = useState({ employeeId: '', dayOfWeek: '1', startsAt: '09:00', endsAt: '18:00' });
  const [createForm, setCreateForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    phone: '',
    specialization: '',
    roleCode: 'doctor',
    branchIds: [] as string[],
  });

  const load = useCallback(() => {
    api<Employee[]>('/employees').then(setEmployees);
    api<{ code: string; name: string }[]>('/employees/roles').then(setRoles);
    api<Schedule[]>(`/employees/schedules${branchId ? `?branchId=${branchId}` : ''}`).then(setSchedules);
    api<unknown[]>('/employees/payroll').then(setPayroll);
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  const saveEmployee = async (e: FormEvent) => {
    e.preventDefault();
    if (!editEmp) return;
    await api(`/employees/${editEmp.id}`, {
      method: 'PATCH',
      body: JSON.stringify(editForm),
    });
    setEditEmp(null);
    load();
  };

  const createEmployee = async (e: FormEvent) => {
    e.preventDefault();
    await api('/employees', {
      method: 'POST',
      body: JSON.stringify({
        ...createForm,
        branchIds: createForm.branchIds.length ? createForm.branchIds : branchId ? [branchId] : [],
      }),
    });
    setCreateModal(false);
    setCreateForm({
      email: '',
      password: '',
      firstName: '',
      lastName: '',
      phone: '',
      specialization: '',
      roleCode: 'doctor',
      branchIds: [],
    });
    load();
  };

  const addSchedule = async (e: FormEvent) => {
    e.preventDefault();
    await api('/employees/schedules', {
      method: 'POST',
      body: JSON.stringify({
        ...schedForm,
        branchId,
        dayOfWeek: +schedForm.dayOfWeek,
      }),
    });
    setSchedModal(false);
    load();
  };

  return (
    <Protected>
      <PageHeader
        badge="Кадры"
        title="Сотрудники"
        description="Команда, графики и начисления"
        action={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setCreateModal(true)}>
              <UserPlus size={16} />
              Сотрудник
            </Button>
            <Button variant="ghost" onClick={() => setSchedModal(true)}>+ Смена в графике</Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" padding={false}>
          <div className="border-b border-[var(--border)] px-5 py-4">
            <CardHeader title="Команда" description="Нажмите на сотрудника для редактирования" />
          </div>
          <div className="space-y-2 p-4">
            {employees.map((e) => (
              <button
                key={e.id}
                type="button"
                className="w-full rounded-xl text-left transition hover:bg-[var(--surface-muted)]"
                onClick={() => {
                  setEditEmp(e);
                  setEditForm({
                    specialization: e.specialization ?? '',
                    status: e.status,
                    branchIds: e.branches.map((b) => b.branch.id),
                  });
                }}
              >
                <ListRow trailing={<Badge variant={e.status === 'ACTIVE' ? 'success' : 'default'}>{label(EMPLOYEE_STATUS, e.status)}</Badge>}>
                  <div className="flex items-center gap-3">
                    <PatientAvatar firstName={e.firstName} lastName={e.lastName} size="sm" />
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--text)]">{e.lastName} {e.firstName}</p>
                      <p className="text-[var(--muted)]">{e.specialization ?? '—'}</p>
                      <p className="text-xs text-[var(--muted)]">{e.user.email}</p>
                    </div>
                  </div>
                </ListRow>
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Графики" description="Текущий филиал" />
          <div className="space-y-2">
            {schedules.map((s) => (
              <ListRow key={s.id}>
                <p className="font-medium text-[var(--text)]">
                  {s.employee.lastName} · {DAY_NAMES[s.dayOfWeek]}
                </p>
                <p className="text-[var(--muted)]">{s.startsAt}–{s.endsAt}</p>
              </ListRow>
            ))}
            {!schedules.length && <p className="text-sm text-[var(--muted)]">График не задан</p>}
          </div>
          <div className="mt-6 border-t border-[var(--border)] pt-6">
            <CardHeader title="Зарплата" />
            <div className="space-y-2">
              {(payroll as { amount: string; periodFrom: string }[]).map((p, i) => (
                <ListRow key={i} trailing={<span className="font-semibold text-[var(--accent)]">{Number(p.amount).toLocaleString('ru-RU')} ₽</span>}>
                  <p className="font-medium">{new Date(p.periodFrom).toLocaleDateString('ru-RU')}</p>
                </ListRow>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <Modal open={!!editEmp} onClose={() => setEditEmp(null)} title="Редактировать сотрудника">
        <form onSubmit={saveEmployee} className="space-y-3">
          <div><Label>Специализация</Label><Input value={editForm.specialization} onChange={(e) => setEditForm({ ...editForm, specialization: e.target.value })} /></div>
          <div>
            <Label>Статус</Label>
            <Select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
              {Object.entries(EMPLOYEE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </div>
          <div>
            <Label>Филиалы</Label>
            <div className="space-y-1 rounded-xl border border-[var(--border)] p-2">
              {branches.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editForm.branchIds.includes(b.id)}
                    onChange={(e) => {
                      setEditForm((f) => ({
                        ...f,
                        branchIds: e.target.checked
                          ? [...f.branchIds, b.id]
                          : f.branchIds.filter((id) => id !== b.id),
                      }));
                    }}
                  />
                  {b.name}
                </label>
              ))}
            </div>
          </div>
          <Button type="submit" className="w-full">Сохранить</Button>
        </form>
      </Modal>

      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Новый сотрудник" description="Создаётся учётная запись для входа в систему" size="lg">
        <form onSubmit={createEmployee} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Фамилия</Label>
              <Input required value={createForm.lastName} onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })} />
            </div>
            <div>
              <Label>Имя</Label>
              <Input required value={createForm.firstName} onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })} />
            </div>
          </div>
          <div><Label>Email (логин)</Label><Input type="email" required value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} /></div>
          <div><Label>Пароль</Label><Input type="password" required minLength={6} value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} placeholder="Минимум 6 символов" /></div>
          <div><Label>Телефон</Label><Input value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} /></div>
          <div><Label>Специализация</Label><Input value={createForm.specialization} onChange={(e) => setCreateForm({ ...createForm, specialization: e.target.value })} placeholder="Терапевт, ортодонт…" /></div>
          <div>
            <Label>Роль</Label>
            <Select value={createForm.roleCode} onChange={(e) => setCreateForm({ ...createForm, roleCode: e.target.value })}>
              {roles.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Филиалы</Label>
            <div className="space-y-1 rounded-xl border border-[var(--border)] p-2">
              {branches.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={createForm.branchIds.includes(b.id)}
                    onChange={(e) => {
                      setCreateForm((f) => ({
                        ...f,
                        branchIds: e.target.checked
                          ? [...f.branchIds, b.id]
                          : f.branchIds.filter((id) => id !== b.id),
                      }));
                    }}
                  />
                  {b.name}
                </label>
              ))}
            </div>
          </div>
          <Button type="submit" className="w-full">Создать сотрудника</Button>
        </form>
      </Modal>

      <Modal open={schedModal} onClose={() => setSchedModal(false)} title="Добавить смену">
        <form onSubmit={addSchedule} className="space-y-3">
          <div>
            <Label>Сотрудник</Label>
            <Select required value={schedForm.employeeId} onChange={(e) => setSchedForm({ ...schedForm, employeeId: e.target.value })}>
              <option value="">—</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.lastName} {e.firstName}</option>)}
            </Select>
          </div>
          <div>
            <Label>День недели</Label>
            <Select value={schedForm.dayOfWeek} onChange={(e) => setSchedForm({ ...schedForm, dayOfWeek: e.target.value })}>
              {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>С</Label><Input type="time" value={schedForm.startsAt} onChange={(e) => setSchedForm({ ...schedForm, startsAt: e.target.value })} /></div>
            <div><Label>До</Label><Input type="time" value={schedForm.endsAt} onChange={(e) => setSchedForm({ ...schedForm, endsAt: e.target.value })} /></div>
          </div>
          <Button type="submit" className="w-full">Добавить</Button>
        </form>
      </Modal>
    </Protected>
  );
}
