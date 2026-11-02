import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';
import { registerDigestApi } from '../src/digest/api.js';
import type { DigestNight } from '../src/digest/types.js';

const temporaryDirs: string[] = [];

function createApp(runsDir: string): Hono {
  const app = new Hono();
  registerDigestApi(app, {
    adapter: 'test',
    installed: 'test',
    beatEverySeconds: 60,
    runsDir,
  });
  return app;
}

function createRunsDir(): string {
  const directory = mkdtempSync(join(process.cwd(), 'test', '.digest-api-runs-'));
  temporaryDirs.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('registerDigestApi', () => {
  it('returns the complete reader digest as JSON', async () => {
    const runsDir = createRunsDir();
    writeFileSync(
      join(runsDir, '2026-10-28.jsonl'),
      [
        JSON.stringify({
          at: '2026-10-28T02:00:00Z',
          job: 'zeta',
          status: 'retry',
          owner: null,
          error: 'temporary',
        }),
        JSON.stringify({
          at: '2026-10-28T01:00:00Z',
          job: 'alpha',
          status: 'ok',
          owner: 'rook',
        }),
        '{bad json}',
      ].join('\n'),
    );

    const response = await createApp(runsDir).request('/api/digest/2026-10-28');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({
      rows: [
        {
          job: 'alpha',
          owner: 'rook',
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-28T01:00:00Z',
          lastAt: '2026-10-28T01:00:00Z',
        },
        {
          job: 'zeta',
          owner: null,
          runs: 1,
          retries: 1,
          lastStatus: 'retry',
          lastError: 'temporary',
          firstAt: '2026-10-28T02:00:00Z',
          lastAt: '2026-10-28T02:00:00Z',
        },
      ],
      badLines: 1,
      counts: { ok: 1, retry: 1, fail: 0 },
    } satisfies DigestNight);
  });

  it('returns 404 for a missing night', async () => {
    const response = await createApp(createRunsDir()).request('/api/digest/2026-10-29');

    expect(response.status).toBe(404);
  });

  it('returns 404 for an invalid calendar date', async () => {
    const response = await createApp(createRunsDir()).request('/api/digest/2026-02-29');

    expect(response.status).toBe(404);
  });

  it('returns the empty digest for an empty night file', async () => {
    const runsDir = createRunsDir();
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), '');

    const response = await createApp(runsDir).request('/api/digest/2026-10-28');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    } satisfies DigestNight);
  });
});
