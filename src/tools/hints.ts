/**
 * Context-group hints, published on each tool as `_meta.mint` (the mcp-host
 * context-groups contract, `mintHintSchema`). Inert data: a host that does not
 * read them sees an extra `_meta` key and nothing else. The shape is fixed by
 * the host's contract, so it is restated here rather than imported — this
 * server takes no dependency on mcp-host.
 *
 * Every tool here is in the `school` group (school-bus transportation). The one
 * canonical read is the notifications feed, for "what's new" — arrival and
 * departure alerts. Nothing here answers "what's due" or "what's on". There is
 * no `subject`: the students can only be listed after the refresh token is
 * resolved, which may need the browser bridge, and this server does no I/O at
 * boot; the brief lines name the student instead.
 */
export type MintIntent =
  | 'whats-new' | 'whats-due' | 'whats-on' | 'lookup' | 'turn-on-off' | 'send' | 'change' | 'other';

export interface MintHint {
  domain: 'school';
  intent: MintIntent;
  canonical?: true;
  subject?: string;
  when?: { start: string; end: string };
  /** Words a person says. Lowercase, at most 8, each at most 40 chars. */
  aliases?: string[];
}

/** `_meta` for an AlphaPortal tool. */
export function schoolMeta(
  intent: MintIntent,
  extra: Omit<MintHint, 'domain' | 'intent'> = {},
): { mint: MintHint } {
  return { mint: { domain: 'school', intent, ...extra } };
}
