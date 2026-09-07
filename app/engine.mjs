// app/engine.mjs
import { CARD_VALUES, MODIFIERS_TOTAL, ACTIONS_TOTAL } from './deck.mjs';
import { remainingCount, totalUndrawn } from './shoe.mjs';

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
