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
