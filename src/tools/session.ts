import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult } from '@chrischall/mcp-utils';
import type { AlphaPortalClient } from '../client.js';

/**
 * A credential-free health/status read: can the server currently authenticate?
 * It attempts a real profile read (which resolves the refresh token — from env,
 * the store, or the browser bridge — and mints an access token). Never returns
 * a token or any part of one; only booleans, how the token was obtained, and
 * the profile's public name.
 */
export function registerSessionTools(server: McpServer, client: AlphaPortalClient): void {
  server.registerTool(
    'alphaportal_session_status',
    {
      description:
        'Check whether the server can authenticate to AlphaPortal: it resolves the refresh token (from ALPHAPORTAL_REFRESH_TOKEN, the saved session, or a signed-in browser tab via the bridge) and tries to mint an access token. Returns no credentials.',
      annotations: { readOnlyHint: true },
      inputSchema: {},
    },
    async () => {
      try {
        const profile = await client.read<{ Profile?: { UserName?: string; FullName?: string } }>(
          'AlphaCore/v1/user/profile',
          { method: 'POST', body: {} },
        );
        return textResult({
          authenticated: true,
          authSource: client.currentAuthSource(),
          user: profile?.Profile?.UserName ?? profile?.Profile?.FullName ?? null,
        });
      } catch (err) {
        return textResult({
          authenticated: false,
          hasStaticToken: client.hasStaticToken(),
          note: (err as Error).message,
        });
      }
    },
  );
}
