import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestNight, DigestRow, ReadNight } from './types.js';

type RunStatus = DigestRow['lastStatus'];

type RunEntry = {
  at: string;
  timestamp: number;
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
};

type MutableRow = {
  row: DigestRow;
  firstTimestamp: number;
  lastTimestamp: number;
  lastErrorTimestamp: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (daysInMonth[month - 1] ?? 0);
}

function isNightDate(night: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(night);
  return match !== null && isCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

function parseRunEntry(value: unknown): RunEntry | null {
  if (!isRecord(value)) return null;

  const record = value;
  if (
    typeof record.at !== 'string' ||
    typeof record.job !== 'string' ||
    record.job.length === 0 ||
    (record.status !== 'ok' && record.status !== 'retry' && record.status !== 'fail') ||
    (typeof record.owner !== 'string' && record.owner !== null) ||
    ('error' in record && typeof record.error !== 'string')
  ) {
    return null;
  }

  const timeMatch =
    /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(
      record.at,
    );
  if (
    timeMatch === null ||
    !isCalendarDate(Number(timeMatch[1]), Number(timeMatch[2]), Number(timeMatch[3]))
  ) {
    return null;
  }

  const timestamp = Date.parse(record.at);
  if (!Number.isFinite(timestamp)) return null;

  return {
    at: record.at,
    timestamp,
    job: record.job,
    status: record.status,
    owner: record.owner,
    error: typeof record.error === 'string' ? record.error : null,
  };
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/** Invalid calendar dates and missing files both return null for route-level 404 handling. */
export const readNight: ReadNight = (runsDir, night): DigestNight | null => {
  if (!isNightDate(night)) return null;

  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error: unknown) {
    if (isMissingFileError(error)) return null;
    throw error;
  }

  const lines = contents.length === 0 ? [] : contents.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();

  const byJob = new Map<string, MutableRow>();
  const counts = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;

  for (const line of lines) {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      badLines += 1;
      continue;
    }

    const entry = parseRunEntry(value);
    if (entry === null) {
      badLines += 1;
      continue;
    }

    counts[entry.status] += 1;
    const current = byJob.get(entry.job);
    if (current === undefined) {
      byJob.set(entry.job, {
        row: {
          job: entry.job,
          owner: entry.owner,
          runs: 1,
          retries: entry.status === 'retry' ? 1 : 0,
          lastStatus: entry.status,
          lastError: entry.error || null,
          firstAt: entry.at,
          lastAt: entry.at,
        },
        firstTimestamp: entry.timestamp,
        lastTimestamp: entry.timestamp,
        lastErrorTimestamp: entry.error ? entry.timestamp : null,
      });
      continue;
    }

    current.row.runs += 1;
    if (entry.status === 'retry') current.row.retries += 1;
    if (entry.timestamp < current.firstTimestamp) {
      current.firstTimestamp = entry.timestamp;
      current.row.firstAt = entry.at;
    }
    if (entry.timestamp >= current.lastTimestamp) {
      current.lastTimestamp = entry.timestamp;
      current.row.lastAt = entry.at;
      current.row.lastStatus = entry.status;
      current.row.owner = entry.owner;
    }
    if (entry.error && (current.lastErrorTimestamp === null || entry.timestamp >= current.lastErrorTimestamp)) {
      current.lastErrorTimestamp = entry.timestamp;
      current.row.lastError = entry.error;
    }
  }

  const rows = [...byJob.values()]
    .map(({ row }) => row)
    .sort((left, right) => (left.job < right.job ? -1 : left.job > right.job ? 1 : 0));

  return { rows, badLines, counts };
};
