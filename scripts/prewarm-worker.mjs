/**
 * Post-deploy pre-warm script.
 *
 * After a fresh deploy, all Cloudflare Worker instances are cold. The first
 * real user request hits a cold Worker, V8 has to parse + compile the 5MB
 * bundle, and memory pressure can cause Error 1102 for the first ~10 minutes.
 *
 * This script fires several concurrent requests immediately after deploy so
 * the Worker initializes and V8 caches compiled bytecode BEFORE users arrive.
 * With Smart Placement active, traffic converges to 1-2 edge nodes — warming
 * those few nodes is fast and reliable.
 *
 * Strategy:
 *   - Hit 5 lightweight routes concurrently (different paths = different code paths)
 *   - Retry each up to 3 times with a short back-off
 *   - Print a clear pass/fail summary
 */

const BASE_URL = 'https://match-duel.com';

// Routes that are fast, cacheable, and exercise different parts of the bundle.
// Avoid auth-gated routes so we don't need credentials here.
const WARM_ROUTES = [
  '/',                        // main page — exercises the full SSR + App Router
  '/api/health',              // lightweight no-auth API ping
  '/api/health',              // second concurrent hit — ensures node is initialized
  '/',                        // third hit to the main SSR path
  '/',                        // fourth hit — belt and suspenders
];

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function warmRoute(path, attempt = 1) {
  const url = `${BASE_URL}${path}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      // Don't follow redirects endlessly; a 3xx is fine — Worker woke up.
      redirect: 'manual',
      headers: { 'X-Prewarm': '1' },
      signal: AbortSignal.timeout(15_000),
    });
    // 2xx, 3xx, and even 4xx (401 Unauthorized etc.) all mean the Worker
    // initialized successfully. Only 5xx / network errors mean cold-start failure.
    if (res.status < 500) {
      return { path, ok: true, status: res.status };
    }
    throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      return warmRoute(path, attempt + 1);
    }
    return { path, ok: false, error: String(err) };
  }
}

async function main() {
  console.log('[prewarm] Warming Cloudflare Worker — firing concurrent requests…');
  const start = Date.now();

  const results = await Promise.all(WARM_ROUTES.map((path) => warmRoute(path)));

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  for (const r of results) {
    const icon = r.ok ? '✓' : '✗';
    const detail = r.ok ? `HTTP ${r.status}` : r.error;
    console.log(`[prewarm]   ${icon}  ${r.path}  (${detail})`);
  }

  if (failed.length === 0) {
    console.log(`[prewarm] Worker warm in ${elapsed}s — all ${passed} probes succeeded.`);
  } else {
    console.warn(`[prewarm] ${failed.length}/${results.length} probes failed after ${MAX_RETRIES} retries. Worker may still be cold.`);
    // Don't exit(1) — a partial warm is better than blocking the deploy.
  }
}

main();
