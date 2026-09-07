// tests/engine.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_VALUES, SHOE_BASE, MODIFIERS_TOTAL, ACTIONS_TOTAL } from '../app/deck.mjs';
import { createEmptySeen } from '../app/shoe.mjs';
import { createEmptyLine, addCardToLine, addLucky13Card } from '../app/line.mjs';
import { computeBuckets, assertPartition } from '../app/engine.mjs';
import { computeProbabilities, computeExpectedValue, recommend } from '../app/engine.mjs';

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

// Deterministic PRNG (mulberry32) so this property test is reproducible in CI
// while still exercising thousands of distinct states.
function mulberry32(seed) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('partition invariant D = R + U + S + M holds for arbitrary shoe/line states (property test)', () => {
  const rand = mulberry32(0xf71f7c0);
  const randInt = (max) => Math.floor(rand() * (max + 1)); // inclusive 0..max
  const plainValues = CARD_VALUES.filter((v) => v !== 7 && v !== 13);
  const ITERATIONS = 2000;

  for (let i = 0; i < ITERATIONS; i++) {
    // Randomize seen: every regular/special count independently within its
    // shoe base, plus a random count of "other" (modifier/action) cards.
    const seen = { other: randInt(MODIFIERS_TOTAL + ACTIONS_TOTAL) };
    for (const v of CARD_VALUES) {
      seen[v] = {
        regular: randInt(SHOE_BASE[v].regular),
        special: randInt(SHOE_BASE[v].special),
      };
    }

    // Randomize line: deliberately does NOT constrain itself to "reachable"
    // states (e.g. a value can be "held" even if no copy is marked seen) —
    // the partition invariant must hold structurally for any input, per the
    // spec's "arbitrary states" wording.
    const values = new Set();
    if (rand() < 0.5) values.add(0); // randomly hold The Zero
    if (rand() < 0.5) values.add(7); // randomly hold a 7
    for (let k = 0; k < 4; k++) {
      const v = plainValues[randInt(plainValues.length - 1)];
      if (rand() < 0.5) values.add(v);
    }
    const hasRegular13 = rand() < 0.5;
    if (hasRegular13) values.add(13);
    const hasLucky13 = rand() < 0.5;

    const line = { values, hasRegular13, hasLucky13, cardCount: values.size };

    const buckets = computeBuckets(seen, line);
    const repro = `seen=${JSON.stringify(seen)} line=${JSON.stringify({
      values: [...values],
      hasRegular13,
      hasLucky13,
    })}`;
    assert.doesNotThrow(
      () => assertPartition(buckets),
      `iteration ${i}: partition invariant violated for ${repro} -> buckets=${JSON.stringify(buckets)}`
    );
  }
});

test('computeProbabilities converts buckets to percentages of the shoe', () => {
  const probs = computeProbabilities({ R: 10, U: 0, S: 90, M: 8, D: 108 });
  assert.equal(probs.bust, 10 / 108);
  assert.equal(probs.progress, 90 / 108);
  assert.equal(probs.neutral, 8 / 108);
});

test('computeProbabilities returns zeros for an exhausted shoe', () => {
  const probs = computeProbabilities({ R: 0, U: 0, S: 0, M: 0, D: 0 });
  assert.deepEqual(probs, { bust: 0, reset: 0, progress: 0, neutral: 0 });
});

test('computeExpectedValue matches a hand-computed value in a near-empty shoe', () => {
  const seen = fullSeenExcept({ 5: { regular: 2 } }); // only two safe 5s left, D=2
  const line = createEmptyLine();
  const ev = computeExpectedValue(seen, line);
  assert.equal(ev, 5); // both remaining cards are a safe new "5" (0 + 5)
});

test('computeExpectedValue weighs bust risk against a genuinely safe draw', () => {
  let line = createEmptyLine();
  line = addCardToLine(line, 9); // rawScore = 9
  const seen = fullSeenExcept({ 9: { regular: 1 }, 5: { regular: 1 } }); // D=2
  const ev = computeExpectedValue(seen, line);
  assert.equal(ev, 7); // 0.5 * 0 (bust) + 0.5 * (9 + 5)
});

test('recommend advises HIT when the only remaining card is a guaranteed safe gain', () => {
  let line = createEmptyLine();
  line = addCardToLine(line, 2); // rawScore = 2, staying banks only 2
  const seen = fullSeenExcept({ 9: { regular: 1 } }); // D=1, guaranteed safe +9
  const result = recommend(seen, line);
  assert.equal(result.action, 'HIT');
  assert.equal(result.ev, 11);
});

test('recommend advises STAY when the only remaining card would bust', () => {
  let line = createEmptyLine();
  line = addCardToLine(line, 9); // rawScore = 9
  const seen = fullSeenExcept({ 9: { regular: 1 } }); // D=1, the only card left busts
  const result = recommend(seen, line);
  assert.equal(result.probabilities.bust, 1);
  assert.equal(result.ev, 0);
  assert.equal(result.action, 'STAY');
});

test('the Flip 7 bonus applies even when Lucky 13 completes the 7th card without a new distinct value', () => {
  let line = createEmptyLine();
  for (const v of [1, 2, 3, 4, 5, 13]) {
    line = addCardToLine(line, v); // 6 cards held, "13" already among them
  }
  const rawScoreBefore = 1 + 2 + 3 + 4 + 5 + 13; // 28
  const seen = fullSeenExcept({ 13: { special: 1 } }); // only the Lucky 13 remains, D=1
  const ev = computeExpectedValue(seen, line);
  // Lucky 13 adds 13 points, doesn't grow distinct-value count, but does push
  // cardCount from 6 to 7, so the 15-point Flip 7 bonus must still apply.
  assert.equal(ev, rawScoreBefore + 13 + 15);
});
