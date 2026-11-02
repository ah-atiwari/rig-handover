import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import * as reader from '../src/digest/read.js';
import * as heartbeat from '../src/heartbeat.js';
import { readStatus } from '../src/status.js';

const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: 'runs',
};
const directories: string[] = [];

function createRunsDir(): string {
  const directory = mkdtempSync(join(process.cwd(), 'test', '.digest-board-'));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('digest links on the status board', () => {
  it('keeps readStatus synchronous and counts valid log events, not final jobs', () => {
    const status = readStatus(config);

    expect(status).not.toBeInstanceOf(Promise);
    expect(status.nights).toEqual(['2026-10-28', '2026-10-27']);
    expect(status.nightCounts).toEqual({
      '2026-10-28': { ok: 10, retry: 4, fail: 1 },
      '2026-10-27': { ok: 7, retry: 0, fail: 0 },
    });
  });

  it('renders every fixture night link with its exact event counts, newest first', async () => {
    const response = await createApp(config).request('/');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain(
      '<li><a href="/digest/2026-10-28">2026-10-28</a> · ok 10 / retry 4 / fail 1</li>',
    );
    expect(html).toContain(
      '<li><a href="/digest/2026-10-27">2026-10-27</a> · ok 7 / retry 0 / fail 0</li>',
    );
    expect(html.match(/href="\/digest\//g)).toHaveLength(2);
    expect(html.indexOf('/digest/2026-10-28')).toBeLessThan(html.indexOf('/digest/2026-10-27'));
  });

  it('renders the existing empty directory message without digest links', async () => {
    const emptyConfig = { ...config, runsDir: createRunsDir() };
    const status = readStatus(emptyConfig);
    const response = await createApp(emptyConfig).request('/');
    const html = await response.text();

    expect(status.nights).toEqual([]);
    expect(status.nightCounts).toEqual({});
    expect(response.status).toBe(200);
    expect(html).toContain('<p class="mute">nothing in runs/</p>');
    expect(html).not.toContain('href="/digest/');
  });

  it('shows zero counts for an empty log', async () => {
    const runsDir = createRunsDir();
    writeFileSync(join(runsDir, '2026-10-29.jsonl'), '');

    const response = await createApp({ ...config, runsDir }).request('/');

    expect(response.status).toBe(200);
    expect(await response.text()).toContain(
      '<li><a href="/digest/2026-10-29">2026-10-29</a> · ok 0 / retry 0 / fail 0</li>',
    );
  });

  it('keeps a vanished night linked and explicitly marks its counts unavailable', async () => {
    const runsDir = createRunsDir();
    const file = join(runsDir, '2026-10-29.jsonl');
    writeFileSync(file, '');
    const readNight = reader.readNight;
    vi.spyOn(reader, 'readNight').mockImplementationOnce((directory, night) => {
      rmSync(file);
      return readNight(directory, night);
    });

    const response = await createApp({ ...config, runsDir }).request('/');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain(
      '<li><a href="/digest/2026-10-29">2026-10-29</a> · <span class="warn">counts unavailable —</span></li>',
    );
    expect(html).not.toContain('ok 0 / retry 0 / fail 0');
  });

  it('does not swallow other reader failures', () => {
    const runsDir = createRunsDir();
    mkdirSync(join(runsDir, '2026-10-29.jsonl'));

    expect(() => readStatus({ ...config, runsDir })).toThrow();
  });

  it('preserves adapter, installation and the recorded heartbeat', async () => {
    const beat = { at: '2026-10-29T06:00:00.000Z', pid: 4321, laneId: 'lane-07' };
    vi.spyOn(heartbeat, 'lastBeat').mockReturnValue(beat);
    const status = readStatus(config);
    const response = await createApp(config).request('/');
    const html = await response.text();

    expect(status.adapter).toBe(config.adapter);
    expect(status.installed).toBe(config.installed);
    expect(status.lastBeat).toEqual(beat);
    expect(html).toContain('<tr><th>adapter</th><td>shim</td></tr>');
    expect(html).toContain(`<tr><th>installed</th><td>${config.installed}</td></tr>`);
    expect(html).toContain(`<th>last beat</th><td>${beat.at} · pid ${beat.pid}</td>`);
  });

  it('preserves the missing heartbeat warning', async () => {
    vi.spyOn(heartbeat, 'lastBeat').mockReturnValue(null);

    const response = await createApp(config).request('/');

    expect(readStatus(config).lastBeat).toBeNull();
    expect(await response.text()).toContain('<th>last beat</th><td><span class="warn">none</span></td>');
  });
});
