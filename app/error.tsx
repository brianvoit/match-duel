'use client';

import { useEffect } from 'react';
import Link from 'next/link';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log to an error reporting service in production
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div
          style={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            padding: '1.5rem',
            fontFamily: 'system-ui, sans-serif',
            textAlign: 'center'
          }}
        >
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ color: '#6b7280', margin: 0 }}>
            An unexpected error occurred. Try again or go back to the home page.
          </p>
          {error.digest && (
            <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>
              Error ID: {error.digest}
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={reset}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '0.375rem',
                border: '1px solid #d1d5db',
                background: '#fff',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              Try again
            </button>
            <Link
              href="/"
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '0.375rem',
                border: '1px solid #d1d5db',
                background: '#fff',
                textDecoration: 'none',
                color: 'inherit',
                fontSize: '0.875rem'
              }}
            >
              Go home
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
