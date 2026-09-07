import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptySeen, logCardSeen, logSpecialCardSeen, remainingCount, totalUndrawn } from '../app/shoe.mjs';
import { MODIFIER_TYPES, ACTION_TYPES } from '../app/deck.mjs';

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

test('createEmptySeen initializes every modifier and action type to 0', () => {
  const seen = createEmptySeen();
  for (const id of Object.keys(MODIFIER_TYPES)) assert.equal(seen.modifierTypes[id], 0);
  for (const id of Object.keys(ACTION_TYPES)) assert.equal(seen.actionTypes[id], 0);
});

test('logSpecialCardSeen increments the specific type and recomputes other', () => {
  let seen = createEmptySeen();
  seen = logSpecialCardSeen(seen, 'modifier', 'minus2');
  assert.equal(seen.modifierTypes.minus2, 1);
  assert.equal(seen.other, 1);
  seen = logSpecialCardSeen(seen, 'action', 'swap');
  assert.equal(seen.actionTypes.swap, 1);
  assert.equal(seen.other, 2);
});

test('logSpecialCardSeen throws once a specific type reaches its own max, even though the combined "other" max (16) is far from reached', () => {
  let seen = createEmptySeen();
  seen = logSpecialCardSeen(seen, 'modifier', 'minus2'); // max 1
  assert.throws(() => logSpecialCardSeen(seen, 'modifier', 'minus2'), /Cannot log another minus2/);
});

test('logSpecialCardSeen does not mutate the input', () => {
  const seen = createEmptySeen();
  logSpecialCardSeen(seen, 'action', 'steal');
  assert.equal(seen.actionTypes.steal, 0);
});

test('logCardSeen (the pre-existing "other" path) still works and leaves modifierTypes/actionTypes untouched', () => {
  let seen = createEmptySeen();
  seen = logCardSeen(seen, 'other', null);
  assert.equal(seen.other, 1);
  assert.equal(seen.modifierTypes.minus2, 0);
});
