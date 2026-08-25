#!/usr/bin/env node
import { runMcp } from '@chrischall/mcp-utils';
import { client } from './client.js';
import { VERSION } from './version.js';
import { registerStudentTools } from './tools/students.js';
import { registerNotificationTools } from './tools/notifications.js';
import { registerReferenceTools } from './tools/reference.js';
import { registerWriteTools } from './tools/writes.js';
import { registerSessionTools } from './tools/session.js';

// runMcp builds the McpServer, applies the registrars (threading `client`
// through as deps), prints the banner to stderr, wires graceful shutdown, and
// connects the stdio transport. The AlphaPortal client is a module-level
// singleton constructed in ./client.js that defers its config error to the
// first request — so the server boots and answers the host's install-time
// tools/list smoke test even when ALPHAPORTAL_REFRESH_TOKEN is absent. A hosted
// per-user deployment injects its own per-request client into the same
// registrars instead of this singleton.
await runMcp({
  name: 'alphaportal-mcp',
  version: VERSION,
  deps: client,
  banner:
    '[alphaportal-mcp] This project was developed and is maintained by AI. Use at your own discretion.',
  tools: [
    registerStudentTools,
    registerNotificationTools,
    registerReferenceTools,
    registerWriteTools,
    registerSessionTools,
  ],
});
