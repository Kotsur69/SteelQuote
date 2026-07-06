export const dynamic = 'force-dynamic';
import './globals.css';
import type { Metadata } from 'next';
import Providers from './providers';

export const metadata: Metadata = {
  title: 'Kalkulator Dopłat do Stali',
  description: 'Steel surcharge pricing tool',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script src="https://apps.abacus.ai/chatllm/appllm-lib.js"></script>
      </head>
      <body className="font-sans antialiased bg-skin-bg text-txt-primary transition-colors" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
