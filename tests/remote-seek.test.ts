import test from 'node:test';
import assert from 'node:assert/strict';
import { RemoteSeek, remoteKey } from '../lib/remote-seek';

test('short right presses seek once, even with repeat events', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const jumps: number[] = [];
  const remote = new RemoteSeek({ rate: () => 1, speedUp: () => assert.fail('must not accelerate'), normal: () => {}, seek: delta => jumps.push(delta) });
  remote.down('ArrowRight'); t.mock.timers.tick(200); remote.down('ArrowRight'); remote.up('ArrowRight');
  t.mock.timers.tick(1000);
  assert.deepEqual(jumps, [15]);
});

test('hold starts at 2x, repeats do not accelerate, separate presses reach 8x', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let rate = 1; const jumps: number[] = [];
  const remote = new RemoteSeek({ rate: () => rate, speedUp: () => { rate = Math.min(8, rate * 2); }, normal: () => { rate = 1; }, seek: delta => jumps.push(delta) });
  remote.down('ArrowRight'); t.mock.timers.tick(500); assert.equal(rate, 2);
  for (let i = 0; i < 20; i++) remote.down('ArrowRight');
  assert.equal(rate, 2); remote.up('ArrowRight'); assert.deepEqual(jumps, []);
  remote.down('ArrowRight'); remote.up('ArrowRight'); assert.equal(rate, 4);
  remote.down('ArrowRight'); remote.up('ArrowRight'); assert.equal(rate, 8);
  remote.down('ArrowRight'); remote.up('ArrowRight'); assert.equal(rate, 8);
  remote.down('ArrowLeft'); remote.up('ArrowLeft'); assert.equal(rate, 1); assert.deepEqual(jumps, [-15]);
});

test('loss of focus cancels a pending hold; legacy remote codes are normalized', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const remote = new RemoteSeek({ rate: () => 1, speedUp: () => assert.fail('cancelled'), normal: () => {}, seek: () => assert.fail('cancelled') });
  remote.down('ArrowRight'); remote.cancel(); t.mock.timers.tick(1000); remote.up('ArrowRight');
  assert.equal(remoteKey({ key: 'Unidentified', keyCode: 39 }), 'ArrowRight');
  assert.equal(remoteKey({ key: 'Unidentified', keyCode: 10009 }), 'Escape');
});
