import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonOutput, summarizeAuthStatus, isIngressAddress } from '../lib.js';

test('parseJsonOutput reads plain and log-prefixed JSON', () => {
  assert.deepEqual(parseJsonOutput('{"a":1}'), { a: 1 });
  assert.deepEqual(parseJsonOutput('some log line\n{\n  "a": 1\n}\n'), { a: 1 });
  assert.equal(parseJsonOutput(''), null);
  assert.equal(parseJsonOutput('no json here'), null);
});

test('summarizeAuthStatus maps the auth_status envelope', () => {
  assert.deepEqual(
    summarizeAuthStatus({ ok: false, kind: 'auth_status', error: { code: 'not_authenticated' } }),
    { state: 'disconnected' },
  );
  assert.equal(summarizeAuthStatus({ ok: false, error: { code: 'auth_unavailable' } }).state, 'relay_unreachable');
  const ok = summarizeAuthStatus({
    ok: true,
    data: { authenticated: true, accountLabel: 'me', relayHost: 'relay', machineRegistered: true, daemonRunning: false },
  });
  assert.equal(ok.state, 'connected');
  assert.equal(ok.account, 'me');
  assert.equal(ok.daemonRunning, false);
  assert.equal(summarizeAuthStatus(null).state, 'unknown');
});

test('isIngressAddress only allows the Supervisor ingress proxy', () => {
  assert.equal(isIngressAddress('172.30.32.2'), true);
  assert.equal(isIngressAddress('::ffff:172.30.32.2'), true);
  assert.equal(isIngressAddress('172.30.32.5'), false);
  assert.equal(isIngressAddress(undefined), false);
});
