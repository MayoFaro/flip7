// tests/round.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_VALUES } from '../app/deck.mjs';
import { createEmptyRoundSeen, logRoundCard, mineCount, poolAvailable } from '../app/round.mjs';
import { createEmptyLine, addCardToLine, addLucky13Card, addUnlucky7Card, removeCardFromLine } from '../app/line.mjs';

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

test('logRoundCard clamps at the deck copy count instead of throwing', () => {
  let roundSeen = createEmptyRoundSeen();
  roundSeen = logRoundCard(roundSeen, 1, 'regular'); // only 1 copy of value 1 exists
  roundSeen = logRoundCard(roundSeen, 1, 'regular'); // would exceed 1, but must clamp, not throw
  assert.equal(roundSeen[1].regular, 1);
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

test('poolAvailable is restored after a card taken into the line is later removed from it', () => {
  let roundSeen = createEmptyRoundSeen();
  roundSeen = logRoundCard(roundSeen, 9, 'regular');
  let line = createEmptyLine();
  line = addCardToLine(line, 9);
  line = removeCardFromLine(line, 9);
  assert.equal(poolAvailable(roundSeen, line, 9, 'regular'), 1);
});

test('poolAvailable accounts for both kinds of a doubled 13', () => {
  let roundSeen = createEmptyRoundSeen();
  roundSeen = logRoundCard(roundSeen, 13, 'regular');
  roundSeen = logRoundCard(roundSeen, 13, 'special');
  let line = createEmptyLine();
  line = addCardToLine(line, 13);
  line = addLucky13Card(line);
  assert.equal(poolAvailable(roundSeen, line, 13, 'regular'), 0);
  assert.equal(poolAvailable(roundSeen, line, 13, 'special'), 0);
});
