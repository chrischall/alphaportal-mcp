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

## Authentication — the refresh token

AlphaPortal's login is reCAPTCHA-gated and can't be automated with a
username/password. Instead this server uses the **refresh token** the web app
stores in your signed-in browser (an 8-day credential); from it, it mints the
short-lived access tokens it needs entirely server-side — **no browser bridge in
the request hot path**. There are two ways it gets that token, tried in order:

1. **Automatic (fetchproxy bootstrap).** If `ALPHAPORTAL_REFRESH_TOKEN` is not
   set, the server reads it once from your signed-in AlphaPortal tab via the
   **Transporter** browser extension (the fetchproxy bridge) — a one-shot read
   that snapshots only the token (a JSON-pointer extraction, so your name/email/
   phone never leave the browser), then closes. Requires the extension installed
   and a signed-in `*.alphaportal.app` tab. Set `ALPHAPORTAL_DISABLE_FETCHPROXY=1`
   to turn this off.
2. **Manual (env var).** Set `ALPHAPORTAL_REFRESH_TOKEN` yourself. Capture it in a
   signed-in tab's DevTools console:
   ```js
   JSON.parse(localStorage.user).User.RefreshToken
   ```
   This is the right path for a headless/hosted deployment with no browser.

Either way, the server persists each rotated refresh token, so the 8-day window
rolls forward as long as you use it at least once every 8 days. If it expires,
sign back in (path 1) or re-capture (path 2). The `alphaportal-fpx` skill under
`skills/` documents the same capture from a shell via the `fpx` CLI.

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
| `ALPHAPORTAL_REFRESH_TOKEN` | The refresh token. Optional if the fetchproxy bridge can read it from a signed-in tab; required for a headless/hosted deployment. |
| `ALPHAPORTAL_DISABLE_FETCHPROXY` | Set to `1` to disable the browser-bridge fallback and require the env var. |
| `ALPHAPORTAL_SESSION_FILE` | Override the store path (default `~/.alphaportal-mcp/session.json`). |

### Hosting on mcp-host

`mint.yaml` describes how to host this server. Note the **egress allowlist**: the
only host the server contacts is `api.alpharoute.app` (every read/write and the
token refresh). On the isolated tier an egress policy is required — allow
`api.alpharoute.app`, or tools report "could not reach the API". A plain hosted
registration has no browser bridge, so set `ALPHAPORTAL_REFRESH_TOKEN` as a
secret there.

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
