import type { McpServer } from '@modelcontextprotocol/server';
import { registerCredentialHealthcheckTool } from '@chrischall/mcp-utils/healthcheck';
import type { AlphaPortalClient } from '../client.js';
import { BASE_URL, READ } from '../endpoints.js';

const HOST = new URL(BASE_URL).host;

/**
 * Register `alphaportal_healthcheck` — resolves the refresh token the way real
 * tools do (env → saved session → signed-in tab via the browser bridge), then
 * makes one authenticated profile read.
 *
 * AlphaPortal uses the bridge only to BOOTSTRAP the refresh token; every
 * request after that is a plain API call. So health is about the credential,
 * and the failures worth telling apart are: nothing resolved a token,
 * AlphaPortal rejected the one we have, a CDN/WAF refused the request before
 * the API saw it, or AlphaPortal is down. `alphaportal_session_status` answers
 * only "authenticated or not"; this is the fleet-standard diagnostic.
 *
 * The profile read is the probe because it is the cheapest authenticated call
 * and it forces the refresh-token → access-token exchange, so it exercises the
 * whole auth path rather than just the stored credential.
 */
export function registerHealthcheckTools(server: McpServer, client: AlphaPortalClient): void {
  registerCredentialHealthcheckTool({
    server,
    prefix: 'alphaportal',
    hostLabel: HOST,
    probePath: READ.profile,
    resolveCredential: () => client.describeCredential(),
    probeFn: () => client.read(READ.profile, { method: 'POST', body: {} }),
    hints: {
      credential_rejected:
        'AlphaPortal rejected the refresh token (expired or revoked). Sign back in at your AlphaPortal host (e.g. https://cmsnc.alphaportal.app/) so the ContextMint Bridge extension can re-read it, or re-capture it with JSON.parse(localStorage.user).User.RefreshToken and update ALPHAPORTAL_REFRESH_TOKEN.',
    },
  });
}
