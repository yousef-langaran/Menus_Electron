#!/usr/bin/env node
/**
 * Generates TypeScript types from the backend's OpenAPI contract.
 *
 *   yarn api:types                       # reads ../Menus_BE/docs/api/openapi.json
 *   API_SPEC=<path|url> yarn api:types   # any other file or URL
 *
 * The contract itself is produced (and checked in CI) in the backend repo with
 * `yarn openapi:export`. After a backend API change: export there, then run this
 * here and commit the regenerated src/types/api.generated.ts.
 *
 * openapi-typescript is run through npx with a pinned version so it needs no
 * lockfile entry (and works for Windows and Linux alike).
 */
const { spawnSync } = require('child_process');
const path = require('path');

const OPENAPI_TYPESCRIPT_VERSION = '7.13.0';
const root = path.resolve(__dirname, '..');
const spec = process.env.API_SPEC || path.resolve(root, '..', 'Menus_BE', 'docs', 'api', 'openapi.json');
const out = path.resolve(root, 'src', 'types', 'api.generated.ts');

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['--yes', `openapi-typescript@${OPENAPI_TYPESCRIPT_VERSION}`, spec, '-o', out],
  { stdio: 'inherit', cwd: root },
);
process.exit(result.status ?? 1);
