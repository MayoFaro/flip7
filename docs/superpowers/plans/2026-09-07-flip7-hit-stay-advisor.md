# Flip 7 Hit/Stay Advisor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a client-only PWA that a player runs on their phone during a physical game of *Flip 7 – With a Vengeance*, logging cards as they're revealed, and getting back an exact bust probability and a hit/stay recommendation.

**Architecture:** Pure-function decision engine (deck composition → shared "seen" tally → bucket partition → probabilities/EV) with zero DOM dependencies, unit tested with Node's built-in test runner. A thin `app.mjs` wires that engine to a plain, unstyled DOM (visual design deferred to a follow-up pass) and to `localStorage` for persistence across page reloads. No backend, no build step, no dependencies.

**Tech Stack:** Vanilla JavaScript ES modules (`.mjs`), `node --test` for unit tests, a static `manifest.json` + service worker for PWA installability. No npm packages, no bundler.

**Spec:** [docs/superpowers/specs/2026-09-07-flip7-card-counter-design.md](../specs/2026-09-07-flip7-card-counter-design.md)

## Global Constraints

- Zero runtime dependencies: plain ES modules only, no npm install, no bundler, no framework.
- Tests use Node's built-in `node:test` + `node:assert/strict` — no test framework dependency.
- Deck composition constants must exactly match the spec's table: 92 Number cards (13→12, 12→12, 11→11, 10→10, 9→9, 8→8, 7→6, 6→6, 5→5, 4→4, 3→3, 2→2, 1→1, plus The Zero, Unlucky 7, Lucky 13 at 1 each), 6 Modifier cards, 10 Action cards — 108 total.
- The shared "seen" tally persists across rounds and is reset only by an explicit reshuffle action, never automatically at round end (per spec).
- `hasRegular13` / `hasLucky13` must be tracked as two separate booleans, not a single counter (see spec's Data Model section for why a counter is wrong).
- All state-mutating functions in `app/shoe.mjs` and `app/line.mjs` return new objects; they never mutate their input (this is what makes single-level undo correct — see spec).
- UI in this plan is intentionally plain/unstyled (functional grids of buttons) — visual design is explicitly deferred to a follow-up pass, per the approved spec.

---

## File Structure

```
app/
  deck.mjs        — deck composition constants (pure data)
  shoe.mjs        — shared "seen" tally: create/update/query
  line.mjs        — the player's own line: create/update/score
  engine.mjs       — bucket partition, probabilities, EV, recommendation
  storage.mjs      — localStorage persistence for shoe + line
  app.mjs          — DOM wiring (grids, event handlers, render loop)
  index.html       — page shell (empty containers, filled by app.mjs)
  style.css        — minimal functional styling
  manifest.json    — PWA manifest
  icon.svg         — placeholder app icon
  sw.js            — service worker (offline cache)
tests/
  deck.test.mjs
  shoe.test.mjs
  line.test.mjs
  engine.test.mjs
  storage.test.mjs
```

---

### Task 1: Deck composition constants

**Files:**
- Create: `app/deck.mjs`
- Test: `tests/deck.test.mjs`

**Interfaces:**
- Produces: `CARD_VALUES: number[]` (0..13), `SHOE_BASE: { [value]: { regular: number, special: number } }`, `MODIFIERS_TOTAL: number`, `ACTIONS_TOTAL: number`, `TOTAL_CARDS: number`.

- [ ] **Step 1: Write the failing test**

```js
// tests/deck.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_VALUES, SHOE_BASE, MODIFIERS_TOTAL, ACTIONS_TOTAL, TOTAL_CARDS } from '../app/deck.mjs';

test('deck totals 108 cards', () => {
  assert.equal(TOTAL_CARDS, 108);
});

test('card values run from 0 to 13', () => {
  assert.deepEqual(CARD_VALUES, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
});

test('special number cards are counted correctly', () => {
  assert.deepEqual(SHOE_BASE[0], { regular: 0, special: 1 }); // The Zero
  assert.deepEqual(SHOE_BASE[7], { regular: 6, special: 1 }); // Unlucky 7
  assert.deepEqual(SHOE_BASE[13], { regular: 12, special: 1 }); // Lucky 13
});

test('regular copy count equals card value for plain numbers', () => {
  for (const v of [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12]) {
    assert.equal(SHOE_BASE[v].regular, v);
    assert.equal(SHOE_BASE[v].special, 0);
  }
});

test('modifier and action totals match the rulebook', () => {
  assert.equal(MODIFIERS_TOTAL, 6);
  assert.equal(ACTIONS_TOTAL, 10);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/deck.test.mjs`
Expected: FAIL — `Cannot find module '../app/deck.mjs'`

- [ ] **Step 3: Write minimal implementation**

```js
// app/deck.mjs
export const CARD_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export const SHOE_BASE = {
  0: { regular: 0, special: 1 },   // The Zero
  1: { regular: 1, special: 0 },
  2: { regular: 2, special: 0 },
  3: { regular: 3, special: 0 },
  4: { regular: 4, special: 0 },
  5: { regular: 5, special: 0 },
  6: { regular: 6, special: 0 },
  7: { regular: 6, special: 1 },   // Unlucky 7
  8: { regular: 8, special: 0 },
  9: { regular: 9, special: 0 },
  10: { regular: 10, special: 0 },
  11: { regular: 11, special: 0 },
  12: { regular: 12, special: 0 },
  13: { regular: 12, special: 1 }, // Lucky 13
};

export const MODIFIERS_TOTAL = 6; // -2, -4, -6, -8, -10, ÷2 — one copy each
export const ACTIONS_TOTAL = 10;  // Just One More, Swap, Steal, Discard, Flip Four — two copies each

export const TOTAL_CARDS =
  CARD_VALUES.reduce((sum, v) => sum + SHOE_BASE[v].regular + SHOE_BASE[v].special, 0) +
  MODIFIERS_TOTAL +
  ACTIONS_TOTAL;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/deck.test.mjs`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add app/deck.mjs tests/deck.test.mjs
git commit -m "Add Flip 7 deck composition constants"
```

---

### Task 2: Shared "seen" tally module

**Files:**
- Create: `app/shoe.mjs`
- Test: `tests/shoe.test.mjs`

**Interfaces:**
- Consumes: `CARD_VALUES`, `SHOE_BASE`, `MODIFIERS_TOTAL`, `ACTIONS_TOTAL` from `app/deck.mjs`.
- Produces: `createEmptySeen(): Seen`, `logCardSeen(seen: Seen, value: number|'other', kind: 'regular'|'special'|null): Seen`, `remainingCount(seen: Seen, value: number, kind: 'regular'|'special'): number`, `totalUndrawn(seen: Seen): number`.
  `Seen` shape: `{ [0..13]: { regular: number, special: number }, other: number }`.

- [ ] **Step 1: Write the failing test**

```js
// tests/shoe.test.mjs
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/shoe.test.mjs`
Expected: FAIL — `Cannot find module '../app/shoe.mjs'`

- [ ] **Step 3: Write minimal implementation**

```js
// app/shoe.mjs
import { CARD_VALUES, SHOE_BASE, MODIFIERS_TOTAL, ACTIONS_TOTAL } from './deck.mjs';

export function createEmptySeen() {
  const seen = { other: 0 };
  for (const v of CARD_VALUES) {
    seen[v] = { regular: 0, special: 0 };
  }
  return seen;
}

export function logCardSeen(seen, value, kind) {
  const next = { other: seen.other };
  for (const v of CARD_VALUES) next[v] = { ...seen[v] };

  if (value === 'other') {
    const max = MODIFIERS_TOTAL + ACTIONS_TOTAL;
    if (seen.other + 1 > max) {
      throw new Error(`Cannot log another "other" card: all ${max} already seen`);
    }
    next.other = seen.other + 1;
    return next;
  }

  const max = SHOE_BASE[value][kind];
  if (seen[value][kind] + 1 > max) {
    throw new Error(`Cannot log another ${value}/${kind}: all ${max} already seen`);
  }
  next[value][kind] = seen[value][kind] + 1;
  return next;
}

export function remainingCount(seen, value, kind) {
  return SHOE_BASE[value][kind] - seen[value][kind];
}

export function totalUndrawn(seen) {
  let seenTotal = seen.other;
  for (const v of CARD_VALUES) {
    seenTotal += seen[v].regular + seen[v].special;
  }
  const totalCards =
    CARD_VALUES.reduce((sum, v) => sum + SHOE_BASE[v].regular + SHOE_BASE[v].special, 0) +
    MODIFIERS_TOTAL +
    ACTIONS_TOTAL;
  return totalCards - seenTotal;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/shoe.test.mjs`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add app/shoe.mjs tests/shoe.test.mjs
git commit -m "Add shared shoe-tally module with overcount guard"
```

---

### Task 3: Player's own line module

**Files:**
- Create: `app/line.mjs`
- Test: `tests/line.test.mjs`

**Interfaces:**
- Produces: `createEmptyLine(): Line`, `addCardToLine(line: Line, value: number): Line`, `addLucky13Card(line: Line): Line`, `addUnlucky7Card(line: Line): Line`, `computeRawScore(line: Line): number`.
  `Line` shape: `{ values: Set<number>, hasRegular13: boolean, hasLucky13: boolean, cardCount: number }`.

- [ ] **Step 1: Write the failing test**

```js
// tests/line.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyLine, addCardToLine, addLucky13Card, addUnlucky7Card, computeRawScore } from '../app/line.mjs';

test('createEmptyLine starts empty', () => {
  const line = createEmptyLine();
  assert.equal(line.values.size, 0);
  assert.equal(line.hasRegular13, false);
  assert.equal(line.hasLucky13, false);
  assert.equal(line.cardCount, 0);
});

test('addCardToLine adds a distinct value without mutating the original', () => {
  const line = createEmptyLine();
  const next = addCardToLine(line, 9);
  assert.equal(line.values.size, 0);
  assert.ok(next.values.has(9));
  assert.equal(next.cardCount, 1);
});

test('addCardToLine tracks a regular 13 separately from Lucky 13', () => {
  let line = createEmptyLine();
  line = addCardToLine(line, 13);
  assert.equal(line.hasRegular13, true);
  assert.equal(line.hasLucky13, false);
});

test('addLucky13Card can coexist with a regular 13 without a flag collision', () => {
  let line = createEmptyLine();
  line = addCardToLine(line, 13);
  line = addLucky13Card(line);
  assert.equal(line.hasRegular13, true);
  assert.equal(line.hasLucky13, true);
  assert.equal(line.cardCount, 2);
  assert.equal(line.values.size, 1); // still just "13" as a distinct value
});

test('addUnlucky7Card discards everything else and keeps only the 7', () => {
  let line = createEmptyLine();
  line = addCardToLine(line, 9);
  line = addCardToLine(line, 13);
  line = addUnlucky7Card(line);
  assert.deepEqual([...line.values], [7]);
  assert.equal(line.hasRegular13, false);
  assert.equal(line.cardCount, 1);
});

test('computeRawScore sums held values', () => {
  let line = createEmptyLine();
  line = addCardToLine(line, 9);
  line = addCardToLine(line, 4);
  assert.equal(computeRawScore(line), 13);
});

test('computeRawScore adds 13 twice when both the regular and Lucky 13 are held', () => {
  let line = createEmptyLine();
  line = addCardToLine(line, 13);
  line = addLucky13Card(line);
  assert.equal(computeRawScore(line), 26);
});

test('computeRawScore is zero while holding the Zero card before completing Flip 7', () => {
  let line = createEmptyLine();
  line = addCardToLine(line, 0);
  line = addCardToLine(line, 9);
  assert.equal(computeRawScore(line), 0);
});

test('computeRawScore counts normally once Flip 7 is completed, even with the Zero', () => {
  let line = createEmptyLine();
  for (const v of [0, 1, 2, 3, 4, 5, 6]) {
    line = addCardToLine(line, v);
  }
  assert.equal(line.cardCount, 7);
  assert.equal(computeRawScore(line), 21); // 0+1+2+3+4+5+6
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/line.test.mjs`
Expected: FAIL — `Cannot find module '../app/line.mjs'`

- [ ] **Step 3: Write minimal implementation**

```js
// app/line.mjs
export function createEmptyLine() {
  return { values: new Set(), hasRegular13: false, hasLucky13: false, cardCount: 0 };
}

export function addCardToLine(line, value) {
  const values = new Set(line.values);
  values.add(value);
  return {
    values,
    hasRegular13: line.hasRegular13 || value === 13,
    hasLucky13: line.hasLucky13,
    cardCount: line.cardCount + 1,
  };
}

export function addLucky13Card(line) {
  const values = new Set(line.values);
  values.add(13);
  return {
    values,
    hasRegular13: line.hasRegular13,
    hasLucky13: true,
    cardCount: line.cardCount + 1,
  };
}

export function addUnlucky7Card(line) {
  return { values: new Set([7]), hasRegular13: false, hasLucky13: false, cardCount: 1 };
}

export function computeRawScore(line) {
  const hasZero = line.values.has(0);
  const completedFlip7 = line.cardCount >= 7;
  if (hasZero && !completedFlip7) return 0;

  let sum = 0;
  for (const v of line.values) sum += v;
  if (line.hasRegular13 && line.hasLucky13) sum += 13; // count the second 13 too
  return sum;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/line.test.mjs`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add app/line.mjs tests/line.test.mjs
git commit -m "Add player line module with Lucky 13 / Unlucky 7 handling"
```

---

### Task 4: Decision engine — bucket partition

**Files:**
- Create: `app/engine.mjs`
- Test: `tests/engine.test.mjs`

**Interfaces:**
- Consumes: `CARD_VALUES, MODIFIERS_TOTAL, ACTIONS_TOTAL` from `app/deck.mjs`; `remainingCount, totalUndrawn` from `app/shoe.mjs`.
- Produces: `computeBuckets(seen: Seen, line: Line): { R: number, U: number, S: number, M: number, D: number }`, `assertPartition(buckets): void` (throws on violation).

This task and Task 5 share one test file (`tests/engine.test.mjs`), built up incrementally.

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/engine.test.mjs`
Expected: FAIL — `Cannot find module '../app/engine.mjs'`

- [ ] **Step 3: Write minimal implementation**

```js
// app/engine.mjs
import { CARD_VALUES, MODIFIERS_TOTAL, ACTIONS_TOTAL } from './deck.mjs';
import { remainingCount, totalUndrawn } from './shoe.mjs';

export function computeBuckets(seen, line) {
  const D = totalUndrawn(seen);
  let R = 0;
  let U = 0;
  let S = 0;

  for (const v of CARD_VALUES) {
    const remReg = remainingCount(seen, v, 'regular');
    const remSpec = remainingCount(seen, v, 'special');

    if (v === 7) {
      if (line.values.has(7)) {
        R += remReg;
      } else {
        S += remReg;
      }
      if (line.values.size === 0) {
        S += remSpec; // empty line: Unlucky 7 is just a normal safe first card
      } else {
        U += remSpec; // non-empty line: drawing it resets the line
      }
      continue;
    }

    if (v === 13) {
      if (line.hasRegular13) {
        R += remReg; // a further regular 13 always busts once you hold one
      } else {
        S += remReg;
      }
      S += remSpec; // Lucky 13 never busts, regardless of hasRegular13
      continue;
    }

    if (line.values.has(v)) {
      R += remReg;
    } else {
      S += remReg + remSpec; // covers The Zero (v=0) too: remReg is always 0 there
    }
  }

  const M = MODIFIERS_TOTAL + ACTIONS_TOTAL - seen.other;

  return { R, U, S, M, D };
}

export function assertPartition(buckets) {
  const { R, U, S, M, D } = buckets;
  if (R + U + S + M !== D) {
    throw new Error(
      `Partition invariant violated: R(${R})+U(${U})+S(${S})+M(${M}) = ${R + U + S + M} !== D(${D})`
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/engine.test.mjs`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add app/engine.mjs tests/engine.test.mjs
git commit -m "Add decision engine bucket partition with Lucky 13 fix"
```

---

### Task 5: Decision engine — probabilities, expected value, recommendation

**Files:**
- Modify: `app/engine.mjs`
- Modify: `tests/engine.test.mjs`

**Interfaces:**
- Consumes: `computeRawScore` from `app/line.mjs`; everything from Task 4.
- Produces: `computeProbabilities(buckets): { bust: number, reset: number, progress: number, neutral: number }`, `computeExpectedValue(seen: Seen, line: Line): number`, `recommend(seen: Seen, line: Line): { buckets, probabilities, ev: number, rawScore: number, action: 'HIT'|'STAY' }`.

- [ ] **Step 1: Add the failing tests**

Append to `tests/engine.test.mjs` (add this import alongside the existing ones at the top):

```js
import { computeProbabilities, computeExpectedValue, recommend } from '../app/engine.mjs';
```

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/engine.test.mjs`
Expected: FAIL — `computeProbabilities is not a function` (etc.)

- [ ] **Step 3: Write minimal implementation**

Append to `app/engine.mjs` (add this import alongside the existing one at the top):

```js
import { computeRawScore } from './line.mjs';
```

```js
export function computeProbabilities(buckets) {
  const { R, U, S, M, D } = buckets;
  if (D === 0) return { bust: 0, reset: 0, progress: 0, neutral: 0 };
  return { bust: R / D, reset: U / D, progress: S / D, neutral: M / D };
}

function isSafeCard(line, v, kind) {
  if (v === 13 && kind === 'special') return true;      // Lucky 13 never busts
  if (v === 13 && kind === 'regular') return !line.hasRegular13;
  if (v === 7 && kind === 'regular') return !line.values.has(7);
  return !line.values.has(v);
}

export function computeExpectedValue(seen, line) {
  const D = totalUndrawn(seen);
  const rawScore = computeRawScore(line);
  if (D === 0) return rawScore;

  let ev = 0;

  for (const v of CARD_VALUES) {
    for (const kind of ['regular', 'special']) {
      const rem = remainingCount(seen, v, kind);
      if (rem === 0) continue;

      if (v === 7 && kind === 'special') {
        if (line.values.size === 0) {
          const bonus = line.cardCount + 1 === 7 ? 15 : 0;
          ev += (rem / D) * (rawScore + 7 + bonus);
        } else {
          ev += (rem / D) * 7; // reset outcome: score drops to just the 7
        }
        continue;
      }

      if (!isSafeCard(line, v, kind)) continue; // bust card contributes 0

      const bonus = line.cardCount + 1 === 7 ? 15 : 0;
      ev += (rem / D) * (rawScore + v + bonus);
    }
  }

  const M = MODIFIERS_TOTAL + ACTIONS_TOTAL - seen.other;
  ev += (M / D) * rawScore;

  return ev;
}

export function recommend(seen, line) {
  const buckets = computeBuckets(seen, line);
  assertPartition(buckets);
  const probabilities = computeProbabilities(buckets);
  const ev = computeExpectedValue(seen, line);
  const rawScore = computeRawScore(line);
  const action = ev > rawScore ? 'HIT' : 'STAY';
  return { buckets, probabilities, ev, rawScore, action };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/engine.test.mjs`
Expected: PASS (16 tests)

- [ ] **Step 5: Commit**

```bash
git add app/engine.mjs tests/engine.test.mjs
git commit -m "Add EV calculation and hit/stay recommendation"
```

---

### Task 6: LocalStorage persistence

**Files:**
- Create: `app/storage.mjs`
- Test: `tests/storage.test.mjs`

**Interfaces:**
- Consumes: `createEmptySeen` from `app/shoe.mjs`; `createEmptyLine` from `app/line.mjs`.
- Produces: `loadSeen(store?): Seen`, `saveSeen(seen, store?): void`, `resetSeen(store?): void`, `loadLine(store?): Line`, `saveLine(line, store?): void`, `clearLine(store?): void`. All default `store` to the global `localStorage`; tests inject a fake store.

- [ ] **Step 1: Write the failing test**

```js
// tests/storage.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSeen, saveSeen, resetSeen, loadLine, saveLine, clearLine } from '../app/storage.mjs';
import { createEmptyLine, addCardToLine } from '../app/line.mjs';
import { createEmptySeen, logCardSeen } from '../app/shoe.mjs';

function createFakeStore() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
}

test('loadSeen returns an empty shoe when nothing is stored', () => {
  const store = createFakeStore();
  assert.deepEqual(loadSeen(store), createEmptySeen());
});

test('saveSeen then loadSeen round-trips the shoe state', () => {
  const store = createFakeStore();
  const seen = logCardSeen(createEmptySeen(), 9, 'regular');
  saveSeen(seen, store);
  assert.deepEqual(loadSeen(store), seen);
});

test('resetSeen clears stored shoe state', () => {
  const store = createFakeStore();
  saveSeen(logCardSeen(createEmptySeen(), 9, 'regular'), store);
  resetSeen(store);
  assert.deepEqual(loadSeen(store), createEmptySeen());
});

test('saveLine then loadLine round-trips the Set as an array and back', () => {
  const store = createFakeStore();
  let line = createEmptyLine();
  line = addCardToLine(line, 9);
  line = addCardToLine(line, 13);
  saveLine(line, store);
  const reloaded = loadLine(store);
  assert.deepEqual([...reloaded.values].sort(), [9, 13]);
  assert.equal(reloaded.hasRegular13, true);
  assert.equal(reloaded.cardCount, 2);
});

test('clearLine resets stored line to empty', () => {
  const store = createFakeStore();
  saveLine(addCardToLine(createEmptyLine(), 9), store);
  clearLine(store);
  assert.deepEqual(loadLine(store), createEmptyLine());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/storage.test.mjs`
Expected: FAIL — `Cannot find module '../app/storage.mjs'`

- [ ] **Step 3: Write minimal implementation**

```js
// app/storage.mjs
import { createEmptySeen } from './shoe.mjs';
import { createEmptyLine } from './line.mjs';

const SEEN_KEY = 'flip7.shoe.seen.v1';
const LINE_KEY = 'flip7.myLine.v1';

export function loadSeen(store = localStorage) {
  const raw = store.getItem(SEEN_KEY);
  return raw ? JSON.parse(raw) : createEmptySeen();
}

export function saveSeen(seen, store = localStorage) {
  store.setItem(SEEN_KEY, JSON.stringify(seen));
}

export function resetSeen(store = localStorage) {
  store.removeItem(SEEN_KEY);
}

export function loadLine(store = localStorage) {
  const raw = store.getItem(LINE_KEY);
  if (!raw) return createEmptyLine();
  const parsed = JSON.parse(raw);
  return {
    values: new Set(parsed.values),
    hasRegular13: parsed.hasRegular13,
    hasLucky13: parsed.hasLucky13,
    cardCount: parsed.cardCount,
  };
}

export function saveLine(line, store = localStorage) {
  store.setItem(
    LINE_KEY,
    JSON.stringify({
      values: [...line.values],
      hasRegular13: line.hasRegular13,
      hasLucky13: line.hasLucky13,
      cardCount: line.cardCount,
    })
  );
}

export function clearLine(store = localStorage) {
  store.removeItem(LINE_KEY);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/storage.test.mjs`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add app/storage.mjs tests/storage.test.mjs
git commit -m "Add localStorage persistence for shoe and line state"
```

---

### Task 7: PWA shell (markup, styling, manifest)

**Files:**
- Create: `app/index.html`
- Create: `app/style.css`
- Create: `app/manifest.json`
- Create: `app/icon.svg`

No unit tests here (static markup/config); verified visually in Step 3.

**Interfaces:**
- Produces: DOM containers `#result-panel` (with children `#prob-bust`, `#prob-reset`, `#prob-progress`, `#prob-neutral`, `#raw-score`, `#ev-value`, `#recommendation`), `#controls` (with buttons `#undo-btn`, `#new-round-btn`, `#reshuffle-btn`, `#new-game-btn`), `#seen-grid`, `#line-grid`, `#manual-edit` — all consumed by `app/app.mjs` in Task 8.

- [ ] **Step 1: Write `app/index.html`**

```html
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Flip 7 – Assistant</title>
  <link rel="manifest" href="manifest.json" />
  <link rel="icon" href="icon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <h1>Flip 7 – Assistant hit/stay</h1>

  <section id="result-panel">
    <p>Bust : <span id="prob-bust">–</span>%</p>
    <p>Reset (Malchance 7) : <span id="prob-reset">–</span>%</p>
    <p>Progression : <span id="prob-progress">–</span>%</p>
    <p>Neutre : <span id="prob-neutral">–</span>%</p>
    <p>Score actuel (si stay) : <span id="raw-score">0</span></p>
    <p>Valeur espérée (si hit) : <span id="ev-value">0</span></p>
    <p id="recommendation">–</p>
  </section>

  <section id="controls">
    <button id="undo-btn">Annuler dernière action</button>
    <button id="new-round-btn">Nouveau round</button>
    <button id="reshuffle-btn">Reshuffle (deck épuisé)</button>
    <button id="new-game-btn">Nouvelle partie</button>
  </section>

  <section id="seen-grid">
    <h2>Cartes vues qui ne restent pas dans ma ligne</h2>
    <p>Cartes des autres joueurs, ou l'une de mes propres cartes si je viens de buster (elle compte quand même comme vue, mais ne va pas dans "ma ligne").</p>
  </section>

  <section id="line-grid">
    <h2>Cartes que je garde dans ma ligne ce round</h2>
    <p>Compte automatiquement aussi comme vue.</p>
  </section>

  <section id="manual-edit">
    <h2>Correction manuelle du nombre de cartes vues</h2>
  </section>

  <script type="module" src="app.mjs"></script>
</body>
</html>
```

- [ ] **Step 2: Write `app/style.css`**

```css
:root {
  color-scheme: dark;
}

body {
  margin: 0;
  padding: 1rem;
  font-family: system-ui, sans-serif;
  background: #1b1f3b;
  color: #f4f4f4;
}

section {
  margin-bottom: 1.5rem;
}

#seen-grid, #line-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

#seen-grid button, #line-grid button {
  min-width: 3rem;
  min-height: 3rem;
  font-size: 1.1rem;
}

#manual-edit label {
  display: block;
  margin-bottom: 0.25rem;
}

#result-panel p {
  margin: 0.25rem 0;
}

#recommendation {
  font-size: 1.5rem;
  font-weight: bold;
}
```

- [ ] **Step 3: Write `app/manifest.json` and `app/icon.svg`, then verify visually**

```json
{
  "name": "Flip 7 - Assistant hit/stay",
  "short_name": "Flip7 Assistant",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#1b1f3b",
  "theme_color": "#1b1f3b",
  "icons": [
    { "src": "icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" }
  ]
}
```

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="24" fill="#1b1f3b"/>
  <text x="96" y="118" font-family="sans-serif" font-size="72" font-weight="bold" fill="#f4c95d" text-anchor="middle">F7</text>
</svg>
```

Run: `python3 -m http.server 8000 --directory app`, open `http://localhost:8000/index.html` in a browser.
Expected: page loads with the title, empty section headers, and three control buttons visible (no console errors about missing `app.mjs` exports yet — `app.mjs` doesn't exist until Task 8, so a 404 for it in the console at this step is expected and fine).

- [ ] **Step 4: Commit**

```bash
git add app/index.html app/style.css app/manifest.json app/icon.svg
git commit -m "Add PWA shell markup, minimal styling, and manifest"
```

---

### Task 8: Wire the UI to the engine

**Files:**
- Create: `app/app.mjs`

No unit tests here (DOM-dependent); verified manually in Step 2 per this project's UI-testing requirement.

**Interfaces:**
- Consumes: everything produced in Tasks 1–7 (`app/deck.mjs`, `app/shoe.mjs`, `app/line.mjs`, `app/engine.mjs`, `app/storage.mjs`, and the DOM ids from `app/index.html`).

- [ ] **Step 1: Write `app/app.mjs`**

```js
// app/app.mjs
import { CARD_VALUES, SHOE_BASE, MODIFIERS_TOTAL, ACTIONS_TOTAL } from './deck.mjs';
import { createEmptySeen, logCardSeen } from './shoe.mjs';
import { createEmptyLine, addCardToLine, addLucky13Card, addUnlucky7Card } from './line.mjs';
import { recommend } from './engine.mjs';
import { loadSeen, saveSeen, resetSeen, loadLine, saveLine, clearLine } from './storage.mjs';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js');
  });
}

let seen = loadSeen();
let line = loadLine();
let previousState = null;

function snapshot() {
  previousState = { seen, line };
}

function cardLabel(value, kind) {
  if (value === 0) return '0 (Zéro)';
  if (value === 7 && kind === 'special') return '7 – Malchance';
  if (value === 13 && kind === 'special') return '13 – Chance';
  return String(value);
}

function logMyCard(value, kind) {
  snapshot();
  seen = logCardSeen(seen, value, kind);
  if (value === 7 && kind === 'special') {
    line = addUnlucky7Card(line);
  } else if (value === 13 && kind === 'special') {
    line = addLucky13Card(line);
  } else {
    line = addCardToLine(line, value);
  }
  saveSeen(seen);
  saveLine(line);
  render();
}

function logOtherPlayerCard(value, kind) {
  snapshot();
  seen = logCardSeen(seen, value, kind);
  saveSeen(seen);
  render();
}

function logOtherCard() {
  snapshot();
  seen = logCardSeen(seen, 'other', null);
  saveSeen(seen);
  render();
}

function buildSeenGrid() {
  const container = document.getElementById('seen-grid');
  for (const v of CARD_VALUES) {
    for (const kind of ['regular', 'special']) {
      if (SHOE_BASE[v][kind] === 0) continue;
      const btn = document.createElement('button');
      btn.textContent = cardLabel(v, kind);
      btn.addEventListener('click', () => logOtherPlayerCard(v, kind));
      container.appendChild(btn);
    }
  }
  const otherBtn = document.createElement('button');
  otherBtn.textContent = 'Autre (modif/action)';
  otherBtn.addEventListener('click', logOtherCard);
  container.appendChild(otherBtn);
}

function buildLineGrid() {
  const container = document.getElementById('line-grid');
  for (const v of CARD_VALUES) {
    for (const kind of ['regular', 'special']) {
      if (SHOE_BASE[v][kind] === 0) continue;
      const btn = document.createElement('button');
      btn.textContent = cardLabel(v, kind);
      btn.addEventListener('click', () => logMyCard(v, kind));
      container.appendChild(btn);
    }
  }
}

function buildManualEdit() {
  const container = document.getElementById('manual-edit');
  for (const v of CARD_VALUES) {
    for (const kind of ['regular', 'special']) {
      const max = SHOE_BASE[v][kind];
      if (max === 0) continue;
      const label = document.createElement('label');
      label.textContent = `${cardLabel(v, kind)} vues : `;
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.max = String(max);
      input.dataset.value = String(v);
      input.dataset.kind = kind;
      input.addEventListener('change', () => {
        const parsed = Number(input.value);
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) {
          input.value = String(seen[v][kind]);
          return;
        }
        snapshot();
        seen = { ...seen, [v]: { ...seen[v], [kind]: parsed } };
        saveSeen(seen);
        render();
      });
      label.appendChild(input);
      container.appendChild(label);
    }
  }

  const otherLabel = document.createElement('label');
  otherLabel.textContent = 'Autres cartes (modif/action) vues : ';
  const otherInput = document.createElement('input');
  otherInput.type = 'number';
  otherInput.min = '0';
  otherInput.max = String(MODIFIERS_TOTAL + ACTIONS_TOTAL);
  otherInput.id = 'manual-other';
  otherInput.addEventListener('change', () => {
    const max = MODIFIERS_TOTAL + ACTIONS_TOTAL;
    const parsed = Number(otherInput.value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) {
      otherInput.value = String(seen.other);
      return;
    }
    snapshot();
    seen = { ...seen, other: parsed };
    saveSeen(seen);
    render();
  });
  otherLabel.appendChild(otherInput);
  container.appendChild(otherLabel);
}

function render() {
  const result = recommend(seen, line);
  document.getElementById('prob-bust').textContent = (result.probabilities.bust * 100).toFixed(1);
  document.getElementById('prob-reset').textContent = (result.probabilities.reset * 100).toFixed(1);
  document.getElementById('prob-progress').textContent = (result.probabilities.progress * 100).toFixed(1);
  document.getElementById('prob-neutral').textContent = (result.probabilities.neutral * 100).toFixed(1);
  document.getElementById('raw-score').textContent = String(result.rawScore);
  document.getElementById('ev-value').textContent = result.ev.toFixed(1);
  document.getElementById('recommendation').textContent = result.action;

  for (const v of CARD_VALUES) {
    for (const kind of ['regular', 'special']) {
      if (SHOE_BASE[v][kind] === 0) continue;
      const input = document.querySelector(`#manual-edit input[data-value="${v}"][data-kind="${kind}"]`);
      if (input) input.value = String(seen[v][kind]);
    }
  }
  const otherInput = document.getElementById('manual-other');
  if (otherInput) otherInput.value = String(seen.other);
}

