import { describe, expect, it } from 'vitest';
import { renderToString } from 'hono/jsx/dom/server';
import type { DigestNight } from '../src/digest/types.js';
import { DigestPage } from '../src/views/digest.js';

function render(digest: DigestNight, night = '2026-10-28'): string {
  return renderToString(<DigestPage night={night} digest={digest} />);
}

describe('DigestPage', () => {
  it('renders sorted rows with every field and highlights retries and failures', () => {
    const html = render({
      rows: [
        {
          job: 'zeta',
          owner: null,
          runs: 4,
          retries: 3,
          lastStatus: 'fail',
          lastError: null,
          firstAt: '2026-10-28T01:00:00+02:00',
          lastAt: '2026-10-28T04:00:00+02:00',
        },
        {
          job: 'alpha',
          owner: 'rook',
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: 'upstream unavailable',
          firstAt: '2026-10-28T00:00:00Z',
          lastAt: '2026-10-28T00:00:00Z',
        },
      ],
      badLines: 2,
      counts: { ok: 1, retry: 3, fail: 1 },
    });

    expect(html.indexOf('alpha')).toBeLessThan(html.indexOf('zeta'));
    expect(html).toContain('<h1>digest 2026-10-28</h1>');
    expect(html).toContain('bad lines: 2');
    expect(html).toContain('owner');
    expect(html).toContain('runs');
    expect(html).toContain('retries');
    expect(html).toContain('last status');
    expect(html).toContain('last error');
    expect(html).toContain('first at');
    expect(html).toContain('last at');
    expect(html).toContain('rook');
    expect(html).toContain('upstream unavailable');
    expect(html).toContain('2026-10-28T00:00:00Z');
    expect(html).toContain('2026-10-28T01:00:00+02:00');
    expect(html).toContain('2026-10-28T04:00:00+02:00');
    expect(html.match(/<td>—<\/td>/g)).toHaveLength(2);
    expect(html).toContain('<td>4</td>');
    expect(html).toContain('<td>1</td>');
    expect(html).toContain('<td class="warn">3</td>');
    expect(html).toContain('<td class="warn">fail</td>');
  });

  it('renders the empty state and keeps malformed-line count visible', () => {
    const html = render({
      rows: [],
      badLines: 1,
      counts: { ok: 0, retry: 0, fail: 0 },
    });

    expect(html).toContain('bad lines: 1');
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table>');
  });

  it('escapes untrusted text in row values', () => {
    const html = render({
      rows: [
        {
          job: '<script>alert("job")</script>',
          owner: '<owner>',
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: '<img src=x onerror=alert(1)>',
          firstAt: '2026-10-28T00:00:00Z',
          lastAt: '2026-10-28T00:00:00Z',
        },
      ],
      badLines: 0,
      counts: { ok: 1, retry: 0, fail: 0 },
    }, '<night>');

    expect(html).toContain('<h1>digest &lt;night&gt;</h1>');
    expect(html).toContain('&lt;script&gt;alert(&quot;job&quot;)&lt;/script&gt;');
    expect(html).toContain('&lt;owner&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
  });
});
