// app/round.mjs
import { CARD_VALUES, SHOE_BASE, MODIFIER_TYPES, ACTION_TYPES } from './deck.mjs';

export function createEmptyRoundSeen() {
  const roundSeen = { modifierTypes: {}, actionTypes: {} };
  for (const v of CARD_VALUES) {
    roundSeen[v] = { regular: 0, special: 0 };
  }
  for (const id of Object.keys(MODIFIER_TYPES)) roundSeen.modifierTypes[id] = 0;
  for (const id of Object.keys(ACTION_TYPES)) roundSeen.actionTypes[id] = 0;
  return roundSeen;
}

export function logRoundCard(roundSeen, value, kind) {
  const next = { modifierTypes: { ...roundSeen.modifierTypes }, actionTypes: { ...roundSeen.actionTypes } };
  for (const v of CARD_VALUES) next[v] = { ...roundSeen[v] };

  const max = SHOE_BASE[value][kind];
  next[value][kind] = Math.min(roundSeen[value][kind] + 1, max);
  return next;
}

// Modifier/Action cards are shown in the swap pool purely as information
// (how many of this type were revealed this round) — Line never tracks who
// holds one, so there's nothing to "take" here, unlike Number cards. Clamps
// rather than throws for the same reason logRoundCard does: a mid-round
// Reshuffle can make more copies legitimately reappear than a single
// shoe's max would allow, and this tally must never block the shared
// shoe-lifetime tally it's logged alongside.
export function logRoundSpecialCard(roundSeen, category, id) {
  const types = category === 'modifier' ? MODIFIER_TYPES : ACTION_TYPES;
  const max = types[id].max;
  const key = category === 'modifier' ? 'modifierTypes' : 'actionTypes';
  const next = { modifierTypes: { ...roundSeen.modifierTypes }, actionTypes: { ...roundSeen.actionTypes } };
  for (const v of CARD_VALUES) next[v] = { ...roundSeen[v] };
  next[key][id] = Math.min(roundSeen[key][id] + 1, max);
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
