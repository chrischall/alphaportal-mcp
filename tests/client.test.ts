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

  it('throws an actionable config error when no refresh token is available', async () => {
    const client = new AlphaPortalClient({ sessionIO: nullSessionIO, fetchImpl: makeFetch({}) });
    expect(client.isConfigured()).toBe(false);
    await expect(client.read('AlphaPortal/v1/user-students/list')).rejects.toThrow(
      /ALPHAPORTAL_REFRESH_TOKEN is not set/,
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
