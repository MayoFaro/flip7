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
  assert.deepEqual([...reloaded.values].sort((a, b) => a - b), [9, 13]);
  assert.equal(reloaded.hasRegular13, true);
  assert.equal(reloaded.cardCount, 2);
});

test('clearLine resets stored line to empty', () => {
  const store = createFakeStore();
  saveLine(addCardToLine(createEmptyLine(), 9), store);
  clearLine(store);
  assert.deepEqual(loadLine(store), createEmptyLine());
});
