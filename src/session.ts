/**
 * Persistence for the rotating refresh token.
 *
 * The refresh token is the durable credential; each refresh issues a new one,
 * and persisting it rolls the 8-day window forward so a long-running (or
 * hosted, scale-to-zero) deployment never has to re-capture. Persistence is
 * best-effort: a read-only home or a filesystem-less runtime degrades to
 * "no store", and the env-supplied token still works — it just can't roll
 * forward across restarts.
 *
 * A thin adapter over `@chrischall/mcp-utils/session`'s `SessionStore` (0600
 * file inside a 0700 dir, corrupt-file quarantine). Keyed by account id so a
 * future multi-account mode drops in without a schema change; today there is a
 * single well-known key.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { readEnvVar } from '@chrischall/mcp-utils';
import { SessionStore } from '@chrischall/mcp-utils/session';

/** Directory (under $HOME) that holds the session file. */
export const SESSION_DIR_NAME = '.alphaportal-mcp';

/** The single key used until multi-account support exists. */
export const DEFAULT_ACCOUNT_KEY = 'default';

/** What we persist between runs. Never anything but the rotating refresh token. */
export interface StoredSession extends Record<string, unknown> {
  /** Logical account key (lowercased). */
  accountId: string;
  /** The freshest refresh token seen (8-day JWT). */
  refreshToken: string;
  /** ISO timestamp of the last write, for diagnostics. */
  updatedAt: string;
}

/** Where the store lives. `ALPHAPORTAL_SESSION_FILE` overrides it (tests do). */
export function sessionFilePath(): string {
  return (
    readEnvVar('ALPHAPORTAL_SESSION_FILE') ?? join(homedir(), SESSION_DIR_NAME, 'session.json')
  );
}

const normalizeAccountId = (key: string): string => key.trim().toLowerCase();

/** Open the store fresh per call so `ALPHAPORTAL_SESSION_FILE` is honoured dynamically. */
export function openSessionStore(): SessionStore<StoredSession> {
  return new SessionStore<StoredSession>({
    filePath: sessionFilePath(),
    keyOf: (session) => session.accountId,
    normalizeKey: normalizeAccountId,
  });
}

/**
 * Storage seam for the persisted refresh token. The stdio server uses
 * {@link diskSessionIO}; a hosted runtime without a filesystem passes
 * {@link nullSessionIO} and supplies the token via the environment.
 */
export interface SessionIO {
  load(accountId: string): string | null;
  save(accountId: string, refreshToken: string): void;
  clear(accountId: string): void;
}

function warn(action: string, err: unknown): void {
  // stderr only — stdout is the JSON-RPC channel.
  console.error(
    `[alphaportal-mcp] could not ${action} the saved refresh token (${(err as Error).message}); ` +
      'continuing without persistence — the token cannot roll forward across restarts.',
  );
}

/** Build a {@link SessionIO} over a store factory. Every op is best-effort. */
export function createSessionIO(openStore: () => SessionStore<StoredSession>): SessionIO {
  return {
    load(accountId) {
      try {
        const record = openStore().get(accountId);
        return record && typeof record.refreshToken === 'string' && record.refreshToken
          ? record.refreshToken
          : null;
      } catch (err) {
        warn('read', err);
        return null;
      }
    },
    save(accountId, refreshToken) {
      try {
        openStore().add({
          accountId: normalizeAccountId(accountId),
          refreshToken,
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        warn('save', err);
      }
    },
    clear(accountId) {
      try {
        openStore().remove(accountId);
      } catch (err) {
        warn('clear', err);
      }
    },
  };
}

/** Disk-backed persistence (0600 file, 0700 dir). Never throws. */
export const diskSessionIO: SessionIO = createSessionIO(openSessionStore);

/** No-op persistence for runtimes without a filesystem. */
export const nullSessionIO: SessionIO = {
  load: () => null,
  save: () => {},
  clear: () => {},
};
