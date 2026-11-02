import type { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import { readNight } from './read.js';

export function registerDigestApi(app: Hono, config: RigConfig): void {
  app.get('/api/digest/:night', (c) => {
    const digest = readNight(config.runsDir, c.req.param('night'));
    return digest === null ? c.notFound() : c.json(digest);
  });
}
