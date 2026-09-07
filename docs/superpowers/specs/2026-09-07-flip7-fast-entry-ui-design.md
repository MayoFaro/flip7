# Flip 7 – Fast Card-Entry UI (Removal, Swap/Steal, Granular Special Cards)

Date: 2026-09-07
Status: Approved for planning

## Context

The v1 advisor (see [2026-09-07-flip7-card-counter-design.md](2026-09-07-flip7-card-counter-design.md))
only supports *adding* cards: a card revealed to someone else, or a card
added to the player's own line. It has no way to represent what actually
happens once Action cards start flying in *With a Vengeance*: an opponent
can **Steal** a card right out of the player's line, or force a **Swap**
between the player and anyone else. The player's line, once populated,
was write-only.

This round adds fast chip-style entry, the ability to remove a card from
the player's line (a steal against them), and a way to pick up a card
that was already revealed earlier this round but isn't currently in the
player's line (a steal *by* them, or their half of a swap) — without
ever double-counting it against the shared shoe.

## Goals

- Chip-style selectors for every Number card value (0–13, including the
  three Special Number cards) in both entry areas, plus **individual**
  chips for each of the 11 Modifier/Action card types (replacing the
  single lumped "Autre" button).
- Let the player remove a card from their own line (they got stolen from).
- Let the player add an already-revealed-this-round card to their line
  without incrementing the shared shoe tally (they stole it, or received
  it via Swap) — modeled as two independent primitives (remove; take from
  pool), not a combined gesture, so a pure steal, a pure gift, and a swap
  (one of each, done in sequence) are all just the same two building blocks.
- Keep the Unlucky 7 / Lucky 13 special-card effects correct no matter
  which of the three entry paths (draw, take-from-pool) puts the card in
  the player's line.
- Zero regression risk to the already-verified `engine.mjs` bust/EV math:
  this round is purely additive to it.

## Non-goals

- Tracking *which* opponent holds a given card, or opponents' scores —
  unchanged from v1's non-goal; the pool only needs "is at least one
  outstanding copy of this (value, kind) not currently in my line,"
  never who holds it.
- A dedicated single "swap" gesture that picks both cards in one motion —
  explicitly decided against; two independent taps (remove, then take)
  cover it.
- Manual correction of `roundSeen` (the new round-scoped tally) — if it's
  ever wrong, "Nouveau round" already clears it, which is cheap enough
  that a dedicated correction UI isn't worth building. (The existing
  manual-edit panel for the shoe-lifetime `seen` tally, including its
  extension to the 11 new granular Modifier/Action types, is in scope —
  see UI layout.)

## New concept: the round-scoped reveal tally

`seen` (from v1) answers "how many of this card are left in the shoe
since the last reshuffle" — it lives for the whole shoe's life, spanning
many rounds. Steal and Swap only ever move a card that is **currently in
front of some player**, which is a *round-scoped* fact: once a round
ends, those cards are set aside and are no longer swappable. So this
needs a second, independent tally, `roundSeen`, counting Number cards
revealed **this round** (by anyone, through either entry area). It:

- Only tracks Number cards (0–13, regular/special) — Modifier/Action
  cards are never swappable in this design (see Non-goals).
- Persists across a mid-round Reshuffle (cards in front of players are
  explicitly untouched by a reshuffle, per the rulebook), exactly
  mirroring how `line` already survives a Reshuffle in v1.
- Resets to empty on "Nouveau round" and "Nouvelle partie" — never on
  Reshuffle.

**The pool is derived, not stored.** For a given (value, kind), the
number of outstanding copies available to take is:

```
poolAvailable(value, kind) = roundSeen[value][kind] - mineCount(value, kind)
```

where `mineCount` reads how many of that exact (value, kind) are
*currently* in the player's own line (0 or 1 for every card except a
doubled 13, which can be 2). Nothing else needs to track "who has it" —
removing a card from the line increases its derived pool availability
next render; taking a card from the pool decreases it. No separate
ownership ledger, no per-physical-card identity.

## The `mineCount` gap this surfaces: value 7 needs a kind flag too

