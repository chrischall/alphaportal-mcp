import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

// These only fail once a tag exists (npm provenance validates repository.url,
// the registry validates the scoped name), so assert them up front.
describe('packaging', () => {
  const pkg = read('package.json');

  it('declares a git repository.url (npm --provenance validates it)', () => {
    expect(pkg.repository?.url).toBe('git+https://github.com/chrischall/alphaportal-mcp.git');
  });

  it('ships dist and skills in the published tarball', () => {
    expect(pkg.files).toContain('dist');
    expect(pkg.files).toContain('skills');
    expect(pkg.files).toContain('.claude-plugin');
  });

  it('exposes a single bin named for the package', () => {
    expect(Object.keys(pkg.bin)).toEqual(['alphaportal-mcp']);
  });

  it('server.json description is within the 100-char registry limit', () => {
    const server = read('server.json');
    expect(server.description.length).toBeLessThanOrEqual(100);
  });

  it('all version-bearing manifests agree with package.json', () => {
    const v = pkg.version;
    expect(read('manifest.json').version).toBe(v);
    expect(read('server.json').version).toBe(v);
    expect(read('server.json').packages[0].version).toBe(v);
    expect(read('.claude-plugin/plugin.json').version).toBe(v);
    expect(read('.claude-plugin/marketplace.json').metadata.version).toBe(v);
    expect(read('.claude-plugin/marketplace.json').plugins[0].version).toBe(v);
    expect(read('.release-please-manifest.json')['.']).toBe(v);
  });
});
