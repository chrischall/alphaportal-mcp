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
- `alphaportal_healthcheck` — which hop is broken: no refresh token resolved, AlphaPortal rejected it, a CDN/WAF blocked the request, or the API is down (no secrets returned)

**Writes** (each asks you to confirm first — a confirmation prompt where the
client supports one; otherwise the first call returns a preview of the exact
payload plus a `confirmToken`, and only a repeat call with that token proceeds;
see [Confirmations](#confirmations)):

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
   **ContextMint Bridge** browser extension (formerly the fetchproxy extension) — a one-shot
   read that snapshots only the token (a JSON-pointer extraction, so your name/
   email/phone never leave the browser), then closes. Requires the extension
   installed and a signed-in `*.alphaportal.app` tab. Get ContextMint Bridge from
   its [releases page](https://github.com/nullnet-app/contextmint-bridge/releases):
   in Chrome, unzip the chrome build and load it unpacked
   (`chrome://extensions` → Developer mode → Load unpacked). Safari isn't
   available yet (it will ship inside the ContextMint app, which has no public
   download), so use Chrome for now. ContextMint Bridge is the fetchproxy
   browser extension under its new name, from the same maintainer —
   fetchproxy's own [README](https://github.com/chrischall/fetchproxy#extension)
   points to it. Its source is public at
   https://github.com/nullnet-app/contextmint-bridge: build it yourself, or check
   a release zip against the `.sha256` file published beside it
   (`shasum -a 256 -c contextmint-bridge-chrome-<version>.zip.sha256`).
   Set `ALPHAPORTAL_DISABLE_FETCHPROXY=1` to turn this off.
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

### Keeping the stored token safe

The saved session (`~/.alphaportal-mcp/session.json`, or
`ALPHAPORTAL_SESSION_FILE`) holds the refresh token in **plaintext** JSON — the
file is `0600` in a `0700` directory, but it is not in an OS keychain. Treat it
like a password:

- **Anyone who copies it once can keep refreshing indefinitely.** AlphaPortal
  validates the token statelessly (signature + expiry), so a used token keeps
  working until it expires, and every refresh mints a new 8-day one. A copy —
  from a backup, a synced home directory, or another process running as you —
  gives ongoing access to your children's names, schools, home stop locations
  and live bus GPS.
- **You cannot revoke it from here.** Deleting the file stops *this* server
  using it, not a copy, which stays valid until it expires. Whether an
  AlphaPortal password change invalidates outstanding tokens is unverified;
  if you suspect a copy leaked, change your password and ask the district to
  reset your portal account.
- Keep `~/.alphaportal-mcp/` out of cloud-synced folders and unencrypted
  backups, and delete it when you stop using the server.

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
| `ALPHAPORTAL_REFRESH_TOKEN` | The refresh token. Optional if ContextMint Bridge can read it from a signed-in tab; required for a headless/hosted deployment. |
| `ALPHAPORTAL_DISABLE_FETCHPROXY` | Set to `1` to disable the browser-bridge fallback and require the env var. |
| `ALPHAPORTAL_SESSION_FILE` | Override the store path (default `~/.alphaportal-mcp/session.json`). |

### Confirmations

| Variable | Default | Purpose |
| --- | --- | --- |
| `MCP_CONFIRM_MODE` | `ask-user` | What a write does on a client that cannot show a confirmation prompt (claude.ai, Claude Desktop). `ask-user`: two steps — the first call does nothing and returns a preview plus a token, and the model must get your approval in chat before calling again with it. `auto`: the same two steps, but the model may use the token after reviewing the preview itself. `refuse`: writes are refused on such clients. A client that can show prompts (Claude Code) always gets the real prompt, unless `MCP_CONFIRM_ELICITATION=off`. An unrecognised value is treated as `refuse`. |
| `MCP_CONFIRM_ELICITATION` | `on` | `off` never shows a confirmation prompt, so every client gets the `MCP_CONFIRM_MODE` path. Set it for a client that claims to support prompts but never shows one (the write hangs — opencode 2.0.x). Any other value stays `on`, with a warning on stderr. |
| `MCP_CONFIRM_TTL_SECONDS` | `600` | How long a token stays valid. |
| `MCP_CONFIRM_SECRET` | random per process | Signing key; set it only if tokens must survive a server restart. |

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
