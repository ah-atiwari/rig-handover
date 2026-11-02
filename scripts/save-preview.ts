import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from '../src/app.js';

const outputDir = process.argv[2] ?? 'dist/preview';
const server = serve({ fetch: createApp().fetch, hostname: '127.0.0.1', port: 0 });

try {
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Preview server has no TCP address');
  }

  const response = await fetch(`http://127.0.0.1:${address.port}/digest/2026-10-28`);
  if (!response.ok) throw new Error(`Digest request failed: HTTP ${response.status}`);
  if (!response.headers.get('content-type')?.includes('text/html')) {
    throw new Error('Digest response is not HTML');
  }
  const html = await response.text();
  await mkdir(outputDir, { recursive: true });
  const output = join(outputDir, 'index.html');
  await writeFile(output, html, 'utf8');
  console.log(`Saved sample digest to ${output}`);
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
