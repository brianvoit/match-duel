/**
 * Post-deploy script: sets the match-duel Worker usage model to "unbound".
 *
 * Cloudflare removed `usage_model` from wrangler.toml (v4.98 still rejects it),
 * so every `wrangler deploy` resets the Worker to Standard (30ms CPU limit).
 * This script re-applies Unbound (30s CPU limit) after each deploy.
 *
 * Auth: reads the OAuth token Wrangler already stored locally.
 * Never reads or writes credentials to disk — purely in-memory.
 */

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const ACCOUNT_ID = '5ae8da1d3cdc7718baa6f2b1765a36ce';
const SCRIPT_NAME = 'match-duel';

function getToken() {
  // 1. Prefer an explicit env var (useful in CI)
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;

  // 2. Fall back to Wrangler's local OAuth token
  const configPath = join(homedir(), 'Library', 'Preferences', '.wrangler', 'config', 'default.toml');
  try {
    const raw = readFileSync(configPath, 'utf8');
    const match = raw.match(/oauth_token\s*=\s*"([^"]+)"/);
    if (match) return match[1];
  } catch {
    // macOS path didn't work — try XDG
  }

  const xdgPath = join(homedir(), '.config', '.wrangler', 'config', 'default.toml');
  try {
    const raw = readFileSync(xdgPath, 'utf8');
    const match = raw.match(/oauth_token\s*=\s*"([^"]+)"/);
    if (match) return match[1];
  } catch {
    // ignore
  }

  return null;
}

async function main() {
  const token = getToken();
  if (!token) {
    console.error('[set-worker-unbound] No Cloudflare token found. Run `wrangler login` or set CLOUDFLARE_API_TOKEN.');
    process.exit(1);
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/${SCRIPT_NAME}/usage-model`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ usage_model: 'unbound' }),
  });

  const data = await res.json();
  if (data.success) {
    console.log(`[set-worker-unbound] Worker "${SCRIPT_NAME}" set to unbound (30s CPU limit).`);
  } else {
    console.error('[set-worker-unbound] Failed:', JSON.stringify(data.errors));
    process.exit(1);
  }
}

main();
