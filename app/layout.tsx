import type { Metadata } from 'next';
import { ReactNode } from 'react';
import '@/app/globals.css';

export const metadata: Metadata = {
  title: 'World Cup Pick\'Em',
  description: 'Invite-only head-to-head World Cup prediction app for 2026.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
