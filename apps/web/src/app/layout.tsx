import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Jost, Onest } from 'next/font/google';
import { AuthProvider } from '@/lib/auth-context';
import { BranchProvider } from '@/lib/branch-context';
import { ThemeProvider } from '@/lib/theme-context';
import { PwaRegister } from '@/components/pwa-register';
import './globals.css';

const body = Onest({ subsets: ['cyrillic', 'latin'], weight: ['400', '500', '600', '700'], display: 'swap', variable: '--font-body' });
const display = Jost({ subsets: ['cyrillic', 'latin'], weight: ['400', '500', '600', '700'], display: 'swap', variable: '--font-display' });
const mono = IBM_Plex_Mono({ subsets: ['cyrillic', 'latin'], weight: ['500'], display: 'swap', variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Седракович Дент',
  description: 'Седракович Дент — CRM для стоматологических клиник',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: 'Седракович Дент' },
};

/**
 * maximumScale stops iPhone Safari from zooming into a field on tap and staying zoomed (which cut the
 * right edge off every screen); iOS still lets people pinch-zoom, so nothing is lost for accessibility.
 * viewport-fit=cover lets the bottom menu sit above the home bar using the safe-area insets.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#141414',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The inline script below sets the theme class and density before React hydrates.
    <html lang="ru" className={`${body.variable} ${display.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('dsp_theme');if(t==='dark')document.documentElement.classList.add('dark');var d=localStorage.getItem('sd_density')||'compact';document.documentElement.dataset.density=d}catch(e){}`,
          }}
        />
      </head>
      <body>
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
