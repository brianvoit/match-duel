import type { Metadata, Viewport } from 'next';
import { ReactNode } from 'react';
import '@/app/globals.css';

export const metadata: Metadata = {
  title: "World Cup Pick'Em '26",
  description: 'Head-to-head FIFA World Cup 2026 prediction game. Pick match winners, earn points, beat your friend.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: "Pick'Em",
    statusBarStyle: 'default',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
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
        <meta name="apple-mobile-web-app-title" content="Pick'Em" />
        <link rel="apple-touch-icon" href="/icon.svg" />
      </head>
      <body>{children}</body>
    </html>
  );
}
