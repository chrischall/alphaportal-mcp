import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { confirmTokenParam, minifiedResult } from '@chrischall/mcp-utils';
import type { AlphaPortalClient } from '../client.js';
import { WRITE } from '../endpoints.js';
import { confirmWrite } from './_confirm.js';

/**
 * The five notification categories the portal exposes, each togglable per
 * channel (push / email) and per run (AM / PM). Field names and the 0/1 wire
 * encoding are transcribed from the AlphaPortal web client — see
 * `docs/ALPHAPORTAL-API.md`. Only the categories a district enables (see
 * `alphaportal_get_settings`) take effect.
 */
const CATEGORY_PREFIX = {
  stopRadiusEntry: 'stopRadiusEntry',
  studentScan: 'studentScan',
  backupBus: 'backupBus',
  schoolArrival: 'schoolArrival',
  stopServiced: 'stopServiced',
} as const;

const channelSchema = z
  .object({
    pushAm: z.boolean().optional(),
    pushPm: z.boolean().optional(),
    emailAm: z.boolean().optional(),
    emailPm: z.boolean().optional(),
  })
  .describe('Push/email toggles for the AM and PM runs.');

const bool01 = (v: boolean | undefined): number | undefined => (v === undefined ? undefined : v ? 1 : 0);

/** Flatten the structured preferences into the flat 0/1 wire body. */
export function buildNotificationBody(args: {
  studentId: number;
  studentOriginalId?: string;
  preferences: Partial<Record<keyof typeof CATEGORY_PREFIX, z.infer<typeof channelSchema>>>;
}): Record<string, unknown> {
  const body: Record<string, unknown> = { studentId: args.studentId };
  if (args.studentOriginalId !== undefined) body.studentOriginalId = args.studentOriginalId;
  for (const [category, prefix] of Object.entries(CATEGORY_PREFIX)) {
    const p = args.preferences[category as keyof typeof CATEGORY_PREFIX];
    if (!p) continue;
    const set = (field: string, value: number | undefined) => {
      if (value !== undefined) body[field] = value;
    };
    set(`${prefix}NotifyAm`, bool01(p.pushAm));
    set(`${prefix}NotifyPm`, bool01(p.pushPm));
    set(`${prefix}EmailAm`, bool01(p.emailAm));
    set(`${prefix}EmailPm`, bool01(p.emailPm));
  }
  return body;
}

export function registerWriteTools(server: McpServer, client: AlphaPortalClient): void {
  server.registerTool(
    'alphaportal_edit_walk_radius',
    {
      description:
        "Set a student's walk-zone radius, in meters. This can affect transportation eligibility, so it asks the user to confirm first: a confirmation prompt where the client supports one; otherwise the first call returns a preview of the exact payload and a confirmToken, and only a repeat call with that token proceeds (see MCP_CONFIRM_MODE). Verified required fields: studentId, radius.",
      annotations: { readOnlyHint: false, destructiveHint: true },
      inputSchema: z.object({
        studentId: z.number().int().describe('The numeric studentId.'),
        radiusMeters: z
          .number()
          .int()
          .nonnegative()
          .describe('Walk-zone radius in meters (the API stores the base-unit distance).'),
        confirmToken: confirmTokenParam,
      }),
    },
    async ({ studentId, radiusMeters, confirmToken }, ctx) => {
      const body = { studentId, radius: radiusMeters };
      const gate = await confirmWrite(ctx, {
        tool: 'alphaportal_edit_walk_radius',
        actionId: 'alphaportal.edit_walk_radius',
        label: 'Edit walk-zone radius',
        message: 'Review and confirm this walk-zone radius change:',
        path: WRITE.radiusEdit,
        target: String(studentId),
        body,
        confirmToken,
      });
      if (gate) return gate;
      return minifiedResult(await client.write(WRITE.radiusEdit, body));
    },
  );

  server.registerTool(
    'alphaportal_set_notification',
    {
      description:
        "Set a student's transportation notification preferences (push/email, per AM/PM run) across the categories the district enables: stopRadiusEntry, studentScan, backupBus, schoolArrival, stopServiced. Asks the user to confirm first: a confirmation prompt where the client supports one; otherwise the first call returns a preview of the exact payload and a confirmToken, and only a repeat call with that token proceeds (see MCP_CONFIRM_MODE). NOTE: the portal sends the whole preference set at once; categories you omit may be left unchanged or reset by the server — review the preview first.",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
      inputSchema: z.object({
        studentId: z.number().int().describe('The numeric studentId.'),
        studentOriginalId: z
          .string()
          .describe("The student's originalId (from alphaportal_list_students), if known.")
          .optional(),
        preferences: z
          .object({
            stopRadiusEntry: channelSchema.optional(),
            studentScan: channelSchema.optional(),
            backupBus: channelSchema.optional(),
            schoolArrival: channelSchema.optional(),
            stopServiced: channelSchema.optional(),
          })
          .describe('Per-category push/email toggles.'),
        confirmToken: confirmTokenParam,
      }),
    },
    async ({ studentId, studentOriginalId, preferences, confirmToken }, ctx) => {
      const body = buildNotificationBody({ studentId, studentOriginalId, preferences });
      const gate = await confirmWrite(ctx, {
        tool: 'alphaportal_set_notification',
        actionId: 'alphaportal.set_notification',
        label: 'Set notification preferences',
        message: 'Review and confirm these notification preference changes:',
        path: WRITE.setNotification,
        target: String(studentId),
        body,
        confirmToken,
      });
      if (gate) return gate;
      return minifiedResult(await client.write(WRITE.setNotification, body));
    },
  );
}
