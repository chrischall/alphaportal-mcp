import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TestHarnessOptions } from '@chrischall/mcp-utils/test';
import { buildNotificationBody } from '../src/tools/writes.js';
import { AlphaPortalClient } from '../src/client.js';
import { nullSessionIO } from '../src/session.js';
import { registerWriteTools } from '../src/tools/writes.js';
import { createTestHarness, parseToolResult } from './helpers.js';

function jwt(exp: number): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS512' })}.${b64({ exp })}.sig`;
}
const FUTURE = Math.floor(Date.now() / 1000) + 3600;

describe('buildNotificationBody', () => {
  it('flattens categories to the 0/1 wire fields and includes studentId', () => {
    const body = buildNotificationBody({
      studentId: 218652901,
      studentOriginalId: '4895683826',
      preferences: {
        schoolArrival: { pushAm: true, pushPm: false, emailAm: true },
        stopServiced: { pushPm: true },
      },
    });
    expect(body).toMatchObject({
      studentId: 218652901,
      studentOriginalId: '4895683826',
      schoolArrivalNotifyAm: 1,
      schoolArrivalNotifyPm: 0,
      schoolArrivalEmailAm: 1,
      stopServicedNotifyPm: 1,
    });
    // Omitted channels are not sent (partial update is explicit).
    expect(body).not.toHaveProperty('schoolArrivalEmailPm');
    expect(body).not.toHaveProperty('backupBusNotifyAm');
  });

  it('omits studentOriginalId when not provided', () => {
    const body = buildNotificationBody({ studentId: 1, preferences: {} });
    expect(body).toEqual({ studentId: 1 });
  });
});

