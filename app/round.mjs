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
  next[value][kind] = Math.min(roundSeen[value][kind] + 1, max);
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
