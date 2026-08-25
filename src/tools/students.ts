import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult } from '@chrischall/mcp-utils';
import type { AlphaPortalClient } from '../client.js';
import { READ } from '../endpoints.js';

const studentIdSchema = z
  .number()
  .int()
  .describe('The numeric studentId (from alphaportal_list_students).');

/** AM/PM run selector; the API takes 0 (AM) / 1 (PM) as a path segment. */
const shiftSchema = z
  .enum(['AM', 'PM'])
  .describe('Which run to track: AM (to school) or PM (home).');

export function registerStudentTools(server: McpServer, client: AlphaPortalClient): void {
  server.registerTool(
    'alphaportal_list_students',
    {
      description:
        'List the students (children) on the signed-in account, with grade, school, and transportation flags. Start here to get each studentId.',
      annotations: { readOnlyHint: true },
      inputSchema: {},
    },
    async () => textResult(await client.read(READ.studentList)),
  );

  server.registerTool(
    'alphaportal_get_student',
    {
      description:
        "Get a student's full transportation detail: assigned school plus morning and afternoon stops with times and calendars.",
      annotations: { readOnlyHint: true },
      inputSchema: { studentId: studentIdSchema },
    },
    async ({ studentId }) =>
      textResult(await client.read(READ.studentRetrieve, { pathSuffix: `/${studentId}` })),
  );

  server.registerTool(
    'alphaportal_get_student_stops',
    {
      description:
        "Get a student's assigned bus stops — stop name, scheduled time, days of the week, and stop location (lat/lng) for each.",
      annotations: { readOnlyHint: true },
      inputSchema: { studentId: studentIdSchema },
    },
    async ({ studentId }) =>
      textResult(await client.read(READ.studentStops, { pathSuffix: `/${studentId}` })),
  );

  server.registerTool(
    'alphaportal_get_bus_location',
    {
      description:
        "Get the live GPS location of a student's bus for the selected run (AM or PM): latitude, longitude, speed, and the vehicle id. Returns the last known position; empty when the bus is not currently running.",
      annotations: { readOnlyHint: true },
      inputSchema: { studentId: studentIdSchema, shift: shiftSchema },
    },
    async ({ studentId, shift }) => {
      const shiftCode = shift === 'PM' ? 1 : 0;
      return textResult(
        await client.read(READ.vehicleLocation, { pathSuffix: `/${studentId}/${shiftCode}` }),
      );
    },
  );

  server.registerTool(
    'alphaportal_get_report_link',
    {
      description:
        "Get a one-time PDF download link for a student's transportation report (stops, schedule). Returns a URL to open in a browser.",
      annotations: { readOnlyHint: true },
      inputSchema: { studentId: studentIdSchema },
    },
    async ({ studentId }) =>
      textResult(await client.read(READ.reportsBulk, { query: { studentId } })),
  );
}
