import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

const exec = promisify(execFile);

it('replaces the same HTML copy with a clean copy without reading .env', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'rig-preview-'));
  try {
    for (const marker of ['PREVIEW-TEST-MARKER', '']) {
      await exec(process.execPath, ['--import', 'tsx', 'scripts/save-preview.ts', outputDir], {
        env: { ...process.env, LANE_MARKER: marker },
      });
      expect(await readdir(outputDir)).toEqual(['index.html']);
      const html = await readFile(join(outputDir, 'index.html'), 'utf8');
      expect(html).toContain('<!doctype html>');
      expect(html).toContain('digest 2026-10-28');
      expect(html).toContain('<style>');
      expect(html).not.toContain('<script');
      expect(html).toContain(marker || 'no marker set');
      if (marker) expect(html).not.toContain('no marker set');
      else expect(html).not.toContain('PREVIEW-TEST-MARKER');
    }
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
