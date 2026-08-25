import { describe, it, expect, vi } from 'vitest';
import { AlphaPortalClient } from '../src/client.js';
import { nullSessionIO, type SessionIO } from '../src/session.js';

function jwt(exp: number): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS512' })}.${b64({ exp })}.sig`;
}
const FUTURE = Math.floor(Date.now() / 1000) + 3600;

function res(status: number, body: unknown): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** A fetch double that mints a token on the refresh path and serves canned reads. */
function makeFetch(handlers: {
  reads?: Record<string, unknown>;
  onRequest?: (url: string, init?: RequestInit) => void;
}) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    handlers.onRequest?.(url, init);
    if (url.includes('/public/refresh-token')) {
      return res(200, { success: true, data: { token: jwt(FUTURE), refreshToken: jwt(FUTURE) } });
    }
    for (const [needle, data] of Object.entries(handlers.reads ?? {})) {
      if (url.includes(needle)) return res(200, { success: true, data, message: '' });
    }
    return res(404, { success: false, developerMessage: [`no stub for ${url}`] });
  }) as unknown as typeof fetch;
}

describe('AlphaPortalClient auth + envelope', () => {
  it('mints an access token from the refresh token and sends it as a Bearer', async () => {
    const seen: string[] = [];
    const fetchImpl = makeFetch({
      reads: { 'user-students/list': { students: [{ studentId: 1 }] } },
      onRequest: (url, init) => {
        const auth = (init?.headers as Record<string, string> | undefined)?.['Authorization'];
        if (url.includes('user-students/list') && auth) seen.push(auth);
      },
    });
    const client = new AlphaPortalClient({
      refreshToken: jwt(FUTURE),
      sessionIO: nullSessionIO,
      fetchImpl,
    });
    const data = await client.read<{ students: unknown[] }>('AlphaPortal/v1/user-students/list');
    expect(data.students).toHaveLength(1);
    expect(seen[0]).toMatch(/^Bearer /);
  });

  it('persists the rotated refresh token after a refresh', async () => {
    const saves: Array<[string, string]> = [];
    const io: SessionIO = { load: () => null, save: (a, t) => saves.push([a, t]), clear: () => {} };
    const client = new AlphaPortalClient({
      refreshToken: jwt(FUTURE),
      sessionIO: io,
      fetchImpl: makeFetch({ reads: { profile: { Profile: {} } } }),
    });
    await client.read('AlphaCore/v1/user/profile', { method: 'POST', body: {} });
    expect(saves.length).toBe(1);
    expect(saves[0][1]).toContain('.'); // a JWT was stored
  });

  it('throws an actionable error when no token and the bridge is disabled', async () => {
    process.env.ALPHAPORTAL_DISABLE_FETCHPROXY = '1';
    try {
      const client = new AlphaPortalClient({ sessionIO: nullSessionIO, fetchImpl: makeFetch({}) });
      expect(client.hasStaticToken()).toBe(false);
      const err = await client
        .read('AlphaPortal/v1/user-students/list')
        .catch((e) => e as Error & { hint?: string });
      expect(err.message).toMatch(/ALPHAPORTAL_REFRESH_TOKEN is not set/);
      // The hint (rendered into the tool text by createMcpServer) names the
      // console one-liner capture path.
      expect(err.hint).toMatch(/localStorage\.user/);
    } finally {
      delete process.env.ALPHAPORTAL_DISABLE_FETCHPROXY;
    }
  });

  it('bootstraps the refresh token from the browser bridge when none is configured', async () => {
    const saved: string[] = [];
    const io = { load: () => null, save: (_a: string, t: string) => saved.push(t), clear: () => {} };
    // Injected bootstrap returns the pointer-extracted refresh token.
    const bootstrapImpl = async () => ({
      localStorage: { ALPHAPORTAL_REFRESH_TOKEN: jwt(FUTURE) },
      missing: { localStorage: [] },
    });
    const client = new AlphaPortalClient({
      sessionIO: io,
      fetchImpl: makeFetch({ reads: { 'user-students/list': { students: [] } } }),
      bootstrapImpl,
    });
    const data = await client.read<{ students: unknown[] }>('AlphaPortal/v1/user-students/list');
    expect(data.students).toEqual([]);
    expect(client.currentAuthSource()).toBe('browser-bootstrap');
    // The bootstrapped token is persisted so later runs skip the bridge.
    expect(saved.length).toBeGreaterThanOrEqual(1);
  });

  it('an EXPIRED persisted token does not shadow the browser bootstrap', async () => {
    // The regression the auto-review caught: expiry used to only RANK
    // candidates, so a stale stored token won by default and the bootstrap
    // fallback could never run.
    const expired = jwt(Math.floor(Date.now() / 1000) - 60);
    const io = { load: () => expired, save: () => {}, clear: () => {} };
    let bootstrapped = false;
    const client = new AlphaPortalClient({
      sessionIO: io,
      fetchImpl: makeFetch({ reads: { 'user-students/list': { students: [] } } }),
      bootstrapImpl: async () => {
        bootstrapped = true;
        return { localStorage: { ALPHAPORTAL_REFRESH_TOKEN: jwt(FUTURE) }, missing: { localStorage: [] } };
      },
    });
    await client.read('AlphaPortal/v1/user-students/list');
    expect(bootstrapped).toBe(true);
    expect(client.currentAuthSource()).toBe('browser-bootstrap');
  });

  it('a REJECTED refresh token is cleared, so the next call re-bootstraps', async () => {
    // Outcome under test: the README's "sign back in and retry" recovery.
    let stored: string | null = jwt(FUTURE); // decodable + unexpired, but dead server-side
    const io = {
      load: () => stored,
      save: (_a: string, t: string) => { stored = t; },
      clear: () => { stored = null; },
    };
    let bootstrapCalls = 0;
    let rejectRefresh = true;
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/public/refresh-token')) {
        if (rejectRefresh) return res(401, { success: false, message: 'Invalid user!' });
        return res(200, { success: true, data: { token: jwt(FUTURE), refreshToken: jwt(FUTURE) } });
      }
      return res(200, { success: true, data: { students: [] } });
    }) as unknown as typeof fetch;
    const client = new AlphaPortalClient({
      sessionIO: io,
      fetchImpl,
      bootstrapImpl: async () => {
        bootstrapCalls += 1;
        return { localStorage: { ALPHAPORTAL_REFRESH_TOKEN: jwt(FUTURE) }, missing: { localStorage: [] } };
      },
    });

    // First call: the stored token is rejected → it must be discarded.
    await expect(client.read('AlphaPortal/v1/user-students/list')).rejects.toThrow();
    expect(stored, 'a rejected refresh token must not stay persisted').toBeNull();

    // The user signs back in; the next call recovers via the bridge.
    rejectRefresh = false;
    const data = await client.read<{ students: unknown[] }>('AlphaPortal/v1/user-students/list');
    expect(data.students).toEqual([]);
    expect(bootstrapCalls).toBe(1);
  });

  it('a TRANSIENT refresh failure keeps the stored token (does not force re-capture)', async () => {
    let stored: string | null = jwt(FUTURE);
    const io = {
      load: () => stored,
      save: (_a: string, t: string) => { stored = t; },
      clear: () => { stored = null; },
    };
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/public/refresh-token')) return res(503, { success: false });
      return res(200, { success: true, data: {} });
    }) as unknown as typeof fetch;
    const client = new AlphaPortalClient({ sessionIO: io, fetchImpl });
    await expect(client.read('AlphaPortal/v1/user-students/list')).rejects.toThrow(/HTTP 503/);
    expect(stored, 'a 5xx must not cost the user their credential').not.toBeNull();
  });

  it('surfaces the underlying cause when the refresh fetch throws (reachability)', async () => {
    const throwingFetch = (async () => {
      throw Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    }) as unknown as typeof fetch;
    const client = new AlphaPortalClient({
      refreshToken: jwt(FUTURE),
      sessionIO: nullSessionIO,
      fetchImpl: throwingFetch,
    });
    await expect(client.read('AlphaPortal/v1/user-students/list')).rejects.toThrow(
      /could not reach https:\/\/api\.alpharoute\.app.*ENOTFOUND/,
    );
  });

  it('surfaces a success:false envelope as an actionable error', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/public/refresh-token'))
        return res(200, { success: true, data: { token: jwt(FUTURE), refreshToken: jwt(FUTURE) } });
      return res(200, { success: false, developerMessage: ['studentId: must not be null'] });
    }) as unknown as typeof fetch;
    const client = new AlphaPortalClient({ refreshToken: jwt(FUTURE), sessionIO: nullSessionIO, fetchImpl });
    await expect(client.read('AlphaPortal/v1/user-students/stops')).rejects.toThrow(
      /studentId: must not be null/,
    );
  });

  it('picks the freshest of injected / env / store refresh tokens', async () => {
    // store token expires later than the injected one → store wins.
    const near = jwt(Math.floor(Date.now() / 1000) + 60);
    const far = jwt(Math.floor(Date.now() / 1000) + 999_999);
    const io: SessionIO = { load: () => far, save: () => {}, clear: () => {} };
    let usedRefreshBody: unknown;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/public/refresh-token')) {
        usedRefreshBody = JSON.parse((init!.body as string));
        return res(200, { success: true, data: { token: jwt(FUTURE), refreshToken: jwt(FUTURE) } });
      }
      return res(200, { success: true, data: {} });
    }) as unknown as typeof fetch;
    const client = new AlphaPortalClient({ refreshToken: near, sessionIO: io, fetchImpl });
    await client.read('AlphaPortal/v1/user-students/list');
    expect((usedRefreshBody as { refreshToken: string }).refreshToken).toBe(far);
  });

  it('builds path suffixes and query strings correctly', async () => {
    const urls: string[] = [];
    const fetchImpl = makeFetch({
      reads: { 'vehicle-location': { location: {} }, 'reports-bulk': 'link' },
      onRequest: (u) => urls.push(u),
    });
    const client = new AlphaPortalClient({ refreshToken: jwt(FUTURE), sessionIO: nullSessionIO, fetchImpl });
    await client.read('AlphaPortal/v1/user-students/vehicle-location', { pathSuffix: '/42/1' });
    await client.read('AlphaPortal/v1/user-students/reports-bulk', { query: { studentId: 42 } });
    expect(urls.some((u) => u.endsWith('/vehicle-location/42/1'))).toBe(true);
    expect(urls.some((u) => u.includes('reports-bulk?studentId=42'))).toBe(true);
  });
});
