# Flip 7 – Live Hit/Stay Advisor

Date: 2026-09-07
Status: Approved for planning

## Context

*Flip 7 – With a Vengeance* is a press-your-luck card game. Each round,
players are dealt one Number card at a time and, on each subsequent
card, choose to **hit** (take another card) or **stay** (bank the
score built so far). Drawing a second card of a value you already
hold **busts** you (score zero for the round). Drawing 7 different
Number card values ends the round instantly for everyone and awards a
15-point bonus.

Unlike blackjack, the Number-card deck is a single 108-card shoe that
is **not reshuffled between rounds** — only when it runs out entirely
(discards are then shuffled to form a new deck). This means every
card revealed to any player, in any round, is information that stays
valid until the next reshuffle. That property is what makes counting
cards worthwhile here: the player can know the *exact* probability of
busting on their next hit, not just a rough estimate.

The goal of this project is a live companion tool a player runs on
their phone during a physical game: they log every Number card
revealed (to any player) as it happens, log which cards are in their
own line, and the tool tells them their exact bust probability and a
hit/stay recommendation.

## Goals (v1)

- Track the shared, persistent shoe state (which cards have been
  revealed since the last reshuffle) across an entire game (many
  rounds).
- Track the user's own line of cards for the current round.
- Compute the exact probability of busting on the next hit, accounting
  for the two Special Number cards that change bust math (Lucky 13,
  Unlucky 7) and where they currently sit (still in the shoe, in the
  user's own line, or already gone to another player / discarded).
- Give a hit/stay recommendation based on expected value.
- Run as an installable, offline-capable PWA — no backend, no account.

## Non-goals (v1)

- Tracking opponents' individual lines/scores (not needed for the
  math — only *how many of each card are gone from the shoe* matters).
- Modeling Action card multiplayer interactions (Swap, Steal, Discard,
  Just One More, Flip Four) beyond noting that any card they cause to
  be revealed must still be logged like any other reveal.
- Modeling the risk that staying doesn't fully protect you (an
  opponent can force a Just One More / Flip Four onto a stayed
  player). Called out as a UI caveat only.
- Camera/OCR card recognition, native Android app, multi-device sync,
  game history/replay. Possible future phases.

## Deck composition (ground truth, verified against the rulebook)

| Value | Regular copies | Special card | Total |
|-------|----------------|---------------|-------|
| 0 | 0 | The Zero ×1 | 1 |
| 1 | 1 | – | 1 |
| 2 | 2 | – | 2 |
| 3 | 3 | – | 3 |
| 4 | 4 | – | 4 |
| 5 | 5 | – | 5 |
| 6 | 6 | – | 6 |
| 7 | 6 | Unlucky 7 ×1 | 7 |
| 8 | 8 | – | 8 |
| 9 | 9 | – | 9 |
| 10 | 10 | – | 10 |
| 11 | 11 | – | 11 |
| 12 | 12 | – | 12 |
| 13 | 12 | Lucky 13 ×1 | 13 |

Number cards total: 92. Modifier cards (-2,-4,-6,-8,-10,÷2, one copy
each): 6. Action cards (Just One More, Swap, Steal, Discard, Flip
Four, two copies each): 10. **Grand total: 108**, matching the box
contents.

Special-card rules that affect bust math (from the rulebook):

- **Unlucky 7**: "You cannot bust on an Unlucky 7 when you get it."
  Drawing it never busts you, regardless of what you already hold.
  If your line was non-empty, it discards every other card you hold
  and keeps only the 7 (a partial-loss outcome, not a bust, not a
  no-op either).
