/**
 * fetchproxy bootstrap — lift the refresh token out of a signed-in browser tab.
 *
 * When no `ALPHAPORTAL_REFRESH_TOKEN` is configured, rather than failing, the
 * server reads it once from the user's signed-in AlphaPortal tab via the
 * fetchproxy browser bridge (the Transporter extension). This is a ONE-SHOT
 * read: the bridge snapshots the token and closes; every actual API call still
 * goes out via plain Node `fetch` (see `client.ts`). fetchproxy is never in the
 * request hot path.
 *
 * Privacy: `localStorage.user` is a ~500-byte object holding the user's name,
 * email and phone. We do NOT copy that blob across the bridge — a JSON-pointer
 * extraction (`/User/RefreshToken`) keeps the object in the browser and returns
 * only the token, exactly the honeybook-mcp pattern. The extension popup shows
 * the pointer path verbatim so the user sees precisely what is read.
 *
 * `@fetchproxy/bootstrap` is imported lazily so the default (env-token) path
 * never loads the bridge machinery, and module-init stays pure for sandboxed
 * runtimes.
 */

import { parseBoolEnv } from '@chrischall/mcp-utils';
import { VERSION } from './version.js';

/** The apex domain; the extension matches on suffix, covering every district subdomain (e.g. `cmsnc.alphaportal.app`). */
export const BOOTSTRAP_DOMAIN = 'alphaportal.app';

/** localStorage key and the pointer to the refresh token inside it. */
const STORAGE_KEY = 'user';
const REFRESH_POINTER = '/User/RefreshToken';
const OUTPUT_KEY = 'ALPHAPORTAL_REFRESH_TOKEN';

/** The minimal shape of `@fetchproxy/bootstrap`'s `Session` this module reads. */
interface BootstrapSession {
  localStorage: Record<string, string>;
  missing?: { localStorage: string[] };
}

/** Injectable bootstrap fn (real one is `@fetchproxy/bootstrap`'s `bootstrap`). */
export type BootstrapFn = (opts: unknown) => Promise<BootstrapSession>;

/** Raised when the bridge could not supply a token; `.hint` is actionable copy. */
export class BootstrapError extends Error {
  readonly hint?: string;
  constructor(message: string, hint?: string) {
    super(message);
    this.name = 'BootstrapError';
    this.hint = hint;
  }
}

/** True when the user has explicitly disabled the fetchproxy fallback. */
export function bootstrapDisabled(): boolean {
  return parseBoolEnv('ALPHAPORTAL_DISABLE_FETCHPROXY', { default: false });
}

/**
 * Read the refresh token from a signed-in AlphaPortal tab via the bridge.
 * Returns the token, or throws a {@link BootstrapError} the caller renders.
 * `bootstrapImpl` is injectable so tests never touch a real bridge.
 */
export async function bootstrapRefreshToken(bootstrapImpl?: BootstrapFn): Promise<string> {
  const bootstrap: BootstrapFn =
    bootstrapImpl ?? ((await import('@fetchproxy/bootstrap')).bootstrap as unknown as BootstrapFn);

  let session: BootstrapSession;
  try {
    session = await bootstrap({
      serverName: 'alphaportal-mcp',
      version: VERSION,
      domains: [BOOTSTRAP_DOMAIN],
      declare: {
        cookies: [],
        localStorage: [],
        sessionStorage: [],
        captureHeaders: [],
        // Extract ONLY the refresh token; the user blob stays in the browser.
        localStoragePointers: [
          { outputKey: OUTPUT_KEY, storageKey: STORAGE_KEY, jsonPointer: REFRESH_POINTER },
        ],
      },
    });
  } catch (err) {
    // A bridge-down / no-tab / scope error carries its own actionable `.hint`
    // (from @fetchproxy/server's FetchproxyHintedError family). Surface it
    // verbatim rather than burying it under our own copy.
    const hinted = err as { hint?: string; message?: string };
    throw new BootstrapError(
      `AlphaPortal browser bootstrap failed: ${hinted.message ?? String(err)}`,
      hinted.hint,
    );
  }

  const token = session.localStorage[OUTPUT_KEY];
  if (!token) {
    // `missing` reports DECLARED storage keys the browser did not return, so it
    // separates two failures that otherwise look identical. The key itself
    // absent means there is no signed-in session to read; the key present but
    // the pointer unresolved means the app's storage shape changed.
    const keyMissing = session.missing?.localStorage?.includes(STORAGE_KEY) ?? false;
    throw new BootstrapError(
      keyMissing
        ? `The AlphaPortal tab has no "${STORAGE_KEY}" in localStorage — it does not look signed in.`
        : `The AlphaPortal tab returned "${STORAGE_KEY}" but ${REFRESH_POINTER} did not resolve — the app's stored session shape may have changed.`,
      keyMissing
        ? 'Open and sign into your AlphaPortal host (e.g. https://cmsnc.alphaportal.app/) in the browser with the Transporter extension, then retry.'
        : `Check the value in that tab's console: JSON.parse(localStorage.user).User.RefreshToken — and set ALPHAPORTAL_REFRESH_TOKEN manually if the shape has moved.`,
    );
  }
  return token;
}
