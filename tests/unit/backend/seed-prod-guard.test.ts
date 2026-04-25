import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// SEC-038 — `backend/prisma/seed.ts` was wired into the production
// container CMD and reseeded six demo accounts (with passwords that
// live in the public source tree) on every deploy. Anyone reading the
// repo could log in to estia.co.il directly.
//
// The fix gates the seed script itself: when NODE_ENV=production we
// refuse to run unless ESTIA_ALLOW_SEED=1 is also set, so a future
// CMD regression can't quietly re-introduce the leak.
//
// These tests exercise the guard end-to-end by spawning the script
// itself with a fake DATABASE_URL — the guard fires before any DB
// connection is opened, so we never hit a real database.

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const backendCwd = path.join(repoRoot, 'backend');

const FAKE_DB = 'postgres://nope:nope@127.0.0.1:1/nope';
const GUARD_KEY = 'ESTIA_ALLOW_SEED';
const GUARD_MSG = 'refusing to run in production without ESTIA_ALLOW_SEED=1';

type RunResult = { code: number | null; stdout: string; stderr: string };

function runSeed(extraEnv: Record<string, string>): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'npx',
      ['tsx', 'prisma/seed.ts'],
      {
        cwd: backendCwd,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          DATABASE_URL: FAKE_DB,
          ...extraEnv,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

describe('SEC-038 — seed script production guard', () => {
  it('refuses to run when NODE_ENV=production and ESTIA_ALLOW_SEED is unset', async () => {
    const r = await runSeed({});
    // Non-zero exit — script should not have proceeded.
    expect(r.code).not.toBe(0);
    // Stderr names the env opt-in so an operator running it manually
    // can self-serve the unblock.
    expect(r.stderr).toContain(GUARD_KEY);
    expect(r.stderr).toContain(GUARD_MSG);
  }, 30_000);

  it('does not print the guard message when ESTIA_ALLOW_SEED=1 (script gets past the guard)', async () => {
    const r = await runSeed({ ESTIA_ALLOW_SEED: '1' });
    // The script will still fail later — DATABASE_URL points to a
    // closed port, so Prisma will refuse to connect — but the guard
    // itself must not be the thing that aborted us. So the guard
    // message must be absent from stderr.
    expect(r.stderr).not.toContain(GUARD_MSG);
  }, 30_000);
});