document.getElementById('undo-btn').addEventListener('click', () => {
  if (!previousState) return;
  seen = previousState.seen;
  line = previousState.line;
  previousState = null;
  saveSeen(seen);
  saveLine(line);
  render();
});

document.getElementById('new-round-btn').addEventListener('click', () => {
  snapshot();
  line = createEmptyLine();
  clearLine();
  render();
});

document.getElementById('reshuffle-btn').addEventListener('click', () => {
  snapshot();
  seen = createEmptySeen();
  resetSeen();
  render();
});

document.getElementById('new-game-btn').addEventListener('click', () => {
  snapshot();
  seen = createEmptySeen();
  line = createEmptyLine();
  resetSeen();
  clearLine();
  render();
});

buildSeenGrid();
buildLineGrid();
buildManualEdit();
render();
```

- [ ] **Step 2: Manually verify in a browser**

Run: `python3 -m http.server 8000 --directory app`, open `http://localhost:8000/index.html`.

Walk through this exact sequence and confirm the numbers after each click:
1. On load: Bust 0.0%, Progression 85.2% (92/108 with two decimals: `92/108*100 = 85.185...` → shown as 85.2), recommendation `HIT` (staying banks 0).
2. Click "9" in "Ma ligne" ("Cartes que je garde..."): raw score becomes 9, Bust% becomes `8/107*100 ≈ 7.5`.
3. If, in a real game, you then drew a second 9 and busted: log that duplicate 9 in the *top* grid ("Cartes vues qui ne restent pas dans ma ligne"), not in "Ma ligne" — it still needs to count against the shared shoe, but shouldn't be added to your own line since you're out for the round. Confirm the shared Bust%/Progression update accordingly while your raw score is unaffected until you click "Nouveau round".
4. Click "Nouveau round": raw score resets to 0, but Bust% stays based on the same depleted shoe (confirms shoe persists across rounds).
5. Click "Reshuffle": Bust% and Progression return to the fresh-shoe values from step 1, but if you had a nonzero raw score in "Ma ligne" at the time, it must be untouched (Reshuffle only resets the shoe, matching the rulebook's mid-round reshuffle case).
6. Click "Nouvelle partie": confirm both the shoe and your line reset together (raw score back to 0 and Progression back to the fresh-shoe values).
7. Click a value in "Ma ligne", then "Annuler dernière action": confirm it reverts to the exact previous score/probabilities.
8. Reload the page: confirm the shoe/line state from before reload is still shown (localStorage persistence).

- [ ] **Step 3: Commit**

```bash
git add app/app.mjs
git commit -m "Wire hit/stay advisor UI to the decision engine"
```

---

### Task 9: Offline support (service worker) and final install check

**Files:**
- Create: `app/sw.js`

**Interfaces:**
- Consumes: no JS module interfaces (runs in the service worker global scope, not `app.mjs`'s module scope).

- [ ] **Step 1: Write `app/sw.js`**

```js
// app/sw.js
const CACHE_NAME = 'flip7-assistant-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './icon.svg',
  './app.mjs',
  './deck.mjs',
  './shoe.mjs',
  './line.mjs',
  './engine.mjs',
  './storage.mjs',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
```

- [ ] **Step 2: Manually verify offline installability**

Run: `python3 -m http.server 8000 --directory app`, open `http://localhost:8000/index.html` in Chrome.
1. Open DevTools → Application → Service Workers: confirm `sw.js` shows as activated.
2. Application → Cache Storage → `flip7-assistant-v1`: confirm all files from `ASSETS` are listed.
3. In DevTools → Network, set throttling to "Offline", then reload the page: confirm it still loads and the tap grids still work (bust %/EV still update).
4. Application → Manifest: confirm no errors are reported and the "Add to home screen" / install affordance is available for this page.

- [ ] **Step 3: Commit**

```bash
git add app/sw.js
git commit -m "Add service worker for offline PWA installability"
```
