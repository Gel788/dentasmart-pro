import { HubPage } from '@/components/hub-page';

export default function SupplyPage() {
  return (
    <HubPage
      title="Снабжение"
      description="Всё, что нужно к визитам"
      parts={[
        { href: '/warehouse', title: 'Склад', text: 'Остатки, партии, сроки годности' },
        { href: '/lab', title: 'Лаборатория', text: 'Заказ-наряды и сроки сдачи' },
        { href: '/sterilization', title: 'Стерилизация', text: 'Журнал циклов' },
      ]}
    />
  );
}
