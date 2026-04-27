// Residential proxy pool. Each `pickProxy()` call advances the round-robin
// cursor; openRegionContext() invokes pickProxy() + pickFingerprint()
// together, so per-region opens AND mid-region re-rolls present a fresh
// (IP × UA × cookie-jar) tuple to Reblaze.
//
// Configuration (one of):
//   WATCHER_PROXIES_FILE — path to a file containing one proxy URL per
//     line. Preferred for large pools (e.g. DataImpulse's 2999-port
//     gateway list) so we don't stuff thousands of lines into env.
//   WATCHER_PROXIES — inline newline-or-comma-separated list. Same URL
//     format. Used as a fallback if the file is unset/missing.
//
// URL format (either source):
//     http://USER:PASS@HOST:PORT
//     https://USER:PASS@HOST:PORT
//     socks5://USER:PASS@HOST:PORT
//
// DataImpulse port-rotation note: their gateway exposes 2999 distinct
// ports (10000–12998) on a single host IP, where each PORT routes to a
// different residential exit IP. So the pool is the port list — round-
// robin through it and you cycle exit IPs without any session-token
// magic.
//
// Selection strategy: round-robin (modular index in module scope).
// Process restart resets the cursor; that's fine because fingerprint
// rotation already randomizes per tick.

import fs from 'node:fs';

export type ProxyConfig = {
  server: string;       // "http://host:port" or "socks5://host:port"
  username?: string;
  password?: string;
};

const POOL: ProxyConfig[] = loadPool();
let cursor = 0;

function loadPool(): ProxyConfig[] {
  // File source wins if set + readable. We deliberately don't merge —
  // one source of truth avoids accidental duplicates that would skew
  // round-robin distribution.
  const filePath = process.env.WATCHER_PROXIES_FILE?.trim();
  if (filePath) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = parseProxiesEnv(raw);
      if (parsed.length > 0) return parsed;
      // Fall through to env if file existed but had nothing parseable.
    } catch { /* file missing/unreadable — fall through to env */ }
  }
  return parseProxiesEnv(process.env.WATCHER_PROXIES);
}

function parseProxiesEnv(raw: string | undefined): ProxyConfig[] {
  if (!raw) return [];
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseProxyUrl)
    .filter((p): p is ProxyConfig => p !== null);
}

function parseProxyUrl(raw: string): ProxyConfig | null {
  // Accept "http(s)://[user:pass@]host:port" + "socks5://[user:pass@]host:port".
  // Playwright wants `server` as scheme://host:port (no creds in the URL),
  // and creds in separate username/password fields.
  try {
    const u = new URL(raw);
    if (!['http:', 'https:', 'socks5:', 'socks4:'].includes(u.protocol)) return null;
    const out: ProxyConfig = {
      server: `${u.protocol}//${u.host}`,
    };
    if (u.username) out.username = decodeURIComponent(u.username);
    if (u.password) out.password = decodeURIComponent(u.password);
    return out;
  } catch {
    return null;
  }
}

// Round-robin pick. Returns null when the pool is empty (the watcher
// then runs without a proxy — same behavior as before this work).
export function pickProxy(): ProxyConfig | null {
  if (POOL.length === 0) return null;
  const proxy = POOL[cursor % POOL.length];
  cursor = (cursor + 1) % POOL.length;
  return proxy;
}

export function poolSize(): number {
  return POOL.length;
}

// Logging helper — never include the password.
export function describeProxy(p: ProxyConfig | null): string {
  if (!p) return 'direct';
  const usernamePart = p.username ? `${p.username}@` : '';
  return `${p.server.split('://')[0]}://${usernamePart}${p.server.split('://')[1]}`;
}
