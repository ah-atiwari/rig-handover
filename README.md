# rig

Keeps a lane's lights on while nobody is in it: a heartbeat every minute, a status board, and
a morning digest of what ran overnight.

```sh
cp .env.example .env   # set LANE_MARKER
pnpm install
pnpm dev               # http://localhost:8787
```

Working on it with an agent: start at [AGENTS.md](AGENTS.md).

## Morning digest

- `/digest/2026-10-28` displays the sample night's jobs in job-name order.
- `/api/digest/2026-10-28` returns `{ rows, badLines, counts }` with the same rows.
- The status board links each night with its valid log-event ok / retry / fail counts.
- Missing or invalid nights return 404; empty nights display "nothing ran".
- Malformed log lines are counted without preventing other jobs from rendering.
- Missing owners display as `—`; timestamps retain their original offsets.

Run `pnpm test` and `pnpm typecheck` to validate changes.
Keep `.env` and saved preview HTML out of git. Public previews carry the lane
marker until review arrives; after review and approval, replace the same URL
with a copy generated with `LANE_MARKER` unset (ADR 0003).

## Review preview

`pnpm preview:save` starts a temporary loopback HTTP server, fetches the sample
digest, saves `dist/preview/index.html`, and stops the server. It reads
`LANE_MARKER` from the process environment only, not `.env`. Set the marker
explicitly for the initial review copy. Only after review and separate approval,
leave it unset or empty to replace the same output with a clean copy.

The manual `Digest preview` workflow runs tests and type-checking, then generates
and deploys only `dist/preview` from `main`. HTML and `.env` stay out of git.
After approval, select **Settings > Pages > Source > GitHub Actions**.
The expected URL is https://ah-atiwari.github.io/rig-handover/.

Obtain separate approval before the first publication. Dispatch with the course
marker in `lane_marker`, then send the URL and plan issues to the reviewer.
Wait for review before requesting approval to dispatch with an empty marker.
Do not close the cleanup issue until the clean page is verified at the same URL.
