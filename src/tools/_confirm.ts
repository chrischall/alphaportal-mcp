import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { schemaConfirm, textResult } from '@chrischall/mcp-utils';

export { schemaConfirm };

/**
 * Confirm-gate for a mutating tool (the fleet convention). When `confirm` is not
 * `true`, returns a no-network dry-run preview of exactly what would be sent;
 * when it is `true`, returns `null` so the caller proceeds with the write.
 *
 * AlphaPortal writes change a real child's transportation records (notification
 * preferences, walk-zone radius) or submit a request to the district, so a
 * single hallucinated call must never fire silently. Request bodies here are
 * transcribed from the AlphaPortal web client (`docs/ALPHAPORTAL-API.md`); the
 * dry-run preview lets a human eyeball the exact payload before opting in.
 */
export function previewUnlessConfirmed(
  confirm: boolean | undefined,
  action: string,
  method: string,
  path: string,
  body?: unknown,
): CallToolResult | null {
  if (confirm === true) return null;
  return textResult({
    dryRun: true,
    action,
    method,
    path,
    ...(body !== undefined ? { willSend: body } : {}),
    note: 'Re-run with confirm: true to execute.',
  });
}
