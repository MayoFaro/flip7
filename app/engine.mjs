// app/engine.mjs
import { CARD_VALUES, MODIFIERS_TOTAL, ACTIONS_TOTAL } from './deck.mjs';
import { remainingCount, totalUndrawn } from './shoe.mjs';
import { computeRawScore } from './line.mjs';

export function computeBuckets(seen, line) {
  const D = totalUndrawn(seen);
  let R = 0;
  let U = 0;
  let S = 0;

  for (const v of CARD_VALUES) {
    const remReg = remainingCount(seen, v, 'regular');
    const remSpec = remainingCount(seen, v, 'special');

    if (v === 7) {
      if (line.values.has(7)) {
        R += remReg;
      } else {
        S += remReg;
      }
      if (line.values.size === 0) {
        S += remSpec; // empty line: Unlucky 7 is just a normal safe first card
      } else {
        U += remSpec; // non-empty line: drawing it resets the line
      }
      continue;
    }

    if (v === 13) {
      if (line.hasRegular13) {
        R += remReg; // a further regular 13 always busts once you hold one
      } else {
        S += remReg;
      }
      S += remSpec; // Lucky 13 never busts, regardless of hasRegular13
      continue;
    }

    if (line.values.has(v)) {
      R += remReg;
    } else {
      S += remReg + remSpec; // covers The Zero (v=0) too: remReg is always 0 there
    }
  }

  const M = MODIFIERS_TOTAL + ACTIONS_TOTAL - seen.other;

  return { R, U, S, M, D };
}

export function assertPartition(buckets) {
  const { R, U, S, M, D } = buckets;
  if (R + U + S + M !== D) {
    throw new Error(
      `Partition invariant violated: R(${R})+U(${U})+S(${S})+M(${M}) = ${R + U + S + M} !== D(${D})`
    );
  }
}

export function computeProbabilities(buckets) {
  const { R, U, S, M, D } = buckets;
  if (D === 0) return { bust: 0, reset: 0, progress: 0, neutral: 0 };
  return { bust: R / D, reset: U / D, progress: S / D, neutral: M / D };
}

function isSafeCard(line, v, kind) {
  if (v === 13 && kind === 'special') return true;      // Lucky 13 never busts
  if (v === 13 && kind === 'regular') return !line.hasRegular13;
  if (v === 7 && kind === 'regular') return !line.values.has(7);
  return !line.values.has(v);
}

export function computeExpectedValue(seen, line) {
  const D = totalUndrawn(seen);
  const rawScore = computeRawScore(line);
  if (D === 0) return rawScore;

  let ev = 0;

  for (const v of CARD_VALUES) {
    for (const kind of ['regular', 'special']) {
      const rem = remainingCount(seen, v, kind);
      if (rem === 0) continue;

      if (v === 7 && kind === 'special') {
        if (line.values.size === 0) {
          const bonus = line.cardCount + 1 === 7 ? 15 : 0;
          ev += (rem / D) * (rawScore + 7 + bonus);
        } else {
          ev += (rem / D) * 7; // reset outcome: score drops to just the 7
        }
        continue;
      }

      if (!isSafeCard(line, v, kind)) continue; // bust card contributes 0

      const bonus = line.cardCount + 1 === 7 ? 15 : 0;
      ev += (rem / D) * (rawScore + v + bonus);
    }
  }

  const M = MODIFIERS_TOTAL + ACTIONS_TOTAL - seen.other;
  ev += (M / D) * rawScore;

  return ev;
}

export function recommend(seen, line) {
  const buckets = computeBuckets(seen, line);
  assertPartition(buckets);
  const probabilities = computeProbabilities(buckets);
  const ev = computeExpectedValue(seen, line);
  const rawScore = computeRawScore(line);
  const action = ev > rawScore ? 'HIT' : 'STAY';
  return { buckets, probabilities, ev, rawScore, action };
}
