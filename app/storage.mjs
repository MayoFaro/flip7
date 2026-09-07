import { createEmptySeen } from './shoe.mjs';
import { createEmptyLine } from './line.mjs';

const SEEN_KEY = 'flip7.shoe.seen.v1';
const LINE_KEY = 'flip7.myLine.v1';

export function loadSeen(store = localStorage) {
  const raw = store.getItem(SEEN_KEY);
  return raw ? JSON.parse(raw) : createEmptySeen();
}

export function saveSeen(seen, store = localStorage) {
  store.setItem(SEEN_KEY, JSON.stringify(seen));
}

export function resetSeen(store = localStorage) {
  store.removeItem(SEEN_KEY);
}

export function loadLine(store = localStorage) {
  const raw = store.getItem(LINE_KEY);
  if (!raw) return createEmptyLine();
  const parsed = JSON.parse(raw);
  return {
    values: new Set(parsed.values),
    hasRegular13: parsed.hasRegular13,
    hasLucky13: parsed.hasLucky13,
    cardCount: parsed.cardCount,
  };
}

export function saveLine(line, store = localStorage) {
  store.setItem(
    LINE_KEY,
    JSON.stringify({
      values: [...line.values],
      hasRegular13: line.hasRegular13,
      hasLucky13: line.hasLucky13,
      cardCount: line.cardCount,
    })
  );
}

export function clearLine(store = localStorage) {
  store.removeItem(LINE_KEY);
}
