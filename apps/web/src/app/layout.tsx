import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { AuthProvider } from '@/lib/auth-context';
import { BranchProvider } from '@/lib/branch-context';
import { PwaRegister } from '@/components/pwa-register';
import './globals.css';

const fontSans = localFont({
  src: '../fonts/GolosText.ttf',
  variable: '--font-sans',
  weight: '400 700',
  display: 'swap',
});

const fontDisplay = localFont({
  src: '../fonts/Unbounded.ttf',
  variable: '--font-display',
  weight: '500',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Sedrakoich dent',
  description: 'CRM для стоматологических клиник',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: 'Sedrakoich dent' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${fontSans.variable} ${fontDisplay.variable}`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0c3d45" />
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
