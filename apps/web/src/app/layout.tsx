import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/lib/auth-context';
import { BranchProvider } from '@/lib/branch-context';
import { ThemeProvider } from '@/lib/theme-context';
import { PwaRegister } from '@/components/pwa-register';
import './globals.css';

const inter = Inter({
  subsets: ['cyrillic', 'latin'],
  display: 'swap',
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'Седракович Дент',
  description: 'Седракович Дент — CRM для стоматологических клиник',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: 'Седракович Дент' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={inter.variable}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0f766e" />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('dsp_theme');if(t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark');var d=localStorage.getItem('sd_density')||'compact';document.documentElement.dataset.density=d}catch(e){}`,
          }}
        />
      </head>
      <body className={inter.className}>
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