- **Lucky 13**: lets you hold a second 13-valued card without
  busting ("You'll score both and they both count toward the Flip 7
  bonus... flip a third 13 and you'll bust"). So the bust threshold
  for value 13 is 2 cards instead of 1, but only via this specific
  card — a second *regular* 13 still busts you the normal way.
- **The Zero**: only one copy exists, so it can never be duplicated —
  zero bust risk, ever. It zeroes your round score unless you still
  reach Flip 7. Pure scoring note, not a probability concern.

## Data model

```
shoe.base = {            // constant, from the table above
  0:  { regular: 0,  special: 1 },
  1:  { regular: 1,  special: 0 },
  ...
  7:  { regular: 6,  special: 1 },
  ...
  13: { regular: 12, special: 1 },
}
shoe.modifiersTotal = 6
shoe.actionsTotal   = 10

shoe.seen = {             // mutable, persists across rounds,
  0:  { regular: 0, special: 0 },   // reset to all-zero only on reshuffle
  ...
  13: { regular: 0, special: 0 },
  other: 0                          // modifier + action cards seen, lumped
}

myLine = {
  values: Set<number>,    // distinct values held this round (0-13)
  count13: 0 | 1 | 2,     // 13-valued cards held (regular + Lucky 13 combined)
  cardCount: number,      // number cards actually in hand (== values.size,
                           // except +1 if count13 == 2, since Lucky 13 is a
                           // second card that doesn't add a new distinct value)
  rawScore: number,       // sum of held card values (0 if Zero held and no Flip 7 yet)
}
```

`remaining(v, kind) = shoe.base[v][kind] - shoe.seen[v][kind]`
`D = 108 - (Σ seen[v].regular + Σ seen[v].special + seen.other)`  — cards left undrawn in the shoe.

## Decision engine

Every remaining card in the shoe falls into exactly one of four
buckets on the next hit. The implementation must assert
`D === R + U + S + M` as a runtime consistency check.

**R — bust risk** (drawing any of these busts the player):
- For every plain value `v` in `myLine.values` (v not in {0,7,13}):
  add `remaining(v, 'regular')`.
- If `7 ∈ myLine.values`: add `remaining(7, 'regular')`.
  (The Unlucky 7 copy is never a bust risk — handled under U instead.)
- If `myLine.count13 >= 1`: add `remaining(13, 'regular')`.
  (The Lucky 13 copy is never a bust risk.)
- Value 0 never contributes (only one copy exists in the whole game).

**U — Unlucky 7 reset** (only meaningful, i.e. only a *loss*, when the
line is non-empty; if the line is empty this card is just a normal
safe add and its copy is counted under S instead):
- If `myLine.values` is non-empty: `U = remaining(7, 'special')`.
- Else: `U = 0` (folded into S).

**S — safe progress** (adds a new distinct value, possibly completing
Flip 7): every `remaining(v, kind)` pair not already claimed by R or
U above — i.e. every card whose value is not already held, plus the
Lucky 13 copy if `count13 < 2`, plus the Unlucky 7 copy when the line
is empty.

**M — neutral**: `M = (shoe.modifiersTotal + shoe.actionsTotal) - shoe.seen.other`.

Headline outputs:
- `P(bust) = R / D`
- `P(reset) = U / D`
- `P(progress) = S / D`
- `P(neutral) = M / D`

**Expected value of hitting**, computed per remaining card rather than
per bucket (so differently-valued safe cards are weighted correctly):

```
EV(hit) = Σ over safe (v, kind) pairs:
            [remaining(v,kind) / D] × (rawScore + v + flip7Bonus(v, kind))
          + (U / D) × 7
          + (M / D) × rawScore
```
where `flip7Bonus(v, kind) = 15` if taking this card brings
`myLine.cardCount` to 7, else 0. Lucky 13 increments `cardCount`
without adding a new distinct value (see data model above), so it can
also trigger the bonus at the right threshold.

**Recommendation**: `HIT` if `EV(hit) > rawScore` (the guaranteed value
of staying), else `STAY`. The bust percentage is always shown as the
primary number; the recommendation is secondary, with a visible
caveat that staying is not perfectly safe (an opponent can still force
a card onto you via an Action card, which this tool does not model).

## Edge cases & error handling

- **Reshuffle**: an explicit "Reshuffle" action resets `shoe.seen` to
  all zeros (108 available again). The deck is never auto-reset on a
  round change — only `myLine` is cleared when a new round starts.
- **Overcounting guard**: `shoe.seen[v][kind]` can never exceed
  `shoe.base[v][kind]`; the UI must reject/flag a tap that would push
  it over, since that indicates a mis-entry.
- **Undo**: single-level undo of the last logged event (covers the
  common mis-tap case without building a full history stack).
- **Manual correction**: remaining counts must be directly editable,
  not just increment-only, so a miscount can be fixed without
  restarting the shoe.
- **New round**: clears `myLine` only; `shoe.seen` carries over
  untouched.
- **New game**: resets both `shoe.seen` and `myLine`.

## Architecture

Client-only PWA: plain HTML/CSS/JS, no build step, no backend.
`localStorage` holds `shoe.seen` and `myLine` so a reload (or the
phone locking) doesn't lose game state. A `manifest.json` plus a
minimal service worker make it installable and usable with a flaky
connection at the table. The decision engine (the math above) is
implemented as a set of pure functions with no DOM/storage
dependencies, so it can be unit tested in isolation from the UI.

UI/UX (the tap grid, the "my line" editor, layout) is explicitly
deferred to a follow-up design pass, per the user's request — this
spec only fixes the data model and the math it must expose.

## Testing

The decision engine is pure functions, so plain Node scripts (no test
framework needed given the project's size) covering:
- The `D = R + U + S + M` partition holds for arbitrary shoe/line
  states, including the empty-shoe and empty-line edges.
- Lucky 13 scenarios: holding 0, 1 (regular), and 1 (Lucky 13) copies
  of value 13 each produce the correct R and S contributions; holding
  2 (one of each) makes any further 13 pure bust risk.
- Unlucky 7 scenarios: empty line (folds into S) vs non-empty line
  (counted under U, not R) vs. a plain duplicate value bust (must
  land in R, not U).
- Flip 7 bonus fires exactly at the transition to a 7th card,
  including via the Lucky 13 card-count-without-new-value path.
- Hand-computed EV for a couple of concrete example states, checked
  against the formula.
