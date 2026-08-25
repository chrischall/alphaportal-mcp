import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult } from '@chrischall/mcp-utils';
import type { AlphaPortalClient } from '../client.js';

/**
 * A credential-free health/status read: is a refresh token configured, and can
 * a fresh access token actually be minted? Never returns a token or any part of
 * one — only booleans and the profile's public name, so it is safe to call for
 * a "am I signed in?" check.
 */
export function registerSessionTools(server: McpServer, client: AlphaPortalClient): void {
  server.registerTool(
    'alphaportal_session_status',
    {
      description:
        'Check whether the server has a working AlphaPortal session: whether a refresh token is configured and whether it can currently mint an access token. Returns no credentials.',
      annotations: { readOnlyHint: true },
      inputSchema: {},
    },
    async () => {
      if (!client.isConfigured()) {
        return textResult({
          configured: false,
          authenticated: false,
          note: 'No refresh token configured. Set ALPHAPORTAL_REFRESH_TOKEN (see README).',
        });
      }
      try {
        const profile = await client.read<{ Profile?: { UserName?: string; FullName?: string } }>(
          'AlphaCore/v1/user/profile',
          { method: 'POST', body: {} },
        );
        return textResult({
          configured: true,
          authenticated: true,
          user: profile?.Profile?.UserName ?? profile?.Profile?.FullName ?? null,
        });
      } catch (err) {
        return textResult({
          configured: true,
          authenticated: false,
          note: (err as Error).message,
        });
      }
    },
  );
}
