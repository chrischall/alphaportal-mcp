import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { client } from '../src/client.js';
import { registerStudentTools } from '../src/tools/students.js';
import { registerNotificationTools } from '../src/tools/notifications.js';
import { registerReferenceTools } from '../src/tools/reference.js';
import { registerWriteTools } from '../src/tools/writes.js';
import { registerSessionTools } from '../src/tools/session.js';
import { createTestHarness } from './helpers.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const EXPECTED = [
  'alphaportal_list_students',
  'alphaportal_get_student',
  'alphaportal_get_student_stops',
  'alphaportal_get_bus_location',
  'alphaportal_get_report_link',
  'alphaportal_list_notifications',
  'alphaportal_get_profile',
  'alphaportal_get_account',
  'alphaportal_get_settings',
  'alphaportal_list_schools',
  'alphaportal_list_grades',
  'alphaportal_list_requests',
  'alphaportal_edit_walk_radius',
  'alphaportal_set_notification',
  'alphaportal_session_status',
];

describe('tool registry', () => {
  let harness: Awaited<ReturnType<typeof createTestHarness>>;
  let names: string[];

  beforeAll(async () => {
    harness = await createTestHarness((server) => {
      registerStudentTools(server, client);
      registerNotificationTools(server, client);
      registerReferenceTools(server, client);
      registerWriteTools(server, client);
      registerSessionTools(server, client);
    });
    names = (await harness.listTools()).map((t) => t.name);
  });

  afterAll(async () => {
    if (harness) await harness.close();
  });

  it('registers exactly the expected tools', () => {
    for (const name of EXPECTED) expect(names).toContain(name);
    expect(names).toHaveLength(EXPECTED.length);
  });

  it('manifest.json roster equals the registered roster (both directions)', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8')) as {
      tools: { name: string; description: string }[];
    };
    const manifestNames = manifest.tools.map((t) => t.name).sort();
    expect(manifestNames).toEqual([...names].sort());
    for (const t of manifest.tools) {
      expect(t.description, `blank description for ${t.name}`).toBeTruthy();
    }
  });
});
