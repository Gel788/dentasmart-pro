import Script from 'next/script';

/** The clinic's public booking page: the same widget a clinic embeds on its own site. */
export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
  return (
    <main style={{ minHeight: '100dvh', background: '#f2f3f5', padding: 'max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 32px max(16px, env(safe-area-inset-left))' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <dentasmart-booking />
      </div>
      <Script src="/widget/dentasmart-widget.js" data-clinic={slug} data-api={api} data-mount="manual" strategy="afterInteractive" />
    </main>
  );
}

export const metadata = { title: 'Запись на приём', robots: { index: false } };
