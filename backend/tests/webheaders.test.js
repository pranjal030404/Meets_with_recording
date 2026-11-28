import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { securityHeaders } from '../src/lib/http.js';

// The web app is served either by this backend or by `serve` (frontend/public/serve.json): same headers.
test('serve.json carries the same security headers as the backend', () => {
  const sent = {};
  securityHeaders({}, { setHeader: (k, v) => { sent[k] = v; } }, () => {});
  const { headers } = JSON.parse(fs.readFileSync(new URL('../../frontend/public/serve.json', import.meta.url)));
  assert.deepEqual(Object.fromEntries(headers[0].headers.map((h) => [h.key, h.value])), sent);
});
