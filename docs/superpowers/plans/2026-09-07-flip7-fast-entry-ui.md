# Flip 7 Fast Card-Entry UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fast chip-style entry for every card type (including 11 granular Modifier/Action chips), let the player remove a card from their line, and let them take an already-revealed-this-round card into their line (steal/swap) without double-counting it against the shared shoe.

**Architecture:** A new round-scoped tally (`app/round.mjs`) tracks Number cards revealed this round, independent of the shoe-lifetime `seen` tally; "pool availability" is derived arithmetic (`roundSeen - mine`), never separately stored. Granular Modifier/Action tracking is purely additive to `shoe.mjs` — the existing lumped `seen.other` field and every function that reads it (including all of `engine.mjs`) is untouched. `line.mjs` gains a `sevenKind` flag (mirroring the existing 13 disambiguation) and a `removeCardFromLine` function.

**Tech Stack:** Same as the existing app — vanilla ES modules (`.mjs`), zero dependencies, `node --test`.

**Spec:** [docs/superpowers/specs/2026-09-07-flip7-fast-entry-ui-design.md](../specs/2026-09-07-flip7-fast-entry-ui-design.md)

## Global Constraints

- Zero runtime dependencies: plain ES modules only, no npm install, no bundler.
- `app/engine.mjs` is not modified by this plan — every change here is additive around it.
- `seen.other` (in `app/shoe.mjs`) keeps its existing meaning and is never independently settable once granular tracking exists — it is always recomputed as the sum of `seen.modifierTypes` + `seen.actionTypes`, so it can never drift from them.
- `roundSeen` (in `app/round.mjs`) only tracks Number cards (0–13, regular/special) — Modifier/Action cards have no pool concept.
- `roundSeen` resets on "Nouveau round" and "Nouvelle partie" only — never on Reshuffle (mid-round reshuffles leave cards in front of players untouched, per the rulebook).
- `removeCardFromLine(line, value)` takes no `kind` parameter: for value 13 with both a regular and Lucky 13 held, it removes the Lucky 13 first (automatic default rule from the spec).
- All state-mutating functions return new objects; none may mutate their input (this is load-bearing for the app's existing single-level undo).

---

## File Structure

```
app/
  deck.mjs        — MODIFY: add MODIFIER_TYPES/ACTION_TYPES maps; derive MODIFIERS_TOTAL/ACTIONS_TOTAL from them
  shoe.mjs        — MODIFY: add modifierTypes/actionTypes to Seen shape; add logSpecialCardSeen
  line.mjs        — MODIFY: add sevenKind field; add removeCardFromLine
  round.mjs        — NEW: createEmptyRoundSeen, logRoundCard, mineCount, poolAvailable
  storage.mjs      — MODIFY: persist roundSeen; persist sevenKind in Line
  index.html       — MODIFY: add #pool-grid section, #my-cards container inside #line-grid
  style.css        — MODIFY: minimal styling for the new elements
  app.mjs          — MODIFY: granular Modifier/Action chips, round-tally logging, removal, pool UI
  sw.js            — MODIFY: cache the new round.mjs file
tests/
  deck.test.mjs    — MODIFY
  shoe.test.mjs    — MODIFY
  line.test.mjs    — MODIFY
  round.test.mjs   — NEW
  storage.test.mjs — MODIFY
```

---

### Task 1: Granular Modifier/Action type maps

**Files:**
- Modify: `app/deck.mjs`
- Modify: `tests/deck.test.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces: `MODIFIER_TYPES: { [id]: { label: string, max: number } }` (6 entries), `ACTION_TYPES: { [id]: { label: string, max: number } }` (5 entries). `MODIFIERS_TOTAL`/`ACTIONS_TOTAL` keep their existing exported names and values (6/10) but are now derived from these maps.

- [ ] **Step 1: Write the failing test**

Append to `tests/deck.test.mjs` (add `MODIFIER_TYPES, ACTION_TYPES` to the existing import from `'../app/deck.mjs'` at the top of the file):

```js
test('MODIFIER_TYPES and ACTION_TYPES sum to the existing totals', () => {
  assert.equal(Object.keys(MODIFIER_TYPES).length, 6);
  assert.equal(Object.keys(ACTION_TYPES).length, 5);
  assert.equal(MODIFIERS_TOTAL, 6);
  assert.equal(ACTIONS_TOTAL, 10);
});

test('every modifier type has max 1 and every action type has max 2', () => {
  for (const type of Object.values(MODIFIER_TYPES)) assert.equal(type.max, 1);
  for (const type of Object.values(ACTION_TYPES)) assert.equal(type.max, 2);
});

test('deck total is still 108 after deriving totals from the type maps', () => {
  assert.equal(TOTAL_CARDS, 108);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/deck.test.mjs`
Expected: FAIL — `MODIFIER_TYPES is not defined` (or similar import error)

- [ ] **Step 3: Write minimal implementation**

In `app/deck.mjs`, replace:

```js
export const MODIFIERS_TOTAL = 6; // -2, -4, -6, -8, -10, ÷2 — one copy each
export const ACTIONS_TOTAL = 10;  // Just One More, Swap, Steal, Discard, Flip Four — two copies each
```

with:

```js
export const MODIFIER_TYPES = {
  minus2: { label: '-2', max: 1 },
  minus4: { label: '-4', max: 1 },
  minus6: { label: '-6', max: 1 },
  minus8: { label: '-8', max: 1 },
  minus10: { label: '-10', max: 1 },
  div2: { label: '÷2', max: 1 },
};

export const ACTION_TYPES = {
  justOneMore: { label: 'Encore une', max: 2 },
  swap: { label: 'Échange', max: 2 },
  steal: { label: 'Vol', max: 2 },
  discard: { label: 'Défausse', max: 2 },
  flipFour: { label: 'Flip Four', max: 2 },
};

export const MODIFIERS_TOTAL = Object.values(MODIFIER_TYPES).reduce((sum, t) => sum + t.max, 0);
export const ACTIONS_TOTAL = Object.values(ACTION_TYPES).reduce((sum, t) => sum + t.max, 0);
```

(Leave `CARD_VALUES`, `SHOE_BASE`, and `TOTAL_CARDS` exactly as they are — `TOTAL_CARDS` already derives from `MODIFIERS_TOTAL`/`ACTIONS_TOTAL`, so it needs no change.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/deck.test.mjs`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add app/deck.mjs tests/deck.test.mjs
git commit -m "Derive Modifier/Action totals from granular type maps"
```

---

### Task 2: Granular Modifier/Action tracking in the shoe tally

**Files:**
- Modify: `app/shoe.mjs`
- Modify: `tests/shoe.test.mjs`

**Interfaces:**
- Consumes: `MODIFIER_TYPES, ACTION_TYPES` from `app/deck.mjs` (Task 1).
- Produces: `Seen` shape gains `modifierTypes: { [id]: number }` and `actionTypes: { [id]: number }`. New function `logSpecialCardSeen(seen: Seen, category: 'modifier' | 'action', id: string): Seen`.

- [ ] **Step 1: Write the failing test**

Append to `tests/shoe.test.mjs` (add `logSpecialCardSeen` to the existing import from `'../app/shoe.mjs'`, and add a new import `import { MODIFIER_TYPES, ACTION_TYPES } from '../app/deck.mjs';` at the top):

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/shoe.test.mjs`
Expected: FAIL — `seen.modifierTypes` is undefined / `logSpecialCardSeen is not a function`

- [ ] **Step 3: Write minimal implementation**

In `app/shoe.mjs`, update the import line at the top:

```js
import { CARD_VALUES, SHOE_BASE, MODIFIERS_TOTAL, ACTIONS_TOTAL, MODIFIER_TYPES, ACTION_TYPES } from './deck.mjs';
```

Replace `createEmptySeen`:

```js
export function createEmptySeen() {
  const seen = { other: 0, modifierTypes: {}, actionTypes: {} };
  for (const v of CARD_VALUES) {
    seen[v] = { regular: 0, special: 0 };
  }
  for (const id of Object.keys(MODIFIER_TYPES)) seen.modifierTypes[id] = 0;
  for (const id of Object.keys(ACTION_TYPES)) seen.actionTypes[id] = 0;
  return seen;
}
```

Replace the first two lines of `logCardSeen` (the `const next = { other: seen.other };` line) so the granular maps survive the copy:

```js
export function logCardSeen(seen, value, kind) {
  const next = {
    other: seen.other,
    modifierTypes: { ...seen.modifierTypes },
    actionTypes: { ...seen.actionTypes },
  };
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
```

Add a new function at the end of the file:

```js
function sumTypeCounts(typeCounts) {
  return Object.values(typeCounts).reduce((sum, n) => sum + n, 0);
}

export function logSpecialCardSeen(seen, category, id) {
  const types = category === 'modifier' ? MODIFIER_TYPES : ACTION_TYPES;
  const max = types[id].max;
  const currentTypeCounts = category === 'modifier' ? seen.modifierTypes : seen.actionTypes;
  if (currentTypeCounts[id] + 1 > max) {
    throw new Error(`Cannot log another ${id}: all ${max} already seen`);
  }

  const next = {
    other: seen.other,
    modifierTypes: { ...seen.modifierTypes },
    actionTypes: { ...seen.actionTypes },
  };
  for (const v of CARD_VALUES) next[v] = { ...seen[v] };

  if (category === 'modifier') {
    next.modifierTypes[id] = seen.modifierTypes[id] + 1;
  } else {
    next.actionTypes[id] = seen.actionTypes[id] + 1;
  }
  next.other = sumTypeCounts(next.modifierTypes) + sumTypeCounts(next.actionTypes);
  return next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/shoe.test.mjs`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add app/shoe.mjs tests/shoe.test.mjs
git commit -m "Add granular per-type Modifier/Action tracking to the shoe tally"
```

---

### Task 3: `sevenKind` flag and card removal in the player's line

**Files:**
- Modify: `app/line.mjs`
- Modify: `tests/line.test.mjs`

**Interfaces:**
- Produces: `Line` shape gains `sevenKind: null | 'regular' | 'special'`. New function `removeCardFromLine(line: Line, value: number): Line`.

- [ ] **Step 1: Write the failing test**

In `tests/line.test.mjs`, add `removeCardFromLine` to the existing import from `'../app/line.mjs'`. Extend the existing `'createEmptyLine starts empty'` test with one more assertion:

```js
test('createEmptyLine starts empty', () => {
  const line = createEmptyLine();
  assert.equal(line.values.size, 0);
  assert.equal(line.hasRegular13, false);
  assert.equal(line.hasLucky13, false);
  assert.equal(line.sevenKind, null);
  assert.equal(line.cardCount, 0);
});
```

Then append these new tests at the end of the file:

```js
test('addCardToLine sets sevenKind to regular when adding a plain 7', () => {
  let line = createEmptyLine();
  line = addCardToLine(line, 7);
  assert.equal(line.sevenKind, 'regular');
});

test('addUnlucky7Card sets sevenKind to special', () => {
  const line = addUnlucky7Card(createEmptyLine());
  assert.equal(line.sevenKind, 'special');
});

test('removeCardFromLine removes a plain value and decrements cardCount', () => {
  let line = createEmptyLine();
  line = addCardToLine(line, 9);
  line = removeCardFromLine(line, 9);
  assert.equal(line.values.has(9), false);
  assert.equal(line.cardCount, 0);
});

test('removeCardFromLine on a value not held is a no-op', () => {
  const line = createEmptyLine();
  const next = removeCardFromLine(line, 9);
  assert.equal(next.values.size, 0);
  assert.equal(next.cardCount, 0);
});

test('removeCardFromLine clears sevenKind when removing a 7', () => {
  let line = createEmptyLine();
  line = addCardToLine(line, 7);
  line = removeCardFromLine(line, 7);
  assert.equal(line.sevenKind, null);
  assert.equal(line.values.has(7), false);
});

test('removeCardFromLine on 13 removes Lucky 13 first when both are held', () => {
  let line = createEmptyLine();
  line = addCardToLine(line, 13);
  line = addLucky13Card(line);
  line = removeCardFromLine(line, 13);
  assert.equal(line.hasLucky13, false);
  assert.equal(line.hasRegular13, true);
  assert.equal(line.values.has(13), true);
  assert.equal(line.cardCount, 1);
});

test('removeCardFromLine on 13 removes the regular 13 when only it is held', () => {
  let line = createEmptyLine();
  line = addCardToLine(line, 13);
  line = removeCardFromLine(line, 13);
  assert.equal(line.hasRegular13, false);
  assert.equal(line.values.has(13), false);
  assert.equal(line.cardCount, 0);
});

test('removeCardFromLine on 13 removes the Lucky 13 when only it is held', () => {
  let line = addLucky13Card(createEmptyLine());
  line = removeCardFromLine(line, 13);
  assert.equal(line.hasLucky13, false);
  assert.equal(line.values.has(13), false);
  assert.equal(line.cardCount, 0);
});

test('removeCardFromLine does not mutate the input', () => {
  let line = createEmptyLine();
  line = addCardToLine(line, 9);
  removeCardFromLine(line, 9);
  assert.equal(line.values.has(9), true);
  assert.equal(line.cardCount, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/line.test.mjs`
Expected: FAIL — `line.sevenKind` is undefined / `removeCardFromLine is not a function`

- [ ] **Step 3: Write minimal implementation**

Replace the whole of `app/line.mjs` with:

```js
export function createEmptyLine() {
  return { values: new Set(), hasRegular13: false, hasLucky13: false, sevenKind: null, cardCount: 0 };
}

export function addCardToLine(line, value) {
  const values = new Set(line.values);
  values.add(value);
  return {
    values,
    hasRegular13: line.hasRegular13 || value === 13,
    hasLucky13: line.hasLucky13,
    sevenKind: value === 7 ? 'regular' : line.sevenKind,
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
    sevenKind: line.sevenKind,
    cardCount: line.cardCount + 1,
  };
}

export function addUnlucky7Card(line) {
  return { values: new Set([7]), hasRegular13: false, hasLucky13: false, sevenKind: 'special', cardCount: 1 };
}

export function removeCardFromLine(line, value) {
  if (!line.values.has(value)) return line;

  if (value === 13) {
    const values = new Set(line.values);
    if (line.hasLucky13) {
      if (!line.hasRegular13) values.delete(13);
      return {
        values,
        hasRegular13: line.hasRegular13,
        hasLucky13: false,
        sevenKind: line.sevenKind,
        cardCount: line.cardCount - 1,
      };
    }
    values.delete(13);
    return {
      values,
      hasRegular13: false,
      hasLucky13: line.hasLucky13,
      sevenKind: line.sevenKind,
      cardCount: line.cardCount - 1,
    };
  }

  const values = new Set(line.values);
  values.delete(value);
  return {
    values,
    hasRegular13: line.hasRegular13,
    hasLucky13: line.hasLucky13,
    sevenKind: value === 7 ? null : line.sevenKind,
    cardCount: line.cardCount - 1,
  };
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
Expected: PASS (18 tests)

- [ ] **Step 5: Commit**

```bash
git add app/line.mjs tests/line.test.mjs
git commit -m "Add sevenKind flag and removeCardFromLine to the player line module"
```

---

### Task 4: Round-scoped reveal tally and pool arithmetic

**Files:**
- Create: `app/round.mjs`
- Create: `tests/round.test.mjs`
- Modify: `app/sw.js`

**Interfaces:**
- Consumes: `CARD_VALUES, SHOE_BASE` from `app/deck.mjs`; reads `line.values`, `line.hasRegular13`, `line.hasLucky13`, `line.sevenKind` (from `app/line.mjs`'s `Line` shape, Task 3) but does not import from `line.mjs` — it only reads fields passed in.
- Produces: `createEmptyRoundSeen(): RoundSeen`, `logRoundCard(roundSeen: RoundSeen, value: number, kind: 'regular' | 'special'): RoundSeen`, `mineCount(line: Line, value: number, kind: 'regular' | 'special'): number`, `poolAvailable(roundSeen: RoundSeen, line: Line, value: number, kind: 'regular' | 'special'): number`.
  `RoundSeen` shape: `{ [0..13]: { regular: number, special: number } }` (Number cards only, no `other`).

- [ ] **Step 1: Write the failing test**

```js
// tests/round.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_VALUES } from '../app/deck.mjs';
import { createEmptyRoundSeen, logRoundCard, mineCount, poolAvailable } from '../app/round.mjs';
import { createEmptyLine, addCardToLine, addLucky13Card, addUnlucky7Card } from '../app/line.mjs';

test('createEmptyRoundSeen starts with nothing seen for every Number card value', () => {
  const roundSeen = createEmptyRoundSeen();
  for (const v of CARD_VALUES) {
    assert.deepEqual(roundSeen[v], { regular: 0, special: 0 });
  }
});

test('logRoundCard increments without mutating the input', () => {
  const roundSeen = createEmptyRoundSeen();
  const next = logRoundCard(roundSeen, 9, 'regular');
  assert.equal(roundSeen[9].regular, 0);
  assert.equal(next[9].regular, 1);
});

test('logRoundCard throws once a value/kind exceeds the deck copies for it', () => {
  let roundSeen = createEmptyRoundSeen();
  roundSeen = logRoundCard(roundSeen, 1, 'regular'); // only 1 copy of value 1 exists
  assert.throws(() => logRoundCard(roundSeen, 1, 'regular'), /Cannot log another/);
});

test('mineCount is 0 for a value not held', () => {
  const line = createEmptyLine();
  assert.equal(mineCount(line, 9, 'regular'), 0);
});

test('mineCount disambiguates a held regular 7 by sevenKind', () => {
  let line = createEmptyLine();
  line = addCardToLine(line, 7);
  assert.equal(mineCount(line, 7, 'regular'), 1);
  assert.equal(mineCount(line, 7, 'special'), 0);
});

test('mineCount disambiguates a held Unlucky 7 by sevenKind', () => {
  const line = addUnlucky7Card(createEmptyLine());
  assert.equal(mineCount(line, 7, 'special'), 1);
  assert.equal(mineCount(line, 7, 'regular'), 0);
});

test('mineCount counts a doubled 13 correctly per kind', () => {
  let line = createEmptyLine();
  line = addCardToLine(line, 13);
  line = addLucky13Card(line);
  assert.equal(mineCount(line, 13, 'regular'), 1);
  assert.equal(mineCount(line, 13, 'special'), 1);
});

test('poolAvailable is the round tally minus what I currently hold', () => {
  let roundSeen = createEmptyRoundSeen();
  roundSeen = logRoundCard(roundSeen, 9, 'regular');
  roundSeen = logRoundCard(roundSeen, 9, 'regular');
  let line = createEmptyLine();
  line = addCardToLine(line, 9);
  assert.equal(poolAvailable(roundSeen, line, 9, 'regular'), 1);
});

test('poolAvailable distinguishes a regular 7 from an Unlucky 7 revealed this round', () => {
  let roundSeen = createEmptyRoundSeen();
  roundSeen = logRoundCard(roundSeen, 7, 'regular');
  roundSeen = logRoundCard(roundSeen, 7, 'special');
  let line = createEmptyLine();
  line = addCardToLine(line, 7); // I hold the regular one
  assert.equal(poolAvailable(roundSeen, line, 7, 'regular'), 0);
  assert.equal(poolAvailable(roundSeen, line, 7, 'special'), 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/round.test.mjs`
Expected: FAIL — `Cannot find module '../app/round.mjs'`

- [ ] **Step 3: Write minimal implementation**

```js
// app/round.mjs
import { CARD_VALUES, SHOE_BASE } from './deck.mjs';

export function createEmptyRoundSeen() {
  const roundSeen = {};
  for (const v of CARD_VALUES) {
    roundSeen[v] = { regular: 0, special: 0 };
  }
  return roundSeen;
}

export function logRoundCard(roundSeen, value, kind) {
  const next = {};
  for (const v of CARD_VALUES) next[v] = { ...roundSeen[v] };

  const max = SHOE_BASE[value][kind];
  if (roundSeen[value][kind] + 1 > max) {
    throw new Error(`Cannot log another ${value}/${kind} this round: all ${max} already seen`);
  }
  next[value][kind] = roundSeen[value][kind] + 1;
  return next;
}

export function mineCount(line, value, kind) {
  if (value === 7) {
    return line.values.has(7) && line.sevenKind === kind ? 1 : 0;
  }
  if (value === 13) {
    return kind === 'special' ? (line.hasLucky13 ? 1 : 0) : (line.hasRegular13 ? 1 : 0);
  }
  return line.values.has(value) ? 1 : 0;
}

export function poolAvailable(roundSeen, line, value, kind) {
  return roundSeen[value][kind] - mineCount(line, value, kind);
}
```

Also update `app/sw.js`'s `ASSETS` array to include the new file — add `'./round.mjs'` to the list (anywhere in the list is fine; keep it alongside the other `.mjs` entries for readability).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/round.test.mjs`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add app/round.mjs tests/round.test.mjs app/sw.js
git commit -m "Add round-scoped reveal tally and pool-availability arithmetic"
```

---

### Task 5: Persist the round tally and the sevenKind flag

**Files:**
- Modify: `app/storage.mjs`
- Modify: `tests/storage.test.mjs`

**Interfaces:**
- Consumes: `createEmptyRoundSeen` from `app/round.mjs` (Task 4).
- Produces: `loadRoundSeen(store?): RoundSeen`, `saveRoundSeen(roundSeen, store?): void`, `resetRoundSeen(store?): void`. `loadLine`/`saveLine` now round-trip `sevenKind` too.

- [ ] **Step 1: Write the failing test**

In `tests/storage.test.mjs`, update the imports at the top:

```js
import { loadSeen, saveSeen, resetSeen, loadLine, saveLine, clearLine, loadRoundSeen, saveRoundSeen, resetRoundSeen } from '../app/storage.mjs';
import { createEmptyLine, addCardToLine } from '../app/line.mjs';
import { createEmptySeen, logCardSeen } from '../app/shoe.mjs';
import { createEmptyRoundSeen, logRoundCard } from '../app/round.mjs';
```

Update the existing `'saveLine then loadLine round-trips the Set as an array and back'` test to also check `sevenKind`:

```js
test('saveLine then loadLine round-trips the Set as an array and back', () => {
  const store = createFakeStore();
  let line = createEmptyLine();
  line = addCardToLine(line, 9);
  line = addCardToLine(line, 13);
  line = addCardToLine(line, 7);
  saveLine(line, store);
  const reloaded = loadLine(store);
  assert.deepEqual([...reloaded.values].sort((a, b) => a - b), [7, 9, 13]);
  assert.equal(reloaded.hasRegular13, true);
  assert.equal(reloaded.sevenKind, 'regular');
  assert.equal(reloaded.cardCount, 3);
});
```

Append new tests at the end of the file:

```js
test('loadRoundSeen returns an empty round tally when nothing is stored', () => {
  const store = createFakeStore();
  assert.deepEqual(loadRoundSeen(store), createEmptyRoundSeen());
});

test('saveRoundSeen then loadRoundSeen round-trips the round tally', () => {
  const store = createFakeStore();
  const roundSeen = logRoundCard(createEmptyRoundSeen(), 9, 'regular');
  saveRoundSeen(roundSeen, store);
  assert.deepEqual(loadRoundSeen(store), roundSeen);
});

test('resetRoundSeen clears stored round tally', () => {
  const store = createFakeStore();
  saveRoundSeen(logRoundCard(createEmptyRoundSeen(), 9, 'regular'), store);
  resetRoundSeen(store);
  assert.deepEqual(loadRoundSeen(store), createEmptyRoundSeen());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/storage.test.mjs`
Expected: FAIL — `reloaded.sevenKind` is undefined, `loadRoundSeen is not a function`

- [ ] **Step 3: Write minimal implementation**

Replace the whole of `app/storage.mjs` with:

```js
import { createEmptySeen } from './shoe.mjs';
import { createEmptyLine } from './line.mjs';
import { createEmptyRoundSeen } from './round.mjs';

const SEEN_KEY = 'flip7.shoe.seen.v1';
const LINE_KEY = 'flip7.myLine.v1';
const ROUND_SEEN_KEY = 'flip7.round.seen.v1';

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
    sevenKind: parsed.sevenKind,
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
      sevenKind: line.sevenKind,
      cardCount: line.cardCount,
    })
  );
}

export function clearLine(store = localStorage) {
  store.removeItem(LINE_KEY);
}

export function loadRoundSeen(store = localStorage) {
  const raw = store.getItem(ROUND_SEEN_KEY);
  return raw ? JSON.parse(raw) : createEmptyRoundSeen();
}

export function saveRoundSeen(roundSeen, store = localStorage) {
  store.setItem(ROUND_SEEN_KEY, JSON.stringify(roundSeen));
}

export function resetRoundSeen(store = localStorage) {
  store.removeItem(ROUND_SEEN_KEY);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/storage.test.mjs`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add app/storage.mjs tests/storage.test.mjs
git commit -m "Persist the round-scoped reveal tally and the sevenKind flag"
```

---

### Task 6: Markup and styling for removal and the pool

**Files:**
- Modify: `app/index.html`
- Modify: `app/style.css`

No unit tests (static markup); verified visually in Step 3.

**Interfaces:**
- Produces: `#my-cards` (empty container inside `#line-grid`, for the removable held-card list), `#pool-grid-items` (empty container inside a new `#pool-grid` section, for the take-from-pool chips) — both consumed by `app/app.mjs` in Task 8.

- [ ] **Step 1: Update `app/index.html`**

Replace the `#line-grid` section:

```html
  <section id="line-grid">
    <h2>Cartes que je garde dans ma ligne ce round</h2>
    <p>Compte automatiquement aussi comme vue.</p>
  </section>
```

with:

```html
  <section id="line-grid">
    <h2>Cartes que je garde dans ma ligne ce round</h2>
    <p>Compte automatiquement aussi comme vue.</p>
    <div id="my-cards"></div>
  </section>
```

Add a new section between `#line-grid` and `#manual-edit`:

```html
  <section id="pool-grid">
    <h2>Disponible pour échange (déjà tiré ce round, pas dans ma ligne)</h2>
    <div id="pool-grid-items"></div>
  </section>
```

- [ ] **Step 2: Update `app/style.css`**

Append:

```css
#my-cards, #pool-grid-items {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

#pool-grid-items button {
  min-width: 3rem;
  min-height: 3rem;
  font-size: 1.1rem;
}

.held-card {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  border: 1px solid #f4f4f4;
  border-radius: 999px;
}

.held-card button {
  min-width: 1.5rem;
  min-height: 1.5rem;
  line-height: 1;
}
```

- [ ] **Step 3: Verify visually**

Run: `python3 -m http.server 8000 --directory app`, open `http://localhost:8000/index.html`.
Expected: page loads with no console errors about missing elements; the new "Disponible pour échange" heading is visible with an empty area beneath it (empty is correct — `app.mjs` doesn't populate it until Task 8); `#line-grid` shows its existing add-buttons plus an empty `#my-cards` div beneath them (also correct, populated in Task 8).

- [ ] **Step 4: Commit**

```bash
git add app/index.html app/style.css
git commit -m "Add markup and styling for card removal and the swap/steal pool"
```

---

### Task 7: Granular Modifier/Action chips in the UI

**Files:**
- Modify: `app/app.mjs`

No unit tests (DOM-dependent); verified manually in Step 2.

**Interfaces:**
- Consumes: `MODIFIER_TYPES, ACTION_TYPES` from `app/deck.mjs` (Task 1); `logSpecialCardSeen` from `app/shoe.mjs` (Task 2).

- [ ] **Step 1: Update `app/app.mjs`**

Update the top imports — change:

```js
import { CARD_VALUES, SHOE_BASE, MODIFIERS_TOTAL, ACTIONS_TOTAL } from './deck.mjs';
import { createEmptySeen, logCardSeen, remainingCount } from './shoe.mjs';
```

to:

```js
import { CARD_VALUES, SHOE_BASE, MODIFIER_TYPES, ACTION_TYPES } from './deck.mjs';
import { createEmptySeen, logCardSeen, logSpecialCardSeen, remainingCount } from './shoe.mjs';
```

(`MODIFIERS_TOTAL`/`ACTIONS_TOTAL` are no longer used directly in `app.mjs` after this task — the granular maps replace their only two call sites, both removed below.)

Replace the `logOtherCard` function:

```js
function logOtherCard() {
  let nextSeen;
  try {
    nextSeen = logCardSeen(seen, 'other', null);
  } catch (err) {
    alert(err.message);
    return;
  }
  snapshot();
  seen = nextSeen;
  saveSeen(seen);
  render();
}
```

with:

```js
function logSpecialCard(category, id) {
  let nextSeen;
  try {
    nextSeen = logSpecialCardSeen(seen, category, id);
  } catch (err) {
    alert(err.message);
    return;
  }
  snapshot();
  seen = nextSeen;
  saveSeen(seen);
  render();
}
```

In `buildSeenGrid`, replace the trailing block that builds the single "Autre" button:

```js
  const otherBtn = document.createElement('button');
  otherBtn.textContent = 'Autre (modif/action)';
  otherBtn.addEventListener('click', logOtherCard);
  container.appendChild(otherBtn);
```

with:

```js
  for (const [id, type] of Object.entries(MODIFIER_TYPES)) {
    const btn = document.createElement('button');
    btn.textContent = type.label;
    btn.dataset.category = 'modifier';
    btn.dataset.typeId = id;
    btn.addEventListener('click', () => logSpecialCard('modifier', id));
    container.appendChild(btn);
  }
  for (const [id, type] of Object.entries(ACTION_TYPES)) {
    const btn = document.createElement('button');
    btn.textContent = type.label;
    btn.dataset.category = 'action';
    btn.dataset.typeId = id;
    btn.addEventListener('click', () => logSpecialCard('action', id));
    container.appendChild(btn);
  }
```

In `buildManualEdit`, replace the trailing block that builds the single "Autre" input:

```js
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
```

with:

```js
  for (const [id, type] of Object.entries(MODIFIER_TYPES)) {
    appendSpecialCardInput(container, 'modifier', id, type);
  }
  for (const [id, type] of Object.entries(ACTION_TYPES)) {
    appendSpecialCardInput(container, 'action', id, type);
  }
```

Add a new top-level function (place it right above `buildManualEdit`):

```js
function recomputeOther(seen) {
  const sum = (counts) => Object.values(counts).reduce((total, n) => total + n, 0);
  return sum(seen.modifierTypes) + sum(seen.actionTypes);
}

function appendSpecialCardInput(container, category, id, type) {
  const label = document.createElement('label');
  label.textContent = `${type.label} vues : `;
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.max = String(type.max);
  input.dataset.category = category;
  input.dataset.typeId = id;
  input.addEventListener('change', () => {
    const currentCounts = category === 'modifier' ? seen.modifierTypes : seen.actionTypes;
    const parsed = Number(input.value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > type.max) {
      input.value = String(currentCounts[id]);
      return;
    }
    snapshot();
    const key = category === 'modifier' ? 'modifierTypes' : 'actionTypes';
    const nextSeen = { ...seen, [key]: { ...currentCounts, [id]: parsed } };
    nextSeen.other = recomputeOther(nextSeen);
    seen = nextSeen;
    saveSeen(seen);
    render();
  });
  label.appendChild(input);
  container.appendChild(label);
}
```

In `render`, replace the trailing block that resyncs the single "Autre" input:

```js
  const otherInput = document.getElementById('manual-other');
  if (otherInput) otherInput.value = String(seen.other);
```

with:

```js
  for (const [id, type] of Object.entries(MODIFIER_TYPES)) {
    syncSpecialCardControls('modifier', id, type, seen.modifierTypes[id]);
  }
  for (const [id, type] of Object.entries(ACTION_TYPES)) {
    syncSpecialCardControls('action', id, type, seen.actionTypes[id]);
  }
```

Add a new top-level function (place it right above `render`):

```js
function syncSpecialCardControls(category, id, type, count) {
  const input = document.querySelector(`#manual-edit input[data-category="${category}"][data-type-id="${id}"]`);
  if (input) input.value = String(count);
  const btn = document.querySelector(`#seen-grid button[data-category="${category}"][data-type-id="${id}"]`);
  if (btn) btn.disabled = count >= type.max;
}
```

- [ ] **Step 2: Manually verify in a browser**

Run: `python3 -m http.server 8000 --directory app`, open `http://localhost:8000/index.html`.

1. Confirm "Cartes des autres" now shows 11 individual chips ("-2", "-4", "-6", "-8", "-10", "÷2", "Encore une", "Échange", "Vol", "Défausse", "Flip Four") instead of a single "Autre" button.
2. Click "-2": confirm the recommendation panel's "Neutre" percentage decreases (one fewer neutral card left), and scroll to "Correction manuelle" — confirm the "-2 vues" input now shows `1` and the "-2" chip in the top grid is now disabled (only 1 copy exists).
3. Click "Vol" twice (max 2): confirm it's disabled after the second click, and a third click attempt (if you re-enable it manually via the manual-edit input set to 1) behaves consistently.
4. Edit the "Flip Four vues" manual-edit input directly to `2`: confirm the "Flip Four" chip becomes disabled, and confirm no other modifier/action input changed.

- [ ] **Step 3: Commit**

```bash
git add app/app.mjs
git commit -m "Replace the single Autre button with 11 granular Modifier/Action chips"
```

---

### Task 8: Round tally logging, card removal, and the swap/steal pool

**Files:**
- Modify: `app/app.mjs`

No unit tests (DOM-dependent); verified manually in Step 2.

**Interfaces:**
- Consumes: `removeCardFromLine` from `app/line.mjs` (Task 3); `createEmptyRoundSeen, logRoundCard, mineCount, poolAvailable` from `app/round.mjs` (Task 4); `loadRoundSeen, saveRoundSeen, resetRoundSeen` from `app/storage.mjs` (Task 5); `#my-cards`, `#pool-grid-items` from `app/index.html` (Task 6).

- [ ] **Step 1: Update `app/app.mjs`**

Update the top imports — change:

```js
import { createEmptyLine, addCardToLine, addLucky13Card, addUnlucky7Card } from './line.mjs';
import { recommend } from './engine.mjs';
import { loadSeen, saveSeen, resetSeen, loadLine, saveLine, clearLine } from './storage.mjs';
```

to:

```js
import { createEmptyLine, addCardToLine, addLucky13Card, addUnlucky7Card, removeCardFromLine } from './line.mjs';
import { createEmptyRoundSeen, logRoundCard, poolAvailable } from './round.mjs';
import { recommend } from './engine.mjs';
import {
  loadSeen,
  saveSeen,
  resetSeen,
  loadLine,
  saveLine,
  clearLine,
  loadRoundSeen,
  saveRoundSeen,
  resetRoundSeen,
} from './storage.mjs';
```

Replace the initial state block:

```js
let seen = loadSeen();
let line = loadLine();
let previousState = null;

function snapshot() {
  previousState = { seen, line };
}
```

with:

```js
let seen = loadSeen();
let line = loadLine();
let roundSeen = loadRoundSeen();
let previousState = null;

function snapshot() {
  previousState = { seen, line, roundSeen };
}
```

Replace `logMyCard`:

```js
function logMyCard(value, kind) {
  let nextSeen;
  try {
    nextSeen = logCardSeen(seen, value, kind);
  } catch (err) {
    alert(err.message);
    return;
  }
  snapshot();
  seen = nextSeen;
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
```

with:

```js
function logMyCard(value, kind) {
  let nextSeen, nextRoundSeen;
  try {
    nextSeen = logCardSeen(seen, value, kind);
    nextRoundSeen = logRoundCard(roundSeen, value, kind);
  } catch (err) {
    alert(err.message);
    return;
  }
  snapshot();
  seen = nextSeen;
  roundSeen = nextRoundSeen;
  if (value === 7 && kind === 'special') {
    line = addUnlucky7Card(line);
  } else if (value === 13 && kind === 'special') {
    line = addLucky13Card(line);
  } else {
    line = addCardToLine(line, value);
  }
  saveSeen(seen);
  saveRoundSeen(roundSeen);
  saveLine(line);
  render();
}

function removeMyCard(value) {
  snapshot();
  line = removeCardFromLine(line, value);
  saveLine(line);
  render();
}

function takeFromPool(value, kind) {
  snapshot();
  if (value === 7 && kind === 'special') {
    line = addUnlucky7Card(line);
  } else if (value === 13 && kind === 'special') {
    line = addLucky13Card(line);
  } else {
    line = addCardToLine(line, value);
  }
  saveLine(line);
  render();
}
```

Replace `logOtherPlayerCard`:

```js
function logOtherPlayerCard(value, kind) {
  let nextSeen;
  try {
    nextSeen = logCardSeen(seen, value, kind);
  } catch (err) {
    alert(err.message);
    return;
  }
  snapshot();
  seen = nextSeen;
  saveSeen(seen);
  render();
}
```

with:

```js
function logOtherPlayerCard(value, kind) {
  let nextSeen, nextRoundSeen;
  try {
    nextSeen = logCardSeen(seen, value, kind);
    nextRoundSeen = logRoundCard(roundSeen, value, kind);
  } catch (err) {
    alert(err.message);
    return;
  }
  snapshot();
  seen = nextSeen;
  roundSeen = nextRoundSeen;
  saveSeen(seen);
  saveRoundSeen(roundSeen);
  render();
}
```

Add two new rendering functions (place them right above `render`):

```js
function renderMyCards() {
  const container = document.getElementById('my-cards');
  container.innerHTML = '';
  const chips = [];
  for (const v of line.values) {
    if (v === 7) {
      chips.push({ value: 7, kind: line.sevenKind });
    } else if (v === 13) {
      if (line.hasRegular13) chips.push({ value: 13, kind: 'regular' });
      if (line.hasLucky13) chips.push({ value: 13, kind: 'special' });
    } else {
      chips.push({ value: v, kind: 'regular' });
    }
  }
  for (const { value, kind } of chips) {
    const chip = document.createElement('span');
    chip.className = 'held-card';
    chip.textContent = cardLabel(value, kind);
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => removeMyCard(value));
    chip.appendChild(removeBtn);
    container.appendChild(chip);
  }
}

function renderPoolGrid() {
  const container = document.getElementById('pool-grid-items');
  container.innerHTML = '';
  for (const v of CARD_VALUES) {
    for (const kind of ['regular', 'special']) {
      if (SHOE_BASE[v][kind] === 0) continue;
      const available = poolAvailable(roundSeen, line, v, kind);
      if (available <= 0) continue;
      const btn = document.createElement('button');
      btn.textContent = `${cardLabel(v, kind)} (${available})`;
      btn.addEventListener('click', () => takeFromPool(v, kind));
      container.appendChild(btn);
    }
  }
}
```

In `render`, add calls to both new functions at the very end of the function body (after the existing `syncSpecialCardControls` loops added in Task 7, still inside `render`):

```js
  renderMyCards();
  renderPoolGrid();
```

Replace the `undo-btn` handler:

```js
document.getElementById('undo-btn').addEventListener('click', () => {
  if (!previousState) return;
  seen = previousState.seen;
  line = previousState.line;
  previousState = null;
  saveSeen(seen);
  saveLine(line);
  render();
});
```

with:

```js
document.getElementById('undo-btn').addEventListener('click', () => {
  if (!previousState) return;
  seen = previousState.seen;
  line = previousState.line;
  roundSeen = previousState.roundSeen;
  previousState = null;
  saveSeen(seen);
  saveLine(line);
  saveRoundSeen(roundSeen);
  render();
});
```

Replace the `new-round-btn` handler:

```js
document.getElementById('new-round-btn').addEventListener('click', () => {
  snapshot();
  line = createEmptyLine();
  clearLine();
  render();
});
```

with:

```js
document.getElementById('new-round-btn').addEventListener('click', () => {
  snapshot();
  line = createEmptyLine();
  roundSeen = createEmptyRoundSeen();
  clearLine();
  resetRoundSeen();
  render();
});
```

Replace the `new-game-btn` handler:

```js
document.getElementById('new-game-btn').addEventListener('click', () => {
  snapshot();
  seen = createEmptySeen();
  line = createEmptyLine();
  resetSeen();
  clearLine();
  render();
});
```

with:

```js
document.getElementById('new-game-btn').addEventListener('click', () => {
  snapshot();
  seen = createEmptySeen();
  line = createEmptyLine();
  roundSeen = createEmptyRoundSeen();
  resetSeen();
  clearLine();
  resetRoundSeen();
  render();
});
```

(Leave the `reshuffle-btn` handler exactly as it is — it must not touch `roundSeen`, per the spec.)

- [ ] **Step 2: Manually verify in a browser**

Run: `python3 -m http.server 8000 --directory app`, open `http://localhost:8000/index.html`.

1. Click "9" in "Cartes des autres" (top grid): confirm no chip appears under "Ma ligne"'s held-card list (it's not yours) but a "9 (1)" chip now appears under "Disponible pour échange".
2. Click "Prendre" on that "9 (1)" pool chip (i.e. click it): confirm raw score becomes 9, the chip disappears from the pool (0 available now), and a "9 ×" chip appears in `#my-cards`.
3. Click the "×" on that "9" chip in `#my-cards`: confirm raw score returns to 0, the chip disappears from `#my-cards`, and the "9 (1)" chip reappears in the pool (it's revealed this round, not currently mine).
4. Click "7 – Malchance" in "Ma ligne" (bottom grid) while holding some other card: confirm your line resets to just the 7 (existing Task 8 behavior from the v1 plan, unaffected by this change) and that a "7 – Malchance" pool entry does NOT appear (you now hold it).
5. Click "Nouveau round": confirm `#my-cards` and the pool both go empty, even though cards from this round were revealed — the round tally reset, and cards revealed in the *next* round should reappear in the pool as they're logged.
6. Click "Reshuffle": confirm neither `#my-cards` nor the pool changes (round-scoped state is untouched by a shoe reshuffle).
7. Reload the page: confirm the pool and held-card list reflect the same state as before reload (round tally persistence).

- [ ] **Step 3: Commit**

```bash
git add app/app.mjs
git commit -m "Add round-tally logging, card removal, and the swap/steal pool to the UI"
```
