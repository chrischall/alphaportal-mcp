/**
 * `AlphaPortalClient` — the one place that talks to the AlphaRoute API.
 *
 * Design rules (each earns its keep):
 *
 *  - **Deferred config error.** The constructor never throws and never does
 *    I/O, so the server boots and answers the host's install-time `tools/list`
 *    probe with no credentials configured; the error surfaces on the first
 *    tool call. The constructor is also PURE (no fetch/timers/randomness),
 *    because a sandboxed runtime forbids those in the module-init scope where
 *    the singleton is built.
 *  - **One read path, one write path.** Every GET/read goes through {@link read}
 *    and every mutation through {@link write}, so bearer auth, the reactive
 *    401-replay and the `{success,data,message}` envelope handling can never
 *    drift between endpoints.
 *  - **Refresh-token as the credential.** A `TokenManager` mints 30-minute
 *    access tokens from the long-lived refresh token and persists each rotated
 *    refresh token so the 8-day window rolls forward. The refresh token is
 *    resolved as the FRESHEST of an injected value, `ALPHAPORTAL_REFRESH_TOKEN`,
 *    and the persisted store entry — so a deliberate re-capture (later `exp`)
 *    wins over a rolled-forward store entry, and vice versa.
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

export interface AlphaPortalClientOptions {
  /** Injected refresh token (hosted per-user path); overrides env + store when fresher. */
  refreshToken?: string;
  /** Storage seam for the rotating refresh token (defaults to disk). */
  sessionIO?: SessionIO;
  /** Injected fetch, for tests. */
  fetchImpl?: FetchLike;
  /** Logical account key (single-account default). */
  accountId?: string;
}

export class AlphaPortalClient {
  private readonly configError: McpToolError | undefined;
  private readonly accountId: string;
  private readonly sessionIO: SessionIO;
  private readonly fetchImpl: FetchLike;
  private readonly tokens: TokenManager | undefined;
  private readonly api: ApiClient | undefined;

  constructor(opts: AlphaPortalClientOptions = {}) {
    this.accountId = opts.accountId ?? DEFAULT_ACCOUNT_KEY;
    this.sessionIO = opts.sessionIO ?? diskSessionIO;
    this.fetchImpl = opts.fetchImpl ?? fetch;

    const refreshToken = this.resolveRefreshToken(opts.refreshToken);
    if (!refreshToken) {
      this.configError = new McpToolError(
        'ALPHAPORTAL_REFRESH_TOKEN is not set. Capture it once from a signed-in ' +
          'cmsnc.alphaportal.app browser tab (see README / the alphaportal-fpx skill), then set it.',
        {
          hint: "In the signed-in tab's DevTools console run: JSON.parse(localStorage.user).User.RefreshToken",
        },
      );
      return;
    }

    // Seeded already-expired so the first call mints lazily on first use.
    this.tokens = new TokenManager({
      initial: { accessToken: '', refreshToken, expiresAt: 0 },
      refresh: async (rt) => {
        const result = await refreshAccessToken(rt, this.fetchImpl);
        // Roll the window forward: persist the freshly-issued refresh token.
        this.sessionIO.save(this.accountId, result.refreshToken);
        return {
          accessToken: result.token,
          refreshToken: result.refreshToken,
          // decodeJwtExp returns seconds; TokenManager wants epoch ms.
          expiresAt: refreshTokenExpiryMs(result.token) || Date.now() + 25 * 60 * 1000,
        };
      },
    });

    this.api = createApiClient({
      baseUrl: BASE_URL,
      tokenManager: this.tokens,
      serviceName: SERVICE,
      timeout: 30_000,
      fetchImpl: this.fetchImpl,
    });
  }

  /** Pick the freshest refresh token among injected / env / persisted store. */
  private resolveRefreshToken(injected?: string): string | null {
    const candidates = [
      injected,
      readEnvVar('ALPHAPORTAL_REFRESH_TOKEN'),
      this.sessionIO.load(this.accountId) ?? undefined,
    ].filter((t): t is string => typeof t === 'string' && t.length > 0);
    if (candidates.length === 0) return null;
    return candidates.reduce((best, cur) =>
      refreshTokenExpiryMs(cur) > refreshTokenExpiryMs(best) ? cur : best,
    );
  }

  /** True when a refresh token is configured (used by the session-status tool). */
  isConfigured(): boolean {
    return this.configError === undefined;
  }

  private require(): { api: ApiClient } {
    if (this.configError) throw this.configError;
    return { api: this.api! };
  }

  /**
   * A read: GET (or POST for the profile endpoint) against `path`, returning the
   * unwrapped `data`. `query` is appended as a query string; `pathSuffix`
   * appends path segments (e.g. `/{studentId}`). Non-2xx and `success:false`
   * bodies are turned into an actionable {@link McpToolError}.
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
    const { api } = this.require();
    const url =
      '/' + path + (opts.pathSuffix ?? '') + (opts.query ? buildQueryString(opts.query) : '');
    const envelope = await api.fetchJson<Envelope<T>>(opts.method ?? 'GET', url, {
      ...(opts.body !== undefined ? { body: opts.body } : {}),
    });
    return this.unwrap(envelope, path);
  }

  /**
   * A write: POST `body` to `path`. Same envelope handling as {@link read}; the
   * caller (a confirm-gated tool) is responsible for the dry-run gate. Kept
   * separate from {@link read} so the write path is a single auditable choke
   * point even though the mechanics currently match.
   */
  async write<T>(
    path: string,
    body: unknown,
    opts: { pathSuffix?: string; query?: Record<string, unknown> } = {},
  ): Promise<T> {
    const { api } = this.require();
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
 * `index.ts`) to preserve the deferred-config-error pattern: the server boots
 * and answers `tools/list` even when the refresh token is absent — the error
 * surfaces on the first tool call. A hosted per-user deployment injects its own
 * per-request client into the same registrars instead.
 */
export const client = new AlphaPortalClient();
