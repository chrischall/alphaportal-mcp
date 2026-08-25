# alphaportal-mcp

An MCP server for **AlphaPortal** (AlphaRoute), the parent/guardian school-bus
transportation portal used by districts such as Charlotte-Mecklenburg Schools
(`cmsnc.alphaportal.app`). Ask Claude where your child's bus is, what stops they
have, and what arrival notifications came in — and (confirm-gated) adjust
notification preferences and walk-zone radius.

> Developed and maintained by AI. Use at your own discretion.

## What it can do

**Reads** (all live-verified against the real API):

- `alphaportal_list_students` — your children, with grade, school, and transport flags
- `alphaportal_get_student` — a child's school plus morning/afternoon stops
- `alphaportal_get_student_stops` — assigned stops with times and locations
- `alphaportal_get_bus_location` — **live GPS of the bus** for the AM or PM run
- `alphaportal_list_notifications` — arrival/departure alerts
- `alphaportal_list_requests` — submitted transportation requests + tracking numbers
- `alphaportal_get_report_link` — a PDF report download link
- `alphaportal_list_schools`, `alphaportal_list_grades` — district reference data
- `alphaportal_get_profile`, `alphaportal_get_account`, `alphaportal_get_settings`
- `alphaportal_session_status` — is a working session configured (no secrets returned)

**Writes** (confirm-gated — a dry-run of the exact payload unless `confirm: true`):

- `alphaportal_edit_walk_radius` — set a student's walk-zone radius (meters)
- `alphaportal_set_notification` — set per-student push/email notification preferences

## Authentication — capture the refresh token once

AlphaPortal's login is reCAPTCHA-gated and can't be automated with a
username/password. Instead this server uses the **refresh token** the web app
stores in your signed-in browser (an 8-day credential); from it, it mints the
short-lived access tokens it needs entirely server-side — **no browser
extension or bridge at runtime**.

Capture it once:

1. Sign in at `https://cmsnc.alphaportal.app/` (or your district's AlphaPortal host).
2. Open DevTools → Console and run:
   ```js
   JSON.parse(localStorage.user).User.RefreshToken
   ```
3. Copy the value into `ALPHAPORTAL_REFRESH_TOKEN` (see below).

The server persists each rotated refresh token, so the 8-day window rolls
forward as long as you use it at least once every 8 days. If it expires, repeat
the capture. (The `alphaportal-fpx` skill under `skills/` documents an
alternative one-line capture via the `fpx` browser bridge, if you have it.)

## Setup

```sh
npm install
npm run build
echo 'ALPHAPORTAL_REFRESH_TOKEN=<paste the token>' > .env
node dist/index.js   # or wire it into your MCP host
```

`.env` is gitignored. For an MCP host, set `ALPHAPORTAL_REFRESH_TOKEN` in its env
block (`.mcp.json` / mcpb user config both reference it).

### Optional environment variables

| Variable | Purpose |
| --- | --- |
| `ALPHAPORTAL_REFRESH_TOKEN` | The captured refresh token (required). |
| `ALPHAPORTAL_SESSION_FILE` | Override the store path (default `~/.alphaportal-mcp/session.json`). |

## Development

```sh
npm test          # vitest (mocked network)
npm run typecheck # tsc --noEmit (a green vitest run is not a green typecheck)
npm run build     # tsc + esbuild bundle
```

API shapes are pinned in [`docs/ALPHAPORTAL-API.md`](docs/ALPHAPORTAL-API.md).

## Notes & limitations

- The transportation-**request** submission flow (`requests/transportation/add`,
  `.../alternative/add`) is intentionally not exposed yet — its nested request
  body was not fully captured, and shipping a guessed write payload that submits
  a real request to the district would be irresponsible. See the docs.
- Every request rides your own AlphaPortal session (the refresh token you
  captured); the server only ever reads your account's data.