`line` already disambiguates 13 via two booleans (`hasRegular13`,
`hasLucky13`) — necessary because both can be held at once. Value 7 can
never be held as both at once (drawing Unlucky 7 always discards
whatever 7 was there and replaces it), but `line` currently has no way
to tell, for a *held* 7, whether it's the regular or the special one —
information `mineCount` needs to compute pool availability correctly
when both a regular 7 and Unlucky 7 have been revealed this round and
only one is the player's.

**Fix:** add `sevenKind: null | 'regular' | 'special'` to the `Line`
shape, set exactly like `hasRegular13` is set today, and cleared on
removal.

## Data model changes

```
// app/line.mjs — Line shape, extended
Line = {
  values: Set<number>,
  hasRegular13: boolean,
  hasLucky13: boolean,
  sevenKind: null | 'regular' | 'special',  // NEW
  cardCount: number,
}
```

`addCardToLine(line, value)` gains one line: set `sevenKind: 'regular'`
when `value === 7` (pass through unchanged otherwise). `addUnlucky7Card`
sets `sevenKind: 'special'` in its reset object (it already discards
everything else). `addLucky13Card` passes `sevenKind` through unchanged.
`createEmptyLine` initializes it to `null`.

**New: `removeCardFromLine(line, value)`.** No `kind` parameter — every
value has at most one unambiguous "thing to remove" once you apply the
automatic rule below:

- Plain values (1–6, 8–12), and 0: delete `value` from `values`,
  decrement `cardCount`. If not currently held, return `line` unchanged
  (a harmless no-op — the UI only ever offers removal for a currently
  held chip, so this is a defensive fallback, not a real path).
- 7: delete `7` from `values`, set `sevenKind: null`, decrement
  `cardCount`.
- 13, **automatic default rule**: if `hasLucky13` is true, clear it
  first (`hasLucky13: false`; `values` keeps `13` if `hasRegular13` is
  still true, otherwise loses it too); else if `hasRegular13` is true,
  clear it (`hasRegular13: false`, `values` loses `13`). Either branch
  decrements `cardCount` by 1. Rationale: an opponent stealing is more
  likely targeting the flashy Special Number card than an ordinary 13,
  and this keeps the removal UI simple (one "13" chip to tap, not two).

