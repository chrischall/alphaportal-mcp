import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestHarness, parseToolResult } from './helpers.js';
import { AlphaPortalClient } from '../src/client.js';
import { READ } from '../src/endpoints.js';
import { nullSessionIO } from '../src/session.js';
import { registerSessionTools } from '../src/tools/session.js';

interface Status {
  authenticated: boolean;
  authSource?: string;
  user?: string | null;
  hasStaticToken?: boolean;
  note?: string;
  hint?: string;
}

function jwt(exp: number): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS512' })}.${b64({ exp })}.sig`;
}
const FUTURE = Math.floor(Date.now() / 1000) + 3600;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function status(client: AlphaPortalClient): Promise<Status> {
  const h = await createTestHarness((server) => registerSessionTools(server, client));
  const res = await h.client.callTool({ name: 'alphaportal_session_status', arguments: {} });
  await h.close();
  return parseToolResult<Status>(res as never);
}

describe('alphaportal_session_status', () => {
  beforeEach(() => {
    vi.stubEnv('ALPHAPORTAL_REFRESH_TOKEN', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads the profile through the READ.profile endpoint constant', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/public/refresh-token'))
        return json(200, { success: true, data: { token: jwt(FUTURE), refreshToken: jwt(FUTURE) } });
      return json(200, { success: true, data: { Profile: { UserName: 'parent@example.com' } } });
    }) as unknown as typeof fetch;
    const client = new AlphaPortalClient({ refreshToken: jwt(FUTURE), sessionIO: nullSessionIO, fetchImpl });
    const r = await status(client);
    expect(r).toMatchObject({ authenticated: true, user: 'parent@example.com' });
    const urls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string);
    expect(urls).toContain(`https://api.alpharoute.app/${READ.profile}`);
  });

  it('keeps the onboarding hint when no credential resolves', async () => {
    vi.stubEnv('ALPHAPORTAL_DISABLE_FETCHPROXY', '1');
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const client = new AlphaPortalClient({ sessionIO: nullSessionIO, fetchImpl });
    const r = await status(client);
    expect(r.authenticated).toBe(false);
    expect(r.note).toMatch(/ALPHAPORTAL_REFRESH_TOKEN is not set/);
    // The capture instructions are the actionable part — they must survive.
    expect(r.hint).toMatch(/localStorage\.user/);
    expect(r.hint).toMatch(/cmsnc\.alphaportal\.app/);
  });

  it('omits the hint for an error that carries none', async () => {
    const fetchImpl = vi.fn(async () => json(500, { success: false })) as unknown as typeof fetch;
    const client = new AlphaPortalClient({ refreshToken: jwt(FUTURE), sessionIO: nullSessionIO, fetchImpl });
    const r = await status(client);
    expect(r.authenticated).toBe(false);
    expect(r).not.toHaveProperty('hint');
  });
});
