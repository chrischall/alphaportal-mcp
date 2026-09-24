import type { CallToolResult, InputRequiredResult, ServerContext } from '@modelcontextprotocol/server';
import { confirmationFromEnv, requireConfirmationWithFallback } from '@chrischall/mcp-utils';

/**
 * Confirm-gate for a mutating tool. A client that can show a confirmation
 * prompt is asked; one that cannot gets the two-phase token flow (phase 1
 * returns a preview of exactly what would be sent plus a `confirmToken`, and
 * only a repeat call with that token proceeds) — governed by
 * `MCP_CONFIRM_MODE`. Returns `undefined` to proceed with the write, otherwise
 * the result to return unchanged.
 *
 * AlphaPortal writes change a real child's transportation records (notification
 * preferences, walk-zone radius) or submit a request to the district, so a
 * single hallucinated call must never fire silently. Request bodies here are
 * transcribed from the AlphaPortal web client (`docs/ALPHAPORTAL-API.md`); the
 * preview lets a human eyeball the exact payload before approving it, and the
 * token is bound to that payload so a changed argument is refused.
 */
export function confirmWrite(
  ctx: ServerContext,
  opts: {
    tool: string;
    /** `<service>.<verb>` action id. */
    actionId: string;
    /** Human-readable action label shown in the preview. */
    label: string;
    message: string;
    path: string;
    /** The primary id the write acts on. */
    target: string;
    body: Record<string, unknown>;
    confirmToken: string | undefined;
  },
): Promise<InputRequiredResult | CallToolResult | undefined> {
  const preview = { action: opts.label, method: 'POST', path: opts.path, willSend: opts.body };
  return requireConfirmationWithFallback(
    ctx,
    confirmationFromEnv({
      action: opts.actionId,
      message: opts.message,
      details: preview,
      tool: opts.tool,
      confirmToken: opts.confirmToken,
      subject: () => ({ target: opts.target, payload: opts.body, preview }),
    }),
  );
}
