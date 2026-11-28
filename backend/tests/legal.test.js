import test from 'node:test';
import assert from 'node:assert/strict';
import { legalDetails } from '../src/lib/legal.js';

test('legal pages stay hidden until an operator and a contact are both named', () => {
  assert.equal(legalDetails({}), null);
  assert.equal(legalDetails({ LEGAL_NAME: 'Acme' }), null);
  assert.equal(legalDetails({ LEGAL_CONTACT: 'a@b.example' }), null);
  assert.deepEqual(legalDetails({ LEGAL_NAME: 'Acme', LEGAL_CONTACT: 'a@b.example' }), { name: 'Acme', contact: 'a@b.example', law: null, retention: null, updated: null });
});
