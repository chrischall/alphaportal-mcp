import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionIO, diskSessionIO, nullSessionIO, openSessionStore } from '../src/session.js';

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'alphaportal-session-'));
  file = join(dir, 'session.json');
  process.env.ALPHAPORTAL_SESSION_FILE = file;
});
afterEach(() => {
  delete process.env.ALPHAPORTAL_SESSION_FILE;
  rmSync(dir, { recursive: true, force: true });
});

describe('disk session IO', () => {
  it('round-trips a refresh token and rolls it forward', () => {
    expect(diskSessionIO.load('default')).toBeNull();
    diskSessionIO.save('default', 'rt-1');
    expect(existsSync(file)).toBe(true);
    expect(diskSessionIO.load('default')).toBe('rt-1');
    diskSessionIO.save('default', 'rt-2');
    expect(diskSessionIO.load('default')).toBe('rt-2');
  });

  it('normalizes the account key (case-insensitive)', () => {
    diskSessionIO.save('Default', 'rt-x');
    expect(diskSessionIO.load('default')).toBe('rt-x');
  });

  it('clears a stored token', () => {
    diskSessionIO.save('default', 'rt');
    diskSessionIO.clear('default');
    expect(diskSessionIO.load('default')).toBeNull();
  });

  it('degrades to null (never throws) when the store cannot be opened', () => {
    const broken = createSessionIO(() => {
      throw new Error('no filesystem');
    });
    expect(broken.load('default')).toBeNull();
    expect(() => broken.save('default', 'rt')).not.toThrow();
    expect(() => broken.clear('default')).not.toThrow();
  });

  it('the store factory honours ALPHAPORTAL_SESSION_FILE dynamically', () => {
    openSessionStore().add({ accountId: 'default', refreshToken: 'rt', updatedAt: 'now' });
    expect(diskSessionIO.load('default')).toBe('rt');
  });
});

describe('null session IO', () => {
  it('never persists and always loads null', () => {
    nullSessionIO.save('default', 'rt');
    expect(nullSessionIO.load('default')).toBeNull();
  });
});
