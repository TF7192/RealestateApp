import type { FastifyInstance } from 'fastify';

/**
 * Login via the real auth endpoint and return a Cookie header the caller
 * can attach to subsequent inject() calls. This runs the real password-
 * verify + JWT-sign flow — so if auth changes, the helper keeps working
 * or the tests surface the break immediately.
 */
export async function loginAs(
  app: FastifyInstance,
  email: string,
  password: string
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
  });
  if (res.statusCode !== 200) {
    throw new Error(
      `loginAs(${email}) failed with ${res.statusCode}: ${res.body}`
    );
  }
  // Fastify sets Set-Cookie as an array of header strings. Collapse to
  // the client-side Cookie header shape: `k=v; k=v; ...`.
  const setCookie = res.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie].filter(Boolean);
  return cookies
    .map((c) => String(c).split(';')[0])
    .filter(Boolean)
    .join('; ');
}

/** Small convenience: build auth headers for subsequent inject() calls. */
export function authHeaders(cookie: string) {
  return { cookie };
}
