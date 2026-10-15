import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { AuthProvider } from '@/lib/auth-context';
import { BranchProvider } from '@/lib/branch-context';
import { ThemeProvider } from '@/lib/theme-context';
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
  title: 'Седракович Дент',
  description: 'Седракович Дент — CRM для стоматологических клиник',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: 'Седракович Дент' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${fontSans.variable} ${fontDisplay.variable}`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#141c22" />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('dsp_theme');if(t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
      </head>
      <body className={fontSans.className}>
        <ThemeProvider>
          <AuthProvider>
            <BranchProvider>
              <PwaRegister />
              {children}
            </BranchProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
