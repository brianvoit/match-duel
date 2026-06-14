import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Protects /play and all /api routes (except /api/auth/** and /api/admin/**).
 * - Unauthenticated requests to /play are redirected to /
 * - Unauthenticated requests to protected API routes get a 401 JSON response
 * Supabase session cookies are also refreshed on every request as recommended.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Admin API routes are token-gated inside the route handlers themselves —
  // skip the Supabase session check entirely so the cron worker doesn't burn
  // CPU on an unnecessary auth round-trip every 5 minutes.
  if (pathname.startsWith('/api/admin/')) {
    return NextResponse.next({ request });
  }

  // Health probe used by the post-deploy pre-warm script — no auth needed.
  if (pathname === '/api/health') {
    return NextResponse.next({ request });
  }

  // Build a response we can attach refreshed cookies to
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value);
            response = NextResponse.next({ request });
            response.cookies.set(name, value, options);
          }
        }
      }
    }
  );

  // Refresh session — required by @supabase/ssr to keep tokens alive
  const {
    data: { user }
  } = await supabase.auth.getUser();

  // Dev bypass — skip all auth checks on localhost when BYPASS_AUTH=true
  if (process.env.BYPASS_AUTH === 'true') {
    if (pathname === '/') return NextResponse.redirect(new URL('/play', request.url));
    return response;
  }

  // / → /play if already authenticated (don't serve landing page to logged-in users)
  if (pathname === '/' && user) {
    return NextResponse.redirect(new URL('/play', request.url));
  }

  // /play requires a session — redirect to landing page if not authenticated
  if (pathname.startsWith('/play') && !user) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Protected API routes return 401 if not authenticated
  // Excluded: /api/auth/** (OAuth callbacks) and /api/admin/** (token-gated separately)
  const isProtectedApi =
    pathname.startsWith('/api/') &&
    !pathname.startsWith('/api/auth/') &&
    !pathname.startsWith('/api/admin/');

  if (isProtectedApi && !user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimisation)
     * - favicon.ico
     * - The root landing page itself (/) — unauthenticated users need to see it
     */
    '/((?!_next/static|_next/image|favicon.ico).*)'
  ]
};
