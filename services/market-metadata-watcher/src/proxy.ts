// Residential proxy pool. Each tick picks a proxy and uses it for the
// entire BrowserContext (warmup + every region fetch). Per-tick rotation
// keeps a single proxy from getting flagged after sustained scraping;
// combined with our existing fingerprint rotation, every tick presents
// to Reblaze as a fresh visitor (new IP + new UA + new cookies if
// warmup re-challenged).
//
// Configuration:
//   WATCHER_PROXIES — newline-or-comma-separated list of proxy URLs.
//   Each entry must be a full URL with scheme + creds + host + port:
//     http://USER:PASS@HOST:PORT
//     https://USER:PASS@HOST:PORT
//     socks5://USER:PASS@HOST:PORT
//
// Example .env:
//   WATCHER_PROXIES=http://user:pass@1.2.3.4:8080,http://user:pass@5.6.7.8:8080
//
// (newlines also OK — useful for `docker compose -e` heredocs)
//
// Selection strategy: round-robin per tick (modular index in module
// scope). Process restart resets the cursor; that's fine because
// fingerprint rotation already randomizes per tick.

export type ProxyConfig = {
  server: string;       // "http://host:port" or "socks5://host:port"
  username?: string;
  password?: string;
};

const POOL: ProxyConfig[] = parseProxiesEnv(process.env.WATCHER_PROXIES);
let cursor = 0;

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
