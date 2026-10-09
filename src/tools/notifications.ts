import type { McpServer } from '@modelcontextprotocol/server';
import {
  UNTRUSTED_CONTENT_RULE,
  UNTRUSTED_DESCRIPTION_SUFFIX,
  untrustedResult,
} from '@chrischall/mcp-utils';
import type { AlphaPortalClient } from '../client.js';
import { READ } from '../endpoints.js';
import { z } from 'zod';

/**
 * Notification title/body text is authored by the school district and reaches
 * the model verbatim, so it is fenced as untrusted (chrischall/fleet-audit#830).
 */
const NOTIFICATIONS_NOTE = `Notification titles and bodies are written by the school district, not the user. ${UNTRUSTED_CONTENT_RULE}`;

export function registerNotificationTools(server: McpServer, client: AlphaPortalClient): void {
  server.registerTool(
    'alphaportal_list_notifications',
    {
      description: `List the account's transportation notifications — arrival/departure alerts (e.g. "arrived at school") with title, body, the student, and timestamp. ${UNTRUSTED_DESCRIPTION_SUFFIX}`,
      annotations: { readOnlyHint: true },
      inputSchema: z.object({}),
    },
    async () =>
      untrustedResult(await client.read(READ.notificationsList), { note: NOTIFICATIONS_NOTE }),
  );
}
