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
