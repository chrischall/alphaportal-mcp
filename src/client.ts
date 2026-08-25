/**
 * `AlphaPortalClient` — the one place that talks to the AlphaRoute API.
 *
 * Design rules (each earns its keep):
 *
 *  - **Pure, non-throwing constructor.** It never does I/O and never throws, so
 *    the server boots and answers the host's install-time `tools/list` probe
 *    with no credentials configured, and module-init stays sandbox-safe (no
 *    fetch/timers/randomness). All auth resolution is deferred to the first
 *    tool call by {@link ensureApi}.
 *  - **One read path, one write path.** Every read goes through {@link read}
 *    and every mutation through {@link write}, so bearer auth, the reactive
 *    401-replay and the `{success,data,message}` envelope handling can never
 *    drift between endpoints.
 *  - **Refresh-token as the credential, resolved lazily.** On first use the
 *    refresh token is resolved as the freshest of an injected value,
 *    `ALPHAPORTAL_REFRESH_TOKEN`, and the persisted store — and, when none is
 *    present, lifted from a signed-in browser tab via the fetchproxy bridge
 *    ({@link bootstrapRefreshToken}) instead of failing. A `TokenManager` then
 *    mints 30-minute access tokens from it and persists each rotated refresh
 *    token so the 8-day window rolls forward.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  McpToolError,
  buildQueryString,
  createApiClient,
  loadDotenvSafely,
  readEnvVar,
  type ApiClient,
} from '@chrischall/mcp-utils';
import { TokenManager } from '@chrischall/mcp-utils/session';
import { refreshAccessToken, refreshTokenExpiryMs, type FetchLike } from './auth.js';
import { BootstrapError, bootstrapDisabled, bootstrapRefreshToken, type BootstrapFn } from './bootstrap.js';
import { BASE_URL } from './endpoints.js';
import { DEFAULT_ACCOUNT_KEY, diskSessionIO, type SessionIO } from './session.js';

// Load `.env` for local dev. The try/catch guards a non-Node runtime where
// `import.meta.url` is undefined and `fileURLToPath(undefined)` would throw at
// module init — there is no filesystem or `.env` there anyway.
try {
  await loadDotenvSafely({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });
} catch {
  /* non-Node runtime: no .env to load */
}

/** The API envelope. Some legacy endpoints order the keys `{message,data,success}`. */
export interface Envelope<T> {
  success?: boolean;
  data?: T;
  message?: string;
  developerMessage?: string[];
}

const SERVICE = 'AlphaPortal';

/**
 * Receiver-safe default fetch. Storing the bare global `fetch` and later
 * calling it as `this.fetchImpl(...)` invokes it with `this` bound to the
 * client instance; older undici (Node 18–20, as bundled by some MCP hosts)
 * throws `TypeError: Illegal invocation` for any receiver that isn't
 * `globalThis`. Wrapping it in an arrow makes every call a bare `fetch(...)`,
 * which is correct on every runtime. (Node 26 tolerates the wrong receiver, so
 * this bug is invisible in local dev and only bites a user on an older host.)
 */
const defaultFetch: FetchLike = (input, init) => fetch(input as string | URL | Request, init);

export interface AlphaPortalClientOptions {
  /** Injected refresh token (hosted per-user path); overrides env + store when fresher. */
  refreshToken?: string;
  /** Storage seam for the rotating refresh token (defaults to disk). */
  sessionIO?: SessionIO;
  /** Injected fetch, for tests. */
  fetchImpl?: FetchLike;
  /** Injected fetchproxy bootstrap, for tests (real one lifts from the browser). */
  bootstrapImpl?: BootstrapFn;
  /** Logical account key (single-account default). */
  accountId?: string;
}

/** How the current session's refresh token was obtained (diagnostics only). */
export type AuthSource = 'env-or-store' | 'browser-bootstrap';

export class AlphaPortalClient {
  private readonly opts: AlphaPortalClientOptions;
  private readonly accountId: string;
  private readonly sessionIO: SessionIO;
  private readonly fetchImpl: FetchLike;

  /** Single-flight auth setup; resolves to the ready API client. */
  private apiPromise: Promise<ApiClient> | undefined;
  private authSource: AuthSource | undefined;

  constructor(opts: AlphaPortalClientOptions = {}) {
    this.opts = opts;
    this.accountId = opts.accountId ?? DEFAULT_ACCOUNT_KEY;
    this.sessionIO = opts.sessionIO ?? diskSessionIO;
    this.fetchImpl = opts.fetchImpl ?? defaultFetch;
  }

  /** True when a refresh token is available WITHOUT the browser bridge (env or store). */
  hasStaticToken(): boolean {
    return this.resolveStaticRefreshToken() !== null;
  }

  /** How the last-resolved token was obtained, or undefined before first use. */
  currentAuthSource(): AuthSource | undefined {
    return this.authSource;
  }

  /** Pick the freshest refresh token among injected / env / persisted store (no bridge). */
  private resolveStaticRefreshToken(): string | null {
    const candidates = [
      this.opts.refreshToken,
      readEnvVar('ALPHAPORTAL_REFRESH_TOKEN'),
      this.sessionIO.load(this.accountId) ?? undefined,
    ].filter((t): t is string => typeof t === 'string' && t.length > 0);
    if (candidates.length === 0) return null;
    return candidates.reduce((best, cur) =>
      refreshTokenExpiryMs(cur) > refreshTokenExpiryMs(best) ? cur : best,
    );
  }

