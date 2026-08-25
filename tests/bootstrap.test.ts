import { describe, it, expect, afterEach } from 'vitest';
import {
  BootstrapError,
  bootstrapDisabled,
  bootstrapRefreshToken,
  BOOTSTRAP_DOMAIN,
} from '../src/bootstrap.js';

afterEach(() => {
  delete process.env.ALPHAPORTAL_DISABLE_FETCHPROXY;
});

describe('bootstrapRefreshToken', () => {
  it('declares an apex domain and a pointer, returning the extracted token', async () => {
    let seenOpts: { domains?: string[]; declare?: { localStoragePointers?: unknown[] } } = {};
    const token = await bootstrapRefreshToken(async (opts) => {
      seenOpts = opts as typeof seenOpts;
      return { localStorage: { ALPHAPORTAL_REFRESH_TOKEN: 'the-rt' }, missing: { localStorage: [] } };
    });
    expect(token).toBe('the-rt');
    expect(seenOpts.domains).toContain(BOOTSTRAP_DOMAIN);
    // Extracts via a JSON pointer (the PII blob stays in the browser).
    expect(seenOpts.declare?.localStoragePointers).toEqual([
      { outputKey: 'ALPHAPORTAL_REFRESH_TOKEN', storageKey: 'user', jsonPointer: '/User/RefreshToken' },
    ]);
  });

  it('throws an actionable BootstrapError when the tab returns nothing', async () => {
    await expect(
      bootstrapRefreshToken(async () => ({ localStorage: {}, missing: { localStorage: ['user'] } })),
    ).rejects.toThrow(BootstrapError);
    await expect(
      bootstrapRefreshToken(async () => ({ localStorage: {}, missing: { localStorage: ['user'] } })),
    ).rejects.toThrow(/did not return a refresh token/);
  });

  it('preserves a bridge hint (e.g. bridge down) on the error', async () => {
    const err = await bootstrapRefreshToken(async () => {
      throw Object.assign(new Error('bridge is down'), { hint: 'wake the extension' });
    }).catch((e) => e as BootstrapError);
    expect(err).toBeInstanceOf(BootstrapError);
    expect(err.hint).toBe('wake the extension');
  });

  it('honours the disable opt-out flag', () => {
    expect(bootstrapDisabled()).toBe(false);
    process.env.ALPHAPORTAL_DISABLE_FETCHPROXY = '1';
    expect(bootstrapDisabled()).toBe(true);
  });
});
