import type { Metadata, Viewport } from 'next';
import { ReactNode } from 'react';
import Script from 'next/script';
import '@/app/globals.css';

const GA_ID = 'G-G2LQTY45KX';

export const metadata: Metadata = {
  title: 'Match Duel',
  description: 'Head-to-head World Cup prediction game. Draft teams, earn points, beat your friend.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'Match Duel',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/icons/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png',   sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png',   sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: '#1266d6',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* iOS PWA — must be explicit meta tags, Next.js metadata API doesn't cover all of them */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Match Duel" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      </head>
      {/* Google Analytics 4 — production only, never fires on localhost */}
      {process.env.NODE_ENV === 'production' && <>
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
        <Script id="ga4-init" strategy="afterInteractive">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}', { send_page_view: true });
        `}</Script>
      </>}
      <body>{children}</body>
    </html>
  );
}
