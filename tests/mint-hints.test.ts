import { describe, it, expect, afterAll, beforeAll, afterEach, vi } from 'vitest';
import type { AlphaPortalClient } from '../src/client.js';
import { client } from '../src/client.js';
import { registerStudentTools } from '../src/tools/students.js';
import { registerNotificationTools } from '../src/tools/notifications.js';
import { registerReferenceTools } from '../src/tools/reference.js';
import { registerWriteTools } from '../src/tools/writes.js';
import { registerSessionTools } from '../src/tools/session.js';
import { registerHealthcheckTools } from '../src/tools/healthcheck.js';
import { createTestHarness } from './helpers.js';

/**
 * Context-group hints (`_meta.mint`, the mcp-host context-groups contract),
 * asserted against the SERVED tools/list — what a host sees — so a tool added
 * without a decision fails here.
 */
interface Listed {
  name: string;
  inputSchema: { properties?: Record<string, { enum?: unknown[] }> };
  annotations?: { readOnlyHint?: boolean };
  _meta?: { mint?: Record<string, unknown> };
}

const DOMAINS = ['school', 'home', 'work', 'family', 'health', 'money', 'travel', 'food'];
const INTENTS = ['whats-new', 'whats-due', 'whats-on', 'lookup', 'turn-on-off', 'send', 'change', 'other'];
const KEYS = ['domain', 'intent', 'canonical', 'subject', 'when', 'aliases'];

/** The intent every tool declares — this table is the assertion. */
const EXPECTED_INTENT: Record<string, string> = {
  alphaportal_list_students: 'lookup',
  alphaportal_get_student: 'lookup',
  alphaportal_get_student_stops: 'lookup',
  alphaportal_get_bus_location: 'lookup',
  alphaportal_get_report_link: 'other',
  alphaportal_list_notifications: 'whats-new',
  alphaportal_get_profile: 'lookup',
  alphaportal_get_account: 'lookup',
  alphaportal_get_settings: 'lookup',
  alphaportal_list_schools: 'lookup',
  alphaportal_list_grades: 'lookup',
  alphaportal_list_requests: 'lookup',
  alphaportal_session_status: 'other',
  alphaportal_edit_walk_radius: 'change',
  alphaportal_set_notification: 'turn-on-off',
};

describe('_meta.mint on every served tool', () => {
  let harness: Awaited<ReturnType<typeof createTestHarness>>;
  let tools: Listed[];

  beforeAll(async () => {
    harness = await createTestHarness((server) => {
      registerStudentTools(server, client);
      registerNotificationTools(server, client);
      registerReferenceTools(server, client);
      registerWriteTools(server, client);
      registerSessionTools(server, client);
      registerHealthcheckTools(server, client);
    });
    tools = (await harness.client.listTools()).tools as Listed[];
  });

  afterAll(async () => {
    if (harness) await harness.close();
  });

  it('names every served tool but the healthcheck, so a new tool cannot skip the decision', () => {
    const names = tools.map((t) => t.name).filter((n) => !n.endsWith('_healthcheck'));
    expect(names.sort()).toEqual(Object.keys(EXPECTED_INTENT).sort());
  });

  it.each(Object.entries(EXPECTED_INTENT))('%s declares domain school and intent %s', (name, intent) => {
    const mint = tools.find((t) => t.name === name)?._meta?.mint;
    expect(mint, name).toBeDefined();
    expect(mint!.domain).toBe('school');
    expect(mint!.intent).toBe(intent);
  });

  it('every hint is shaped per the host contract', () => {
    for (const t of tools) {
      if (t.name.endsWith('_healthcheck')) continue; // registered by mcp-utils, which takes no _meta
      const mint = t._meta!.mint!;
      expect(Object.keys(mint).filter((k) => !KEYS.includes(k)), t.name).toEqual([]);
      expect(DOMAINS, t.name).toContain(mint.domain);
      expect(INTENTS, t.name).toContain(mint.intent);
      const props = t.inputSchema.properties ?? {};
      if ('canonical' in mint) {
        expect(mint.canonical, t.name).toBe(true);
        expect(t.annotations?.readOnlyHint, t.name).toBe(true);
        expect(['whats-new', 'whats-due', 'whats-on'], t.name).toContain(mint.intent);
        expect(props.view?.enum, t.name).toContain('brief');
      }
      if ('subject' in mint) expect(props, t.name).toHaveProperty(mint.subject as string);
      if ('when' in mint) {
        const when = mint.when as Record<string, string>;
        expect(Object.keys(when).sort(), t.name).toEqual(['end', 'start']);
        expect(props, t.name).toHaveProperty(when.start);
        expect(props, t.name).toHaveProperty(when.end);
      }
      if ('aliases' in mint) {
        const aliases = mint.aliases as string[];
        expect(aliases.length, t.name).toBeLessThanOrEqual(8);
        for (const a of aliases) {
          expect(a.length, t.name).toBeLessThanOrEqual(40);
          expect(a, t.name).toBe(a.toLowerCase());
        }
      }
    }
  });

  it('marks exactly one tool canonical: notifications for whats-new, with no subject or range', () => {
    const canonical = tools
      .filter((t) => t._meta?.mint?.canonical === true)
      .map((t) => [t.name, t._meta!.mint!.intent]);
    expect(canonical).toEqual([['alphaportal_list_notifications', 'whats-new']]);
    const mint = tools.find((t) => t.name === 'alphaportal_list_notifications')!._meta!.mint!;
    expect(mint).not.toHaveProperty('subject');
    expect(mint).not.toHaveProperty('when');
  });

  it('no write is canonical', () => {
    for (const t of tools.filter((x) => x.annotations?.readOnlyHint !== true)) {
      expect(t._meta?.mint?.canonical, t.name).toBeUndefined();
    }
  });
});

