import type { LucideIcon } from 'lucide-react';
import {
  Armchair,
  BarChart3,
  Building2,
  Calendar,
  ClipboardList,
  ListChecks,
  FlaskConical,
  Globe,
  ShieldCheck,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Package,
  Plug,
  Settings,
  Sparkles,
  Stethoscope,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group: string;
  description: string;
}

export const NAVIGATION: NavItem[] = [
  { href: '/reception', label: 'Ресепшн', icon: Sparkles, group: 'Главное', description: 'Рабочий стол на сегодня' },
  { href: '/visit', label: 'Приём', icon: Armchair, group: 'Главное', description: 'Кресло: зубы, план и счёт' },
  { href: '/queues', label: 'Очереди', icon: ListChecks, group: 'Главное', description: 'Неявки, планы, долги, кресла' },
  { href: '/dashboard', label: 'Дашборд', icon: LayoutDashboard, group: 'Главное', description: 'KPI и воронка' },
  { href: '/patients', label: 'Пациенты', icon: Users, group: 'Главное', description: 'Карты пациентов' },
  { href: '/schedule', label: 'Расписание', icon: Calendar, group: 'Главное', description: 'Запись и статусы' },
  { href: '/clinical', label: 'Клиника', icon: Stethoscope, group: 'Медицина', description: 'Планы и зубы' },
  { href: '/services', label: 'Услуги', icon: ClipboardList, group: 'Медицина', description: 'Прайс-лист' },
  { href: '/lab', label: 'Зуботехника', icon: FlaskConical, group: 'Медицина', description: 'Заказ-наряды' },
  { href: '/sterilization', label: 'Стерилизация', icon: ShieldCheck, group: 'Медицина', description: 'Журнал циклов' },
  { href: '/finance', label: 'Финансы', icon: Wallet, group: 'Бизнес', description: 'Счета и оплаты' },
  { href: '/warehouse', label: 'Склад', icon: Package, group: 'Бизнес', description: 'Остатки' },
  { href: '/marketing', label: 'Маркетинг', icon: Megaphone, group: 'Рост', description: 'Кампании' },
  { href: '/communications', label: 'Коммуникации', icon: MessageSquare, group: 'Рост', description: 'Журнал обращений' },
  { href: '/analytics', label: 'Аналитика', icon: BarChart3, group: 'Рост', description: 'KPI' },
  { href: '/reports', label: 'Отчёты', icon: ClipboardList, group: 'Рост', description: 'Отчёты' },
  { href: '/employees', label: 'Сотрудники', icon: UserCog, group: 'Админ', description: 'Кадры и зарплата' },
  { href: '/branches', label: 'Филиалы', icon: Building2, group: 'Админ', description: 'Структура' },
  { href: '/integrations', label: 'Интеграции', icon: Plug, group: 'Админ', description: 'Касса, ЕГИСЗ, телефония' },
  { href: '/settings', label: 'Настройки', icon: Settings, group: 'Админ', description: 'Организация и доступ' },
  { href: '/widget', label: 'Виджет записи', icon: Globe, group: 'Админ', description: 'Онлайн-запись' },
];

export const NAV_GROUPS = [...new Set(NAVIGATION.map((item) => item.group))];

export function isNavActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function findNavItem(pathname: string) {
  return NAVIGATION.find((item) => isNavActive(pathname, item.href)) ?? null;
}
