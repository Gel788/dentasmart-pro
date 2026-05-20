'use client';

import { Protected } from '@/components/protected';
import { Card, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';

export default function WidgetPage() {
  const slug = 'demo-clinic';
  const embed = `<script src="https://your-domain.com/widget/dentasmart-widget.js" data-clinic="${slug}"></script>`;

  return (
    <Protected>
      <PageHeader
        badge="Виджет"
        title="Виджет онлайн-записи"
        description="Web Component для встраивания на любой сайт"
      />

      <div className="space-y-4">
        <Card>
          <CardHeader title="Код вставки" />
          <pre className="overflow-x-auto rounded-lg bg-[var(--bg)] p-4 text-xs">{embed}</pre>
        </Card>
        <Card>
          <CardHeader title="Публичный API" />
          <ul className="space-y-1 text-sm text-[var(--muted)]">
            <li>{`GET /api/v1/public/widget/${slug}/config`}</li>
            <li>{`GET /api/v1/public/widget/${slug}/services`}</li>
            <li>{`GET /api/v1/public/widget/${slug}/slots`}</li>
            <li>{`POST /api/v1/public/widget/${slug}/book`}</li>
          </ul>
        </Card>
      </div>
    </Protected>
  );
}
