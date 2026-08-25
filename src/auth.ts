/**
 * The refresh-token exchange — the one place a credential is minted.
 *
 * AlphaPortal's `public/login` is reCAPTCHA-gated and cannot be driven
 * server-side, so username/password login is off the table. What CAN be driven
 * is the token refresh: the SPA stores a long-lived **refresh token** (an 8-day
 * JWT) in the signed-in browser's `localStorage`, and posting it to
 * `public/refresh-token` returns a fresh 30-minute **access token** — with no
 * reCAPTCHA and no MFA. So the durable credential this server needs is that
 * refresh token, captured once from the browser (see the skill / README).
 *
 * Live-verified 2026-08-25: the refresh token is **stateless and reusable** —
 * the server validates the JWT signature + expiry and does not track
 * consumption, so an already-used refresh token keeps working until its own
 * `exp`. Every refresh also issues a NEW 8-day refresh token, which the caller
 * persists to roll the window forward (see `session.ts`).
 */

import { decodeJwtExp } from '@chrischall/mcp-utils';
import { BASE_URL, REFRESH_PATH } from './endpoints.js';

/** The subset of the refresh response this server relies on. */
export interface RefreshResult {
  /** A fresh 30-minute access token (JWT). */
  token: string;
  /** A fresh 8-day refresh token (JWT) — rotate the stored one to this. */
  refreshToken: string;
  /** The account's UI language, echoed back. */
  lang?: string;
}

/** Injectable fetch, so the exchange is unit-testable without real network. */
export type FetchLike = typeof fetch;

/**
 * Exchange a refresh token for a fresh token pair.
 *
 * Throws a plain `Error` on a non-2xx or malformed response; the caller
 * (`TokenManager.refresh`) surfaces it, and the tool boundary redacts it. The
 * error message never echoes the token — only its shape-less failure reason.
 */
export async function refreshAccessToken(
  refreshToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<RefreshResult> {
  const url = `${BASE_URL}/${REFRESH_PATH}`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  } catch (err) {
    // Surface the underlying cause (DNS/TLS/proxy code, or an undici "Illegal
    // invocation" from a mis-bound fetch) and the exact endpoint, so a
    // reachability problem is diagnosable rather than opaque.
    const e = err as Error & { cause?: { code?: string; message?: string } };
    const cause = e.cause?.code ?? e.cause?.message ?? e.message;
    throw new Error(`AlphaPortal token refresh could not reach ${url}: ${cause}`);
  }

  const text = await res.text();
  if (!res.ok) {
    // 401 here means the refresh token is expired or invalid — the user must
    // re-capture it from a signed-in browser tab.
    throw new Error(
      res.status === 401
        ? 'AlphaPortal refresh token is expired or invalid — re-capture it from a signed-in ' +
          'cmsnc.alphaportal.app tab (see README) and update ALPHAPORTAL_REFRESH_TOKEN.'
        : `AlphaPortal token refresh failed (HTTP ${res.status}).`,
    );
  }

  let parsed: { success?: boolean; data?: Partial<RefreshResult>; message?: string };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('AlphaPortal token refresh returned a non-JSON body.');
  }

  const token = parsed.data?.token;
  const nextRefresh = parsed.data?.refreshToken;
  if (!token || !nextRefresh) {
    throw new Error('AlphaPortal token refresh response was missing the token pair.');
  }
  return { token, refreshToken: nextRefresh, lang: parsed.data?.lang };
}

/**
 * A refresh token's expiry as epoch **milliseconds**, or `0` if it can't be
 * decoded. Used to pick the freshest of the env-supplied vs. persisted tokens
 * (a re-capture should win over a rolled-forward store entry, and vice versa).
 * `decodeJwtExp` returns seconds and throws on a malformed token; we swallow to
 * `0` so a bad candidate simply loses the comparison.
 */
export function refreshTokenExpiryMs(refreshToken: string): number {
  try {
    return decodeJwtExp(refreshToken) * 1000;
  } catch {
    return 0;
  }
}
