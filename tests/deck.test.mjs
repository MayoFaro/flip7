// tests/deck.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_VALUES, SHOE_BASE, MODIFIER_TYPES, ACTION_TYPES, MODIFIERS_TOTAL, ACTIONS_TOTAL, TOTAL_CARDS } from '../app/deck.mjs';

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
