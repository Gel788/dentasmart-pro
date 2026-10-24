import type { Metadata } from 'next';
import { HomeGate } from '@/components/marketing/home-gate';

export const metadata: Metadata = {
  title: 'ZAZA — CRM для стоматологий',
  description: 'Карта зубов, три варианта плана лечения, расшифровка цены и маршрут после подписи. Авторский проект Завена Агаяна.',
};

export default function HomePage() {
  return <HomeGate />;
}
