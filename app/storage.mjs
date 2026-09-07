import { createEmptySeen } from './shoe.mjs';
import { createEmptyLine } from './line.mjs';
import { createEmptyRoundSeen } from './round.mjs';

const SEEN_KEY = 'flip7.shoe.seen.v2';
const LINE_KEY = 'flip7.myLine.v2';
const ROUND_SEEN_KEY = 'flip7.round.seen.v1';

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
    sevenKind: parsed.sevenKind,
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
      sevenKind: line.sevenKind,
      cardCount: line.cardCount,
    })
  );
}

export function clearLine(store = localStorage) {
  store.removeItem(LINE_KEY);
}

export function loadRoundSeen(store = localStorage) {
  const raw = store.getItem(ROUND_SEEN_KEY);
  return raw ? JSON.parse(raw) : createEmptyRoundSeen();
}

export function saveRoundSeen(roundSeen, store = localStorage) {
  store.setItem(ROUND_SEEN_KEY, JSON.stringify(roundSeen));
}

export function resetRoundSeen(store = localStorage) {
  store.removeItem(ROUND_SEEN_KEY);
}
