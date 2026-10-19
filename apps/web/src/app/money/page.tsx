import { HubPage } from '@/components/hub-page';

export default function MoneyPage() {
  return (
    <HubPage
      title="Деньги"
      description="Касса, долги и зарплата"
      parts={[
        { href: '/finance', title: 'Касса и счета', text: 'Оплаты, счета, смены' },
        { href: '/radar', title: 'Незакрытые планы и долги', text: 'Деньги, которые ждут пациента' },
        { href: '/employees', title: 'Зарплата', text: 'Начисления врачам и ассистентам' },
      ]}
    />
  );
}
