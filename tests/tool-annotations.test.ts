import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { client } from '../src/client.js';
import { registerStudentTools } from '../src/tools/students.js';
import { registerNotificationTools } from '../src/tools/notifications.js';
import { registerReferenceTools } from '../src/tools/reference.js';
import { registerWriteTools } from '../src/tools/writes.js';
import { registerSessionTools } from '../src/tools/session.js';
import { registerHealthcheckTools } from '../src/tools/healthcheck.js';
import { createTestHarness } from './helpers.js';

/**
 * Fleet annotation meta-test (modelled on skylight-mcp). It reads the SERVED
 * tools/list rather than a hand-kept list, so a tool added without a decision
 * fails here instead of shipping with the spec defaults.
 *
 * `destructiveHint` DEFAULTS TO TRUE whenever readOnlyHint is not true, so a
 * write that forgets to declare it is published as destructive and nothing
 * else fails — a considered `false` and a forgotten one look identical. And
 * `openWorldHint` defaults to true too; every tool here reaches AlphaPortal's
 * API, but the point is that each one SAYS so.
 */
interface Ann {
  readOnlyHint?: unknown;
  destructiveHint?: unknown;
  openWorldHint?: unknown;
}

describe('every tool declares its annotations', () => {
  let harness: Awaited<ReturnType<typeof createTestHarness>>;
  let ann: Record<string, Ann | undefined>;

  beforeAll(async () => {
    harness = await createTestHarness((server) => {
      registerStudentTools(server, client);
      registerNotificationTools(server, client);
      registerReferenceTools(server, client);
      registerWriteTools(server, client);
      registerSessionTools(server, client);
      registerHealthcheckTools(server, client);
    });
    // harness.listTools() drops annotations; the raw client keeps them.
    const { tools } = await harness.client.listTools();
    ann = Object.fromEntries(tools.map((t) => [t.name, t.annotations as Ann | undefined]));
  });

  afterAll(async () => {
    if (harness) await harness.close();
  });

  it('covers the full surface (guards against a registrar being dropped here)', () => {
    expect(Object.keys(ann)).toHaveLength(16);
  });

  it('sets an explicit boolean destructiveHint on every write', () => {
    const undeclared = Object.entries(ann)
      .filter(([, a]) => a?.readOnlyHint !== true && typeof a?.destructiveHint !== 'boolean')
      .map(([name]) => name);
    expect(undeclared).toEqual([]);
  });

  it('never lets a read claim to be destructive', () => {
    const contradictory = Object.entries(ann)
      .filter(([, a]) => a?.readOnlyHint === true && a?.destructiveHint === true)
      .map(([name]) => name);
    expect(contradictory).toEqual([]);
  });

  it('sets an explicit boolean openWorldHint on every tool', () => {
    const missing = Object.entries(ann)
      .filter(([, a]) => typeof a?.openWorldHint !== 'boolean')
      .map(([name]) => name);
    expect(missing).toEqual([]);
  });

  it('keeps both writes destructive (no tool here restores the prior state)', () => {
    // alphaportal_edit_walk_radius can change transportation eligibility and no
    // tool reads the prior radius back; alphaportal_set_notification may reset
    // categories the call omits. Neither has an inverse in this tool set.
    for (const name of ['alphaportal_edit_walk_radius', 'alphaportal_set_notification']) {
      expect(ann[name], name).toMatchObject({ readOnlyHint: false, destructiveHint: true, openWorldHint: true });
    }
  });
});
