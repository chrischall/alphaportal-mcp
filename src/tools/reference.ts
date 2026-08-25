import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult } from '@chrischall/mcp-utils';
import type { AlphaPortalClient } from '../client.js';
import { READ } from '../endpoints.js';

/**
 * Account-level and district-reference reads: the signed-in profile, account
 * metadata, portal settings, the school directory, grades, distance units, and
 * the caller's submitted transportation requests.
 */
export function registerReferenceTools(server: McpServer, client: AlphaPortalClient): void {
  server.registerTool(
    'alphaportal_get_profile',
    {
      description: 'Get the signed-in user profile (name, email, role, account).',
      annotations: { readOnlyHint: true },
      inputSchema: {},
    },
    async () => textResult(await client.read(READ.profile, { method: 'POST', body: {} })),
  );

  server.registerTool(
    'alphaportal_get_account',
    {
      description:
        'Get the account (school district) info — name, timezone, date/phone formats — and the current server date.',
      annotations: { readOnlyHint: true },
      inputSchema: {},
    },
    async () => {
      const [account, date] = await Promise.all([
        client.read(READ.accountInfo),
        client.read(READ.accountDate),
      ]);
      return textResult({ account, date });
    },
  );

  server.registerTool(
    'alphaportal_get_settings',
    {
      description:
        'Get the portal feature/visibility settings (which notification types and features are enabled for this district).',
      annotations: { readOnlyHint: true },
      inputSchema: {},
    },
    async () => textResult(await client.read(READ.applicationSetting)),
  );

  server.registerTool(
    'alphaportal_list_schools',
    {
      description:
        'List all schools in the district with names and coordinates (lat/lng). Useful for resolving a school by name.',
      annotations: { readOnlyHint: true },
      inputSchema: {},
    },
    async () => textResult(await client.read(READ.schoolLightList)),
  );

  server.registerTool(
    'alphaportal_list_grades',
    {
      description: 'List the district grade levels (id + name).',
      annotations: { readOnlyHint: true },
      inputSchema: {},
    },
    async () => textResult(await client.read(READ.gradeList)),
  );

  server.registerTool(
    'alphaportal_list_requests',
    {
      description:
        'List the transportation requests submitted on this account, with tracking numbers and status.',
      annotations: { readOnlyHint: true },
      inputSchema: {},
    },
    async () => textResult(await client.read(READ.requestList)),
  );
}
