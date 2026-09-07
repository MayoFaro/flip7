// tests/engine.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_VALUES, SHOE_BASE, MODIFIERS_TOTAL, ACTIONS_TOTAL } from '../app/deck.mjs';
import { createEmptySeen } from '../app/shoe.mjs';
import { createEmptyLine, addCardToLine, addLucky13Card } from '../app/line.mjs';
import { computeBuckets, assertPartition } from '../app/engine.mjs';

// Builds a shoe where only the given values/kinds still have copies left,
// everything else has been fully seen. Makes small, hand-checkable scenarios.
function fullSeenExcept(remainingSpec) {
  const seen = createEmptySeen();
  for (const v of CARD_VALUES) {
    const remReg = remainingSpec[v]?.regular ?? 0;
    const remSpec = remainingSpec[v]?.special ?? 0;
    seen[v] = {
      regular: SHOE_BASE[v].regular - remReg,
      special: SHOE_BASE[v].special - remSpec,
    };
  }
  seen.other = MODIFIERS_TOTAL + ACTIONS_TOTAL;
  return seen;
}

test('fresh shoe and empty line: nothing can bust yet', () => {
  const seen = createEmptySeen();
  const line = createEmptyLine();
  const buckets = computeBuckets(seen, line);
  assert.doesNotThrow(() => assertPartition(buckets));
  assert.equal(buckets.D, 108);
  assert.equal(buckets.R, 0);
  assert.equal(buckets.M, 16);
  assert.equal(buckets.S, 92);
});

test('holding a plain value makes its remaining copies bust risk', () => {
  const seen = fullSeenExcept({ 9: { regular: 8 } }); // 1 of the 9 copies already "held"
  let line = createEmptyLine();
  line = addCardToLine(line, 9);
  const buckets = computeBuckets(seen, line);
  assert.doesNotThrow(() => assertPartition(buckets));
  assert.equal(buckets.R, 8);
});

test('holding only the Lucky 13 does not put a regular 13 at risk (regression)', () => {
  const seen = fullSeenExcept({ 13: { regular: 12 } }); // Lucky 13 already held, all regular 13s still out there
  let line = createEmptyLine();
  line = addLucky13Card(line);
  const buckets = computeBuckets(seen, line);
  assert.doesNotThrow(() => assertPartition(buckets));
  assert.equal(buckets.R, 0); // a regular 13 now would be the sanctioned safe pairing, not a bust
  assert.equal(buckets.S, 12);
});

test('holding a regular 13 puts every remaining regular 13 at risk', () => {
  const seen = fullSeenExcept({ 13: { regular: 11 } }); // one regular 13 already held
  let line = createEmptyLine();
  line = addCardToLine(line, 13);
  const buckets = computeBuckets(seen, line);
  assert.doesNotThrow(() => assertPartition(buckets));
  assert.equal(buckets.R, 11);
});

test('holding both the regular and Lucky 13 makes any further regular 13 a bust', () => {
  const seen = fullSeenExcept({ 13: { regular: 11 } });
  let line = createEmptyLine();
  line = addCardToLine(line, 13);
  line = addLucky13Card(line);
  const buckets = computeBuckets(seen, line);
  assert.doesNotThrow(() => assertPartition(buckets));
  assert.equal(buckets.R, 11); // the third 13 always busts
});

test('Unlucky 7 is a reset risk (U), not a bust risk (R), when the line is non-empty', () => {
  const seen = fullSeenExcept({ 7: { special: 1 } });
  let line = createEmptyLine();
  line = addCardToLine(line, 3);
  const buckets = computeBuckets(seen, line);
  assert.doesNotThrow(() => assertPartition(buckets));
  assert.equal(buckets.U, 1);
  assert.equal(buckets.R, 0);
});

test('Unlucky 7 folds into safe progress (S) when the line is still empty', () => {
  const seen = fullSeenExcept({ 7: { special: 1 } });
  const line = createEmptyLine();
  const buckets = computeBuckets(seen, line);
  assert.doesNotThrow(() => assertPartition(buckets));
  assert.equal(buckets.U, 0);
  assert.equal(buckets.S, 1);
});

test('assertPartition throws if buckets are inconsistent', () => {
  assert.throws(() => assertPartition({ R: 1, U: 1, S: 1, M: 1, D: 5 }), /Partition invariant violated/);
});

test('partition invariant holds for a fully exhausted shoe', () => {
  const seen = fullSeenExcept({}); // nothing left of anything
  const line = createEmptyLine();
  const buckets = computeBuckets(seen, line);
  assert.doesNotThrow(() => assertPartition(buckets));
  assert.equal(buckets.D, 0);
});
