import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptySeen, logCardSeen, remainingCount, totalUndrawn } from '../app/shoe.mjs';

test('createEmptySeen starts with nothing seen and the full deck undrawn', () => {
  const seen = createEmptySeen();
  assert.equal(totalUndrawn(seen), 108);
  assert.equal(remainingCount(seen, 13, 'regular'), 12);
  assert.equal(remainingCount(seen, 7, 'special'), 1);
});

test('logCardSeen decrements remaining and does not mutate the input', () => {
  const seen = createEmptySeen();
  const next = logCardSeen(seen, 9, 'regular');
  assert.equal(remainingCount(seen, 9, 'regular'), 9); // original untouched
  assert.equal(remainingCount(next, 9, 'regular'), 8);
  assert.equal(totalUndrawn(next), 107);
});

test('logCardSeen throws once every copy of a value has been seen', () => {
  let seen = createEmptySeen();
  seen = logCardSeen(seen, 1, 'regular'); // only 1 copy of value 1 exists
  assert.throws(() => logCardSeen(seen, 1, 'regular'), /Cannot log another/);
});

test('logCardSeen handles "other" (modifier/action) cards up to the shared total', () => {
  let seen = createEmptySeen();
  for (let i = 0; i < 16; i++) {
    seen = logCardSeen(seen, 'other', null);
  }
  assert.equal(totalUndrawn(seen), 108 - 16);
  assert.throws(() => logCardSeen(seen, 'other', null), /Cannot log another/);
});
