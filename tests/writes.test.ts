import { describe, it, expect, vi } from 'vitest';
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
  async function harnessWithMock() {
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
    const harness = await createTestHarness((server) => registerWriteTools(server, client));
    return { harness, fetchImpl };
  }

  it('radius edit returns a dry-run and makes no write call without confirm', async () => {
    const { harness, fetchImpl } = await harnessWithMock();
    const result = await harness.callTool('alphaportal_edit_walk_radius', {
      studentId: 42,
      radiusMeters: 800,
    });
    const parsed = parseToolResult<{ dryRun: boolean; willSend: unknown }>(result);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.willSend).toEqual({ studentId: 42, radius: 800 });
    // Only the (lazy) nothing — no radius-edit POST happened.
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string);
    expect(calls.some((u) => u.includes('radius-edit'))).toBe(false);
    await harness.close();
  });

  it('radius edit performs the write when confirm:true', async () => {
    const { harness, fetchImpl } = await harnessWithMock();
    await harness.callTool('alphaportal_edit_walk_radius', {
      studentId: 42,
      radiusMeters: 800,
      confirm: true,
    });
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string);
    expect(calls.some((u) => u.includes('radius-edit'))).toBe(true);
    await harness.close();
  });

  it('set_notification dry-run shows the flattened body', async () => {
    const { harness } = await harnessWithMock();
    const result = await harness.callTool('alphaportal_set_notification', {
      studentId: 7,
      preferences: { schoolArrival: { pushAm: true } },
    });
    const parsed = parseToolResult<{ dryRun: boolean; willSend: Record<string, unknown> }>(result);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.willSend).toMatchObject({ studentId: 7, schoolArrivalNotifyAm: 1 });
    await harness.close();
  });
});