**Taking a card from the pool** is not a new line-mutation function — it
reuses `addCardToLine` / `addLucky13Card` / `addUnlucky7Card` exactly as
a normal draw would (so a stolen Unlucky 7 still resets the line, and
stealing a duplicate value still busts, matching "your cards are never
safe" — With a Vengeance's whole premise). The only difference from a
normal draw is that it does **not** call `logCardSeen`/`logRoundCard`,
since the card was already tallied when first revealed this round.

## `app/round.mjs` (new module)

```
createEmptyRoundSeen(): RoundSeen        // { [0..13]: {regular, special} }, Number cards only
logRoundCard(roundSeen, value, kind): RoundSeen   // same overcount guard shape as shoe.mjs's logCardSeen; immutable
mineCount(line, value, kind): number     // 0/1, except 13 which can be 0/1/2; reads sevenKind for value 7
poolAvailable(roundSeen, line, value, kind): number   // roundSeen[value][kind] - mineCount(...)
```

## Granular Modifier/Action tracking (`app/deck.mjs`, `app/shoe.mjs`)

`deck.mjs` gains two maps describing the 11 individual card types:

```
MODIFIER_TYPES = {
  minus2:  { label: '-2',  max: 1 },
  minus4:  { label: '-4',  max: 1 },
  minus6:  { label: '-6',  max: 1 },
  minus8:  { label: '-8',  max: 1 },
  minus10: { label: '-10', max: 1 },
  div2:    { label: '÷2',  max: 1 },
}
ACTION_TYPES = {
  justOneMore: { label: 'Encore une', max: 2 },
  swap:        { label: 'Échange',    max: 2 },
  steal:       { label: 'Vol',        max: 2 },
  discard:     { label: 'Défausse',   max: 2 },
  flipFour:    { label: 'Flip Four',  max: 2 },
}
```

`MODIFIERS_TOTAL`/`ACTIONS_TOTAL` (already consumed by `engine.mjs`'s `M`
bucket) become derived by summing these maps' `max` values, instead of
hand-typed constants — still 6 and 10, now impossible to drift out of
sync with the granular breakdown.

**`shoe.mjs` stays 100% backward compatible.** `seen.other` remains the
single stored scalar `engine.mjs` and `totalUndrawn` already read — *no
existing function changes behavior*. Two new fields are added alongside
it, and a new function keeps all three in lockstep:

```
seen.modifierTypes = { minus2: 0, minus4: 0, ... }   // NEW
seen.actionTypes   = { justOneMore: 0, swap: 0, ... } // NEW
seen.other                                            // UNCHANGED meaning, now always kept equal
                                                       // to the sum of the two maps above

logSpecialCardSeen(seen, category, id): Seen
  // category: 'modifier' | 'action'. Throws if that id's count would exceed its max
  // (same overcount-guard style as logCardSeen). Returns a new `seen` with the specific
  // type incremented AND `other` recomputed as sum(modifierTypes) + sum(actionTypes) —
  // never independently settable, so it can't drift.
```

The UI's 11 individual chips call `logSpecialCardSeen` instead of the old
`logCardSeen(seen, 'other', null)` path; that old path stays in
`shoe.mjs` unchanged (still exercised by v1's tests) but is no longer
wired to any button. The existing manual-edit panel (v1) extends with one
number input per Modifier/Action type, in scope for this round —
consistent with every other trackable count already having one. Its
change handler must go through the same "set the type, recompute `other`
as the sum" step `logSpecialCardSeen` uses, never writing `seen.other`
directly, so the three fields can never drift apart.

## UI layout

Three areas replace the current two:

1. **"Cartes des autres joueurs"** — unchanged Number-card chips (now
   also logging to `roundSeen`), plus the 11 new Modifier/Action chips
   replacing the single "Autre" button.
2. **"Ma ligne"** — the existing add-chips (also logging to `roundSeen`),
   plus a live list of the player's currently held cards, each rendered
   as a chip with a plain "×" button that calls `removeCardFromLine` for
   that value. As with v1, this is functional-not-designed markup —
   visual polish stays deferred to a later pass; the requirement here is
   only that every held card has a working removal control.
3. **"Disponible pour échange" (new)** — one chip per (value, kind) whose
   `poolAvailable(...) > 0`, tap to take (adds to the line via the same
   add-functions as a draw, without touching `seen`/`roundSeen`). Chips
   with zero availability aren't rendered at all — the list is naturally
   short in practice, since it only ever holds cards revealed this round
   that the player doesn't currently hold.

Round-boundary controls, updated:

- **Nouveau round**: clears `line` **and** resets `roundSeen` (both are
  round-scoped). Shared `seen` is untouched, as in v1.
- **Reshuffle**: unchanged from v1 — resets `seen` only.
- **Nouvelle partie**: resets `seen`, `roundSeen`, and `line`.

`app/storage.mjs` gains `loadRoundSeen`/`saveRoundSeen`/`resetRoundSeen`,
mirroring the existing `*Seen` functions, under a new storage key.

## Testing

- `tests/round.test.mjs`: `logRoundCard` immutability and overcount guard
  (mirrors `shoe.test.mjs`'s style); `mineCount` for every disambiguation
  case (plain value, 7 held as regular vs. special, 13 held as one/both);
  `poolAvailable` arithmetic including the case where two different kinds
  of the same value were both revealed this round and only one is held.
- `tests/line.test.mjs` additions: `removeCardFromLine` for a plain value,
  for 7 (clears `sevenKind`), and for 13 in both automatic-rule orderings
  (Lucky-only held, regular-only held, both held); a no-op removal on an
  unheld value.
- `tests/shoe.test.mjs` additions: `logSpecialCardSeen` increments both
  the specific type and the recomputed `other`; throws once a specific
  type's own max is reached even though `other`'s combined max (16) isn't;
  `other` is never independently writable through the new function.
- `tests/deck.test.mjs` additions: `MODIFIERS_TOTAL`/`ACTIONS_TOTAL`
  still equal 6/10 when derived from the new maps (guards against a
  future edit to one map silently changing the totals `engine.mjs`
  depends on).
- No changes needed to `tests/engine.test.mjs` — `engine.mjs` itself is
  untouched by this round.
