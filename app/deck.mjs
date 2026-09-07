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

export const TOTAL_CARDS =
  CARD_VALUES.reduce((sum, v) => sum + SHOE_BASE[v].regular + SHOE_BASE[v].special, 0) +
  MODIFIERS_TOTAL +
  ACTIONS_TOTAL;
