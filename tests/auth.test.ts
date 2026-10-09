import { describe, it, expect, vi } from 'vitest';
import { REFRESH_TIMEOUT_MS, refreshAccessToken, refreshTokenExpiryMs } from '../src/auth.js';

/** Build a minimal JWT with the given `exp` (seconds). */
function jwt(exp: number): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS512' })}.${b64({ exp })}.sig`;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('refreshAccessToken', () => {
  it('exchanges a refresh token for a fresh token pair', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        success: true,
        data: { token: jwt(2_000_000_000), refreshToken: 'newRT', lang: 'en' },
        message: '',
      }),
    ) as unknown as typeof fetch;

    const result = await refreshAccessToken('oldRT', fetchImpl);
    expect(result.refreshToken).toBe('newRT');
    expect(result.token).toContain('.');
    // Posts to the refresh path with the refresh token in the body.
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ refreshToken: 'oldRT' });
  });

  it('bounds the exchange with a timeout so a stalled connection cannot hang every tool call', async () => {
    // A fetch that never answers until it is aborted.
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    ) as unknown as typeof fetch;
    await expect(refreshAccessToken('oldRT', fetchImpl, 20)).rejects.toThrow(/could not reach/);
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('defaults the exchange timeout to the 30s the API client uses', () => {
    expect(REFRESH_TIMEOUT_MS).toBe(30_000);
  });

  it('maps a 401 to an actionable re-capture error', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, { success: false })) as unknown as typeof fetch;
    await expect(refreshAccessToken('dead', fetchImpl)).rejects.toThrow(/expired or invalid/i);
  });

  it('rejects a response missing the token pair', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { success: true, data: {} })) as unknown as typeof fetch;
    await expect(refreshAccessToken('rt', fetchImpl)).rejects.toThrow(/missing the token pair/i);
  });

  it('rejects a non-JSON body', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, 'not json')) as unknown as typeof fetch;
    await expect(refreshAccessToken('rt', fetchImpl)).rejects.toThrow(/non-JSON/i);
  });

  it('never leaks the token value in an error', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(500, {})) as unknown as typeof fetch;
    await expect(refreshAccessToken('SUPERSECRETTOKEN', fetchImpl)).rejects.toThrow(
      /HTTP 500/,
    );
    await expect(refreshAccessToken('SUPERSECRETTOKEN', fetchImpl)).rejects.not.toThrow(
      /SUPERSECRETTOKEN/,
    );
  });
});

describe('refreshTokenExpiryMs', () => {
  it('returns the exp in milliseconds', () => {
    expect(refreshTokenExpiryMs(jwt(1_700_000_000))).toBe(1_700_000_000_000);
  });
  it('returns 0 for an undecodable token', () => {
    expect(refreshTokenExpiryMs('not-a-jwt')).toBe(0);
  });
});
