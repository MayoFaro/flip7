export function createEmptyLine() {
  return { values: new Set(), hasRegular13: false, hasLucky13: false, cardCount: 0 };
}

export function addCardToLine(line, value) {
  const values = new Set(line.values);
  values.add(value);
  return {
    values,
    hasRegular13: line.hasRegular13 || value === 13,
    hasLucky13: line.hasLucky13,
    cardCount: line.cardCount + 1,
  };
}

export function addLucky13Card(line) {
  const values = new Set(line.values);
  values.add(13);
  return {
    values,
    hasRegular13: line.hasRegular13,
    hasLucky13: true,
    cardCount: line.cardCount + 1,
  };
}

export function addUnlucky7Card(line) {
  return { values: new Set([7]), hasRegular13: false, hasLucky13: false, cardCount: 1 };
}

export function computeRawScore(line) {
  const hasZero = line.values.has(0);
  const completedFlip7 = line.cardCount >= 7;
  if (hasZero && !completedFlip7) return 0;

  let sum = 0;
  for (const v of line.values) sum += v;
  if (line.hasRegular13 && line.hasLucky13) sum += 13; // count the second 13 too
  return sum;
}
