import { CARD_VALUES, SHOE_BASE, MODIFIERS_TOTAL, ACTIONS_TOTAL, MODIFIER_TYPES, ACTION_TYPES } from './deck.mjs';

export function createEmptySeen() {
  const seen = { other: 0, modifierTypes: {}, actionTypes: {} };
  for (const v of CARD_VALUES) {
    seen[v] = { regular: 0, special: 0 };
  }
  for (const id of Object.keys(MODIFIER_TYPES)) seen.modifierTypes[id] = 0;
  for (const id of Object.keys(ACTION_TYPES)) seen.actionTypes[id] = 0;
  return seen;
}

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
