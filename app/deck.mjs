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

export const MODIFIERS_TOTAL = 6; // -2, -4, -6, -8, -10, ÷2 — one copy each
export const ACTIONS_TOTAL = 10;  // Just One More, Swap, Steal, Discard, Flip Four — two copies each

export const TOTAL_CARDS =
  CARD_VALUES.reduce((sum, v) => sum + SHOE_BASE[v].regular + SHOE_BASE[v].special, 0) +
  MODIFIERS_TOTAL +
  ACTIONS_TOTAL;
