// The fixed-window limiter on its own: counting, separate keys, reset, and the memory cap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLimiter } from '../ratelimit.js';

test('allows up to the limit, then reports seconds to wait', () => {
  let t = 1_000_000;
  const l = createLimiter({ now: () => t });
  for (let i = 0; i < 5; i++) assert.equal(l.take('a', 5, 60_000), 0);
  assert.equal(l.take('a', 5, 60_000), 60);
  t += 30_000;
  assert.equal(l.take('a', 5, 60_000), 30);
  assert.equal(l.take('b', 5, 60_000), 0, 'other keys have their own count');
  t += 30_001;
  assert.equal(l.take('a', 5, 60_000), 0, 'a new window starts');
});

test('expired keys are swept and the key count is capped', () => {
  let t = 0;
  const l = createLimiter({ now: () => t, maxKeys: 100 });
  for (let i = 0; i < 100; i++) l.take('k' + i, 1, 1000);
  assert.equal(l.size(), 100);
  l.take('one-more', 1, 1000);
  assert.ok(l.size() <= 100);
  t += 2000;
  l.sweep();
  assert.equal(l.size(), 0);
});

test('a flood of new keys never resets other route groups, and an address over its limit is the last to go', () => {
  let t = 0;
  const l = createLimiter({ now: () => t, maxKeys: 1000 });
  for (let i = 0; i < 25; i++) l.take('auth:ip:203.0.113.9', 20, 60_000);
  assert.ok(l.take('auth:ip:203.0.113.9', 20, 60_000) > 0, 'blocked');
  // 5000 distinct addresses on another group
  for (let i = 0; i < 5000; i++) l.take('all:ip:k' + i, 300, 60_000);
  assert.ok(l.take('auth:ip:203.0.113.9', 20, 60_000) > 0, 'still blocked after the flood');
  // the same group flooded: the blocked address survives, others under their limit make room
  for (let i = 0; i < 5000; i++) l.take('auth:ip:f' + i, 20, 60_000);
  assert.ok(l.take('auth:ip:203.0.113.9', 20, 60_000) > 0, 'still blocked after a flood in its own group');
  assert.ok(l.size() <= 2000, `memory stays capped per group (${l.size()})`);
});

test('IPv6 addresses count per /64; IPv4 per address', async () => {
  const { ipKey } = await import('../http.js');
  assert.equal(ipKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), '2001:db8:1:2::/64');
  assert.equal(ipKey('2001:db8:1:2::1'), '2001:db8:1:2::/64');
  assert.equal(ipKey('2001:DB8:0001:0002:ffff::'), '2001:db8:1:2::/64');
  assert.equal(ipKey('2001:db8::1'), '2001:db8:0:0::/64');
  assert.equal(ipKey('fe80::1%eth0'), 'fe80:0:0:0::/64');
  assert.equal(ipKey('::ffff:192.0.2.7'), '192.0.2.7');
  assert.equal(ipKey('192.0.2.7'), '192.0.2.7');
  assert.equal(ipKey('64:ff9b::192.0.2.7'), '64:ff9b:0:0::/64');
  assert.notEqual(ipKey('2001:db8:1:2::1'), ipKey('2001:db8:1:3::1'));
});