  /** Resolve the refresh token, falling back to the browser bridge, then a helpful error. */
  private async resolveRefreshToken(): Promise<{ token: string; source: AuthSource }> {
    const staticToken = this.resolveStaticRefreshToken();
    if (staticToken) return { token: staticToken, source: 'env-or-store' };

    if (bootstrapDisabled()) throw this.noCredentialsError();

    try {
      const token = await bootstrapRefreshToken(this.opts.bootstrapImpl);
      // Persist so subsequent runs skip the bridge and the window rolls forward.
      this.sessionIO.save(this.accountId, token);
      return { token, source: 'browser-bootstrap' };
    } catch (err) {
      throw this.noCredentialsError(err instanceof BootstrapError ? err : undefined);
    }
  }

  /** The actionable "no credentials" error, naming both onboarding paths. */
  private noCredentialsError(bootstrapErr?: BootstrapError): McpToolError {
    const bridgeLine = bootstrapDisabled()
      ? 'The browser bridge is disabled (ALPHAPORTAL_DISABLE_FETCHPROXY is set).'
      : bootstrapErr
        ? `The browser bridge could not read it: ${bootstrapErr.message}${bootstrapErr.hint ? ` ${bootstrapErr.hint}` : ''}`
        : 'The browser bridge is unavailable.';
    return new McpToolError(
      `ALPHAPORTAL_REFRESH_TOKEN is not set. ${bridgeLine}`,
      {
        hint:
          'Either sign into https://cmsnc.alphaportal.app/ in a browser with the Transporter extension so it can be read automatically, ' +
          'or set ALPHAPORTAL_REFRESH_TOKEN — capture it once by running in that tab\'s DevTools console: ' +
          'JSON.parse(localStorage.user).User.RefreshToken',
      },
    );
  }

  /** Build the authenticated API client once (single-flight); reused thereafter. */
  private ensureApi(): Promise<ApiClient> {
    if (this.apiPromise) return this.apiPromise;
    this.apiPromise = (async () => {
      const { token, source } = await this.resolveRefreshToken();
      this.authSource = source;
      const tokens = new TokenManager({
        // Seeded already-expired so the first request mints lazily.
        initial: { accessToken: '', refreshToken: token, expiresAt: 0 },
        refresh: async (rt) => {
          const result = await refreshAccessToken(rt, this.fetchImpl);
          this.sessionIO.save(this.accountId, result.refreshToken);
          return {
            accessToken: result.token,
            refreshToken: result.refreshToken,
            // decodeJwtExp returns seconds; TokenManager wants epoch ms.
            expiresAt: refreshTokenExpiryMs(result.token) || Date.now() + 25 * 60 * 1000,
          };
        },
      });
      return createApiClient({
        baseUrl: BASE_URL,
        tokenManager: tokens,
        serviceName: SERVICE,
        timeout: 30_000,
        fetchImpl: this.fetchImpl,
      });
    })();
    // If setup fails, clear the cached promise so the next call retries (e.g.
    // the user signs in / sets the token and calls again).
    this.apiPromise.catch(() => {
      this.apiPromise = undefined;
    });
    return this.apiPromise;
  }

  /**
   * A read: GET (or POST for the profile endpoint) against `path`, returning the
   * unwrapped `data`. `query` is appended as a query string; `pathSuffix`
   * appends path segments (e.g. `/{studentId}`).
   */
  async read<T>(
    path: string,
    opts: {
      method?: 'GET' | 'POST';
      pathSuffix?: string;
      query?: Record<string, unknown>;
      body?: unknown;
    } = {},
  ): Promise<T> {
    const api = await this.ensureApi();
    const url =
      '/' + path + (opts.pathSuffix ?? '') + (opts.query ? buildQueryString(opts.query) : '');
    const envelope = await api.fetchJson<Envelope<T>>(opts.method ?? 'GET', url, {
      ...(opts.body !== undefined ? { body: opts.body } : {}),
    });
    return this.unwrap(envelope, path);
  }

  /**
   * A write: POST `body` to `path`. Same envelope handling as {@link read}; the
   * caller (a confirm-gated tool) owns the dry-run gate. Kept separate so the
   * write path is a single auditable choke point.
   */
  async write<T>(
    path: string,
    body: unknown,
    opts: { pathSuffix?: string; query?: Record<string, unknown> } = {},
  ): Promise<T> {
    const api = await this.ensureApi();
    const url =
      '/' + path + (opts.pathSuffix ?? '') + (opts.query ? buildQueryString(opts.query) : '');
    const envelope = await api.fetchJson<Envelope<T>>('POST', url, { body });
    return this.unwrap(envelope, path);
  }

  /** Unwrap `{success,data,message}`; throw an actionable error on failure. */
  private unwrap<T>(envelope: Envelope<T>, path: string): T {
    if (envelope.success === false) {
      const detail =
        envelope.developerMessage?.join('; ') || envelope.message || 'request rejected';
      throw new McpToolError(`AlphaPortal API rejected ${path}: ${detail}`);
    }
    return (envelope.data ?? ({} as T)) as T;
  }
}

/**
 * Module-level singleton shared by every tool module. Constructed here (not in
 * `index.ts`) to preserve the deferred-config pattern: the server boots and
 * answers `tools/list` even when no refresh token is configured — resolution
 * (and the browser bootstrap) happens on the first tool call. A hosted per-user
 * deployment injects its own per-request client into the same registrars.
 */
export const client = new AlphaPortalClient();