describe('write tools confirm gate', () => {
  const ENV_KEYS = ['MCP_CONFIRM_MODE', 'MCP_CONFIRM_TTL_SECONDS', 'MCP_CONFIRM_SECRET'] as const;
  let savedEnv: Record<string, string | undefined>;
  beforeEach(() => {
    savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  async function harnessWithMock(options?: TestHarnessOptions) {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/public/refresh-token'))
        return new Response(
          JSON.stringify({ success: true, data: { token: jwt(FUTURE), refreshToken: jwt(FUTURE) } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      return new Response(JSON.stringify({ success: true, data: { ok: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const client = new AlphaPortalClient({ refreshToken: jwt(FUTURE), sessionIO: nullSessionIO, fetchImpl });
    const harness = await createTestHarness((server) => registerWriteTools(server, client), options);
    const calls = (fragment: string) =>
      (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls
        .map((c) => c[0] as string)
        .filter((u) => u.includes(fragment)).length;
    return { harness, fetchImpl, calls };
  }

  type PhaseOne = {
    status: string;
    confirmToken: string;
    preview: { action: string; method: string; path: string; willSend: Record<string, unknown> };
  };
  const text = (r: { content?: unknown }) =>
    ((r.content as Array<{ type: string; text: string }>)[0]?.text ?? '');

  it('radius edit phase 1 returns a preview + token and makes no write call', async () => {
    const { harness, calls } = await harnessWithMock();
    const result = await harness.callTool('alphaportal_edit_walk_radius', {
      studentId: 42,
      radiusMeters: 800,
    });
    const parsed = parseToolResult<PhaseOne>(result);
    expect(parsed.status).toBe('confirmation-required');
    expect(parsed.confirmToken).toEqual(expect.any(String));
    expect(parsed.preview).toEqual({
      action: 'Edit walk-zone radius',
      method: 'POST',
      path: 'AlphaPortal/v1/user-students/radius-edit',
      willSend: { studentId: 42, radius: 800 },
    });
    expect(calls('radius-edit')).toBe(0);
    await harness.close();
  });

  it('radius edit phase 2 with the token performs the write exactly once', async () => {
    const { harness, calls } = await harnessWithMock();
    const args = { studentId: 42, radiusMeters: 800 };
    const { confirmToken } = parseToolResult<PhaseOne>(
      await harness.callTool('alphaportal_edit_walk_radius', args),
    );
    const result = await harness.callTool('alphaportal_edit_walk_radius', { ...args, confirmToken });
    expect(result.isError).toBeFalsy();
    expect(parseToolResult<{ ok: boolean }>(result)).toEqual({ ok: true });
    expect(calls('radius-edit')).toBe(1);
    await harness.close();
  });

  it('replaying a used token is refused as TOKEN_REUSED with no second write', async () => {
    const { harness, calls } = await harnessWithMock();
    const args = { studentId: 42, radiusMeters: 800 };
    const { confirmToken } = parseToolResult<PhaseOne>(
      await harness.callTool('alphaportal_edit_walk_radius', args),
    );
    await harness.callTool('alphaportal_edit_walk_radius', { ...args, confirmToken });
    const replay = await harness.callTool('alphaportal_edit_walk_radius', { ...args, confirmToken });
    expect(text(replay)).toContain('TOKEN_REUSED');
    expect(calls('radius-edit')).toBe(1);
    await harness.close();
  });

  it('changing an argument between the phases is refused as DRAFT_CHANGED with no write', async () => {
    const { harness, calls } = await harnessWithMock();
    const { confirmToken } = parseToolResult<PhaseOne>(
      await harness.callTool('alphaportal_edit_walk_radius', { studentId: 42, radiusMeters: 800 }),
    );
    const changed = await harness.callTool('alphaportal_edit_walk_radius', {
      studentId: 42,
      radiusMeters: 1600,
      confirmToken,
    });
    expect(text(changed)).toContain('DRAFT_CHANGED');
    expect(calls('radius-edit')).toBe(0);
    await harness.close();
  });

  it('a client that accepts the elicitation prompt gets the write', async () => {
    const { harness, calls } = await harnessWithMock({
      elicitation: async () => ({ action: 'accept', content: { confirmed: true } }),
    });
    await harness.callTool('alphaportal_edit_walk_radius', { studentId: 42, radiusMeters: 800 });
    expect(calls('radius-edit')).toBe(1);
    await harness.close();
  });

  it('a client that declines the elicitation prompt gets no write', async () => {
    const { harness, calls } = await harnessWithMock({
      elicitation: async () => ({ action: 'decline' }),
    });
    await harness.callTool('alphaportal_edit_walk_radius', { studentId: 42, radiusMeters: 800 });
    expect(calls('radius-edit')).toBe(0);
    await harness.close();
  });

  it('MCP_CONFIRM_MODE=refuse refuses on a client that cannot be prompted', async () => {
    process.env.MCP_CONFIRM_MODE = 'refuse';
    const { harness, calls } = await harnessWithMock();
    const result = await harness.callTool('alphaportal_edit_walk_radius', {
      studentId: 42,
      radiusMeters: 800,
    });
    expect(parseToolResult<{ reason: string }>(result).reason).toBe('confirmation-unsupported');
    expect(calls('radius-edit')).toBe(0);
    await harness.close();
  });

  it('set_notification is annotated destructive + idempotent (fleet-audit#44)', async () => {
    // A partial body can reset the categories it omits (e.g. turn off a
    // child's schoolArrival alerts), and the confirmation is model-mediated on
    // clients without prompts, so the annotation is the host-side safeguard.
    const { harness } = await harnessWithMock();
    const { tools } = await harness.client.listTools();
    const tool = tools.find((t) => t.name === 'alphaportal_set_notification');
    expect(tool?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
    });
    await harness.close();
  });

  it('no write tool still accepts a confirm parameter', async () => {
    const { harness } = await harnessWithMock();
    const { tools } = await harness.client.listTools();
    for (const t of tools) {
      const props = (t.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
      expect(props).not.toHaveProperty('confirm');
      expect(props).toHaveProperty('confirmToken');
    }
    await harness.close();
  });

  it('set_notification phase 1 previews the flattened body and makes no write call', async () => {
    const { harness, calls } = await harnessWithMock();
    const result = await harness.callTool('alphaportal_set_notification', {
      studentId: 7,
      preferences: { schoolArrival: { pushAm: true } },
    });
    const parsed = parseToolResult<PhaseOne>(result);
    expect(parsed.status).toBe('confirmation-required');
    expect(parsed.preview).toMatchObject({
      action: 'Set notification preferences',
      method: 'POST',
      path: 'AlphaPortal/v1/user-students/setnotification',
    });
    expect(parsed.preview.willSend).toMatchObject({ studentId: 7, schoolArrivalNotifyAm: 1 });
    expect(calls('setnotification')).toBe(0);
    await harness.close();
  });

  it('set_notification phase 2 with the token performs the write exactly once', async () => {
    const { harness, calls } = await harnessWithMock();
    const args = { studentId: 7, preferences: { schoolArrival: { pushAm: true } } };
    const { confirmToken } = parseToolResult<PhaseOne>(
      await harness.callTool('alphaportal_set_notification', args),
    );
    const result = await harness.callTool('alphaportal_set_notification', { ...args, confirmToken });
    expect(result.isError).toBeFalsy();
    expect(calls('setnotification')).toBe(1);
    await harness.close();
  });
});
