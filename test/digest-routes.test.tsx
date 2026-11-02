import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';
import type { DigestNight } from '../src/digest/types.js';

const temporaryDirs: string[] = [];

function createRunsDir(): string {
  const directory = mkdtempSync(join(process.cwd(), 'test', '.digest-route-runs-'));
  temporaryDirs.push(directory);
  return directory;
}

function createConfig(runsDir: string): RigConfig {
  return {
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  };
}

function writeNight(runsDir: string, night: string, lines: string[]): void {
  writeFileSync(join(runsDir, `${night}.jsonl`), lines.join('\n'));
}

afterEach(() => {
  for (const directory of temporaryDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('digest routes', () => {
  it('renders sorted rows consistently with the JSON API', async () => {
    const runsDir = createRunsDir();
    writeNight(runsDir, '2026-10-28', [
      JSON.stringify({
        at: '2026-10-28T03:00:00+05:30',
        job: 'z-failed',
        status: 'fail',
        owner: null,
        error: 'quota exceeded',
      }),
      JSON.stringify({
        at: '2026-10-28T01:00:00+05:30',
        job: 'm-retried',
        status: 'retry',
        owner: 'rook',
        error: 'first retry',
      }),
      JSON.stringify({
        at: '2026-10-28T02:00:00+05:30',
        job: 'm-retried',
        status: 'retry',
        owner: 'rook',
        error: 'second retry',
      }),
      JSON.stringify({
        at: '2026-10-28T02:30:00+05:30',
        job: 'm-retried',
        status: 'retry',
        owner: 'rook',
        error: 'third retry',
      }),
      JSON.stringify({
        at: '2026-10-28T04:00:00+05:30',
        job: 'm-retried',
        status: 'ok',
        owner: 'rook',
      }),
      JSON.stringify({
        at: '2026-10-28T00:00:00+05:30',
        job: 'a-unowned',
        status: 'ok',
        owner: null,
      }),
      '{malformed json',
    ]);

    const app = createApp(createConfig(runsDir));
    const pageResponse = await app.request('/digest/2026-10-28');
    const html = await pageResponse.text();
    const apiResponse = await app.request('/api/digest/2026-10-28');

    expect(pageResponse.status).toBe(200);
    expect(apiResponse.status).toBe(200);
    const digest = (await apiResponse.json()) as DigestNight;
    expect(digest).toEqual({
      rows: [
        {
          job: 'a-unowned',
          owner: null,
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-28T00:00:00+05:30',
          lastAt: '2026-10-28T00:00:00+05:30',
        },
        {
          job: 'm-retried',
          owner: 'rook',
          runs: 4,
          retries: 3,
          lastStatus: 'ok',
          lastError: 'third retry',
          firstAt: '2026-10-28T01:00:00+05:30',
          lastAt: '2026-10-28T04:00:00+05:30',
        },
        {
          job: 'z-failed',
          owner: null,
          runs: 1,
          retries: 0,
          lastStatus: 'fail',
          lastError: 'quota exceeded',
          firstAt: '2026-10-28T03:00:00+05:30',
          lastAt: '2026-10-28T03:00:00+05:30',
        },
      ],
      badLines: 1,
      counts: { ok: 2, retry: 3, fail: 1 },
    });

    const jobOrder = ['a-unowned', 'm-retried', 'z-failed'];
    const htmlJobPositions = jobOrder.map((job) => html.indexOf(job));
    expect(htmlJobPositions.every((position) => position >= 0)).toBe(true);
    expect(htmlJobPositions).toEqual([...htmlJobPositions].sort((a, b) => a - b));
    expect(digest.rows.map(({ job }) => job)).toEqual(jobOrder);
    expect(html).toContain('—');
    expect(html).toContain('2026-10-28T00:00:00+05:30');
    expect(html).toContain('2026-10-28T04:00:00+05:30');
    expect(html).toContain('third retry');
    expect(html).toContain('quota exceeded');
    const htmlRows = [...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)].map(([row]) => row);
    const retriedRow = htmlRows.find((row) => row.includes('m-retried'));
    const failedRow = htmlRows.find((row) => row.includes('z-failed'));
    expect(retriedRow).toContain('class="warn"');
    expect(failedRow).toContain('class="warn"');
  });

  it('returns 404 for missing nights from both routes', async () => {
    const app = createApp(createConfig(createRunsDir()));

    expect((await app.request('/digest/2026-10-29')).status).toBe(404);
    expect((await app.request('/api/digest/2026-10-29')).status).toBe(404);
  });

  it('shows an empty night and returns no rows in JSON', async () => {
    const runsDir = createRunsDir();
    writeNight(runsDir, '2026-10-28', []);
    const app = createApp(createConfig(runsDir));

    const pageResponse = await app.request('/digest/2026-10-28');
    const apiResponse = await app.request('/api/digest/2026-10-28');

    expect(pageResponse.status).toBe(200);
    expect(await pageResponse.text()).toContain('nothing ran');
    expect(apiResponse.status).toBe(200);
    expect(await apiResponse.json()).toEqual({
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('counts malformed lines without dropping valid rows', async () => {
    const runsDir = createRunsDir();
    writeNight(runsDir, '2026-10-28', [
      '{not json}',
      JSON.stringify({
        at: '2026-10-28T01:00:00Z',
        job: 'valid-job',
        status: 'ok',
        owner: 'rook',
      }),
      JSON.stringify({
        at: '2026-10-28T02:00:00Z',
        job: 'invalid-status',
        status: 'unknown',
        owner: null,
      }),
    ]);
    const app = createApp(createConfig(runsDir));

    const pageResponse = await app.request('/digest/2026-10-28');
    const html = await pageResponse.text();
    const apiResponse = await app.request('/api/digest/2026-10-28');

    expect(pageResponse.status).toBe(200);
    expect(apiResponse.status).toBe(200);
    const digest = (await apiResponse.json()) as DigestNight;
    expect(digest.rows.map(({ job }) => job)).toEqual(['valid-job']);
    expect(digest.badLines).toBe(2);
    expect(digest.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
    expect(html).toContain('valid-job');
    expect(html).toMatch(/bad lines?[^<\d]*2|2[^<]*bad lines?/i);
  });

  it('returns 404 for invalid calendar dates and traversal-like night values', async () => {
    const app = createApp(createConfig(createRunsDir()));
    const invalidNights = [
      '2026-02-30',
      '..%2f2026-10-28',
      '2026-10-28%2f..%2f2026-10-28',
    ];

    for (const night of invalidNights) {
      expect((await app.request(`/digest/${night}`)).status).toBe(404);
      expect((await app.request(`/api/digest/${night}`)).status).toBe(404);
    }
  });
});
