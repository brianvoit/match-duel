import Link from 'next/link';

export default function NotFound() {
  return (
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
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Page not found</h1>
      <p style={{ color: '#6b7280', margin: 0 }}>
        This page doesn&apos;t exist or you may not have access to it.
      </p>
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
  );
}
