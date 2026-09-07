export function createEmptyLine() {
  return { values: new Set(), hasRegular13: false, hasLucky13: false, sevenKind: null, cardCount: 0 };
}

export function addCardToLine(line, value) {
  const values = new Set(line.values);
  values.add(value);
  return {
    values,
    hasRegular13: line.hasRegular13 || value === 13,
    hasLucky13: line.hasLucky13,
    sevenKind: value === 7 ? 'regular' : line.sevenKind,
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
    sevenKind: line.sevenKind,
    cardCount: line.cardCount + 1,
  };
}

export function addUnlucky7Card(line) {
  return { values: new Set([7]), hasRegular13: false, hasLucky13: false, sevenKind: 'special', cardCount: 1 };
}

export function removeCardFromLine(line, value) {
  if (!line.values.has(value)) return line;

  if (value === 13) {
    const values = new Set(line.values);
    if (line.hasLucky13) {
      if (!line.hasRegular13) values.delete(13);
      return {
        values,
        hasRegular13: line.hasRegular13,
        hasLucky13: false,
        sevenKind: line.sevenKind,
        cardCount: line.cardCount - 1,
      };
    }
    values.delete(13);
    return {
      values,
      hasRegular13: false,
      hasLucky13: line.hasLucky13,
      sevenKind: line.sevenKind,
      cardCount: line.cardCount - 1,
    };
  }

  const values = new Set(line.values);
  values.delete(value);
  return {
    values,
    hasRegular13: line.hasRegular13,
    hasLucky13: line.hasLucky13,
    sevenKind: value === 7 ? null : line.sevenKind,
    cardCount: line.cardCount - 1,
  };
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
