import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { READ, WRITE } from '../src/endpoints.js';

const SRC = join(__dirname, '..', 'src');
const source = [
  readFileSync(join(SRC, 'client.ts'), 'utf8'),
  ...readdirSync(join(SRC, 'tools')).map((f) => readFileSync(join(SRC, 'tools', f), 'utf8')),
].join('\n');

describe('endpoint catalog', () => {
  // The catalog is the server's real surface: an endpoint no tool calls is dead
  // code that misleads a reviewer (the unexposed WRITE entries read as gated
  // writes that do not exist). Unused endpoints belong in docs/ALPHAPORTAL-API.md.
  it.each(Object.keys(READ))('READ.%s is used by the server', (key) => {
    expect(source).toMatch(new RegExp(`\\bREAD\\.${key}\\b`));
  });
  it.each(Object.keys(WRITE))('WRITE.%s is used by a confirm-gated tool', (key) => {
    expect(source).toMatch(new RegExp(`\\bWRITE\\.${key}\\b`));
  });
});
