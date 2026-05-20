import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Users,
  Calendar,
  Building2,
  Stethoscope,
  Wallet,
  Package,
  FlaskConical,
  Megaphone,
  MessageSquare,
  BarChart3,
  UserCog,
  Sparkles,
  Settings,
  Globe,
  ClipboardList,
  Plug,
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
  { href: '/dashboard', label: 'Дашборд', icon: LayoutDashboard, group: 'Главное', description: 'KPI и воронка' },
  { href: '/patients', label: 'Пациенты', icon: Users, group: 'Главное', description: 'CRM-ядро' },
  { href: '/schedule', label: 'Расписание', icon: Calendar, group: 'Главное', description: 'Запись и статусы' },
  { href: '/clinical', label: 'Клиника', icon: Stethoscope, group: 'Медицина', description: 'Планы и зубы' },
  { href: '/services', label: 'Услуги', icon: ClipboardList, group: 'Медицина', description: 'Прайс-лист' },
  { href: '/lab', label: 'Зуботехника', icon: FlaskConical, group: 'Медицина', description: 'Заказ-наряды' },
  { href: '/finance', label: 'Финансы', icon: Wallet, group: 'Бизнес', description: 'Счета и оплаты' },
  { href: '/warehouse', label: 'Склад', icon: Package, group: 'Бизнес', description: 'Остатки' },
  { href: '/marketing', label: 'Маркетинг', icon: Megaphone, group: 'Рост', description: 'Кампании' },
  { href: '/communications', label: 'Коммуникации', icon: MessageSquare, group: 'Рост', description: 'Журнал обращений' },
  { href: '/analytics', label: 'Аналитика', icon: BarChart3, group: 'Рост', description: 'KPI и AI' },
  { href: '/reports', label: 'Отчёты', icon: ClipboardList, group: 'Рост', description: 'Конструктор отчётов' },
  { href: '/employees', label: 'Сотрудники', icon: UserCog, group: 'Админ', description: 'Кадры' },
  { href: '/branches', label: 'Филиалы', icon: Building2, group: 'Админ', description: 'Структура' },
  { href: '/integrations', label: 'Интеграции', icon: Plug, group: 'Админ', description: '1С, касса, ЕГИСЗ (заглушки)' },
  { href: '/settings', label: 'Настройки', icon: Settings, group: 'Админ', description: 'Орг, 2FA, аудит' },
  { href: '/widget', label: 'Виджет записи', icon: Globe, group: 'Админ', description: 'Онлайн-запись' },
];

export const NAV_GROUPS = [...new Set(NAVIGATION.map((n) => n.group))];