describe('alphaportal_list_notifications view: "brief"', () => {
  let harness: Awaited<ReturnType<typeof createTestHarness>> | undefined;
  afterEach(async () => {
    if (harness) await harness.close();
    harness = undefined;
  });

  function fakeClient(payload: unknown): AlphaPortalClient {
    return { read: vi.fn(async () => payload) } as unknown as AlphaPortalClient;
  }

  async function brief(payload: unknown): Promise<Record<string, unknown>> {
    harness = await createTestHarness((server) => registerNotificationTools(server, fakeClient(payload)));
    const result = await harness.callTool('alphaportal_list_notifications', { view: 'brief' });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    return JSON.parse(text) as Record<string, unknown>;
  }

  it('answers one line per notification inside the untrusted-data envelope, newest first', async () => {
    const out = await brief({
      notifications: [
        { id: 1, personName: 'Student A', title: 'Arrived at school', body: 'x', creationDate: '2026-11-03T07:41:12' },
        { id: 2, personName: 'Student B', title: 'Bus departed', body: 'y', creationDate: '2026-11-04 15:02:00' },
      ],
    });
    expect(out.untrusted_content).toBe(true);
    expect(String(out.note)).toMatch(/school district/);
    expect(out.data).toEqual([
      'Student B: Bus departed — 2026-11-04T15:02 — bus alert',
      'Student A: Arrived at school — 2026-11-03T07:41 — bus alert',
    ]);
    // Markers precede the third-party text.
    expect(Object.keys(out)[0]).toBe('untrusted_content');
  });

  it('writes "no date" for a notification without a readable date and keeps lines ≤ 120 chars', async () => {
    const out = await brief({
      notifications: [{ title: 'T'.repeat(300), creationDate: 'not a date' }, { title: 'Second' }],
    });
    const lines = out.data as string[];
    expect(lines).toHaveLength(2);
    for (const l of lines) {
      expect(l.length).toBeLessThanOrEqual(120);
      expect(l).toMatch(/ — no date — bus alert$/);
    }
    expect(lines[0]).toMatch(/…/);
  });

  it('accepts an epoch-millisecond date as an ISO date', async () => {
    const out = await brief({ notifications: [{ title: 'Arrived', creationDate: Date.UTC(2026, 10, 4, 12, 30) }] });
    expect(out.data).toEqual(['Arrived — 2026-11-04T12:30Z — bus alert']);
  });

  it('answers "-- none" for an empty feed', async () => {
    expect((await brief({ notifications: [] })).data).toEqual(['-- none']);
    expect((await brief({})).data).toEqual(['-- none']);
  });

  it('accepts a bare array payload', async () => {
    expect((await brief([{ title: 'Arrived' }])).data).toEqual(['Arrived — no date — bus alert']);
  });

  it('shows at most 20 lines and says how many were held back', async () => {
    const notifications = Array.from({ length: 25 }, (_, i) => ({
      title: `N${i}`,
      creationDate: `2026-11-${String(i + 1).padStart(2, '0')}T08:00:00`,
    }));
    const lines = (await brief({ notifications })).data as string[];
    expect(lines).toHaveLength(21);
    expect(lines[0]).toBe('N24 — 2026-11-25T08:00 — bus alert');
    expect(lines[20]).toBe('-- 20 of 25 shown');
  });

  it('leaves the default answer unchanged (the whole payload, fenced)', async () => {
    const upstream = { notifications: [{ title: 'Arrived' }] };
    harness = await createTestHarness((server) => registerNotificationTools(server, fakeClient(upstream)));
    const result = await harness.callTool('alphaportal_list_notifications', {});
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text) as Record<string, unknown>;
    expect(parsed.untrusted_content).toBe(true);
    expect(parsed.notifications).toEqual(upstream.notifications);
  });
});
