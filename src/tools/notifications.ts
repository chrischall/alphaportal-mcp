import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult } from '@chrischall/mcp-utils';
import type { AlphaPortalClient } from '../client.js';
import { READ } from '../endpoints.js';

export function registerNotificationTools(server: McpServer, client: AlphaPortalClient): void {
  server.registerTool(
    'alphaportal_list_notifications',
    {
      description:
        'List the account\'s transportation notifications — arrival/departure alerts (e.g. "arrived at school") with title, body, the student, and timestamp.',
      annotations: { readOnlyHint: true },
      inputSchema: {},
    },
    async () => textResult(await client.read(READ.notificationsList)),
  );
}
