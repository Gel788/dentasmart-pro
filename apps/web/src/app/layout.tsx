import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { AuthProvider } from '@/lib/auth-context';
import { BranchProvider } from '@/lib/branch-context';
import { PwaRegister } from '@/components/pwa-register';
import './globals.css';

const fontSans = Plus_Jakarta_Sans({
  subsets: ['latin', 'cyrillic-ext'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'DentaSmart Pro',
  description: 'CRM для стоматологических клиник',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: 'DentaSmart' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={fontSans.variable}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0d9488" />
      </head>
      <body className={fontSans.className}>
        <AuthProvider>
          <BranchProvider>
            <PwaRegister />
            {children}
          </BranchProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
