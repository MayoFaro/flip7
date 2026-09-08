# Flip 7 Desktop (Python) — Design Spec

**Status:** Approved for spec write-up (2026-09-08). Awaiting user review of this document before an implementation plan is written.

## Context

The Flip 7 hit/stay advisor currently exists as a web PWA (`app/*.mjs`), built and iterated on extensively in this repo: a shoe-lifetime card tally, a round-scoped swap/steal pool, a player-line model with the Lucky-13/Unlucky-7/Zero special-card edge cases, a bust-probability + EV engine, and a 3-column fast-entry UI. That implementation is considered correct and final — every rule edge case (Lucky 13 vs regular 13, Unlucky 7 reset, Zero's score suppression, mid-round reshuffle leaving held cards untouched) was found and fixed through several rounds of review, and is pinned down by ~75 passing tests.

The web app's one real limitation for live play: a browser tab is easy to lose behind other windows during a fast-moving game. The user wants the identical model as a native desktop app that can be pinned "always on top" so it's never hidden mid-round. They pointed to their own existing project, `github.com/MayoFaro/orapa` (PySide6/Qt), as the UI reference: compact fixed-size chip grids built from `QGridLayout`, `QGroupBox` for visual sectioning, `QButtonGroup` with checkable buttons for exclusive selection, and minimal stat-label panels.

This is new-subsystem, new-language work — architectural scope. It lives on its own branch (`flip7-desktop-python`) and in its own top-level directory (`desktop/`), untouched from `app/`. The two apps share no code (different languages) but must share the exact same rules and behavior; the strategy below is a faithful line-by-line port of the JS modules, not an idiomatic from-scratch rewrite, specifically to avoid re-introducing bugs that were already found and fixed once.

## Goals

- Reproduce the web app's exact domain logic (deck composition, shoe tally, line model, round-scoped pool, bust/EV engine) in Python, verified by a pytest suite that mirrors the existing `.mjs` test suite's cases.
- Reproduce the web app's exact interaction model: tap other-player / my-line / pool zones, guided two-step swap, single-tap steal/claim, unlimited undo, recent-cards log, deck-count display, reshuffle partial-correction.
- A native window that stays on top of all other windows at all times, so it can't be hidden behind another app during play.
- Local JSON persistence so state (shoe tally, line, round pool, session) survives an app restart, mirroring the web app's localStorage persistence.

## Non-goals

- No score history, no multi-round/multi-game statistics beyond what the web app already tracks.
- No packaging/installer work (PyInstaller, etc.) — running via `python -m` / an entry point is sufficient for this phase.
- No networking, no shared state between machines — this is a single local desktop tool, same as the web app is a single local browser tool.
- No opponent hand-tracking — the reshuffle correction remains partial, exactly as documented in the web app (`app/app.mjs`'s `seenFromMyLine` comment).
- No redesign of the interaction model or the rules engine — this is a port, not a rethink.

## Tech Stack & Project Structure

- **Language:** Python, floor `>=3.10` (matches the `orapa` reference project).
- **GUI toolkit:** PySide6 (per `orapa` precedent and the user's stated preference).
- **Persistence:** a single local JSON file, `~/.flip7-desktop/state.json` (see Persistence section).
- **Tests:** pytest.
- **Packaging:** `pyproject.toml` with a `src/` layout, same shape as `orapa`.

```
desktop/
  pyproject.toml
  src/flip7_desktop/
    __init__.py
    deck.py            # port of app/deck.mjs
    shoe.py             # port of app/shoe.mjs
    line.py             # port of app/line.mjs
    round_tracker.py     # port of app/round.mjs
    engine.py            # port of app/engine.mjs
    storage.py           # port of app/storage.mjs (JSON file, not localStorage)
    app_state.py          # port of the state-and-interactions half of app/app.mjs
    main.py               # entry point: builds QApplication + MainWindow
    gui/
      __init__.py
      main_window.py      # window layout, wiring, WindowStaysOnTopHint
      chips.py            # reusable button/chip factories
      flow_layout.py       # small wrapping-row layout utility (Qt has no built-in flex-wrap)
  tests/
    test_deck.py
    test_shoe.py
    test_line.py
    test_round_tracker.py
    test_engine.py
    test_storage.py
    test_app_state.py
```

`app_state.py` is a new file with no direct `.mjs` counterpart: in the web app, `app.mjs` mixes pure state-transition logic (snapshot/undo, `logMyCard`, `completeSwap`, `claimPoolModifier`, `seenFromMyLine`, ...) with DOM wiring in one file. For the desktop port, that state-transition half is split out into its own GUI-independent module (`app_state.py`), tested directly with pytest the same way `deck`/`shoe`/`line`/`round_tracker`/`engine` are — the GUI layer (`gui/main_window.py`) becomes a thin wiring layer on top of it, calling its methods and re-rendering. This mirrors the same "keep logic separate from presentation" boundary the web app already has between `engine.mjs` and `app.mjs`, just drawn slightly differently so the state logic is unit-testable without a Qt event loop.

## Domain Logic Port

Each module below is a faithful translation: same function names (snake_case), same parameters, same return shapes, same immutability discipline (every function returns a new object; nothing is mutated in place). Where JS objects (with numeric-string keys) are used as maps in the source, Python `dict`s with `int` keys are used instead — this is the one mechanical adjustment the port makes, since Python doesn't coerce dict keys to strings the way JS object property access does.

### `deck.py`

```python
CARD_VALUES: list[int]  # [0, 1, ..., 13]

SHOE_BASE: dict[int, dict[str, int]]
# e.g. SHOE_BASE[0] == {"regular": 0, "special": 1}

MODIFIER_TYPES: dict[str, dict]
# e.g. MODIFIER_TYPES["minus2"] == {"label": "-2", "max": 1}
# keys: minus2, minus4, minus6, minus8, minus10, div2

ACTION_TYPES: dict[str, dict]
# keys: just_one_more, swap, steal, discard, flip_four
# (snake_case ids — the web app's camelCase ids (justOneMore, flipFour) are
# renamed to snake_case for Python idiom; the *labels* users see are unchanged:
# "Encore une", "Échange", "Vol", "Défausse", "Flip Four")

MODIFIERS_TOTAL: int   # sum of MODIFIER_TYPES[...]["max"]
ACTIONS_TOTAL: int      # sum of ACTION_TYPES[...]["max"]
TOTAL_CARDS: int         # 108, derived exactly as in deck.mjs
```

### `shoe.py`

```python
def create_empty_seen() -> dict: ...
def log_card_seen(seen: dict, value: int, kind: str) -> dict: ...
    # raises ValueError if this would exceed SHOE_BASE[value][kind]
def log_special_card_seen(seen: dict, category: str, type_id: str) -> dict: ...
    # category is "modifier" or "action"; raises ValueError past max
def remaining_count(seen: dict, value: int, kind: str) -> int: ...
def total_undrawn(seen: dict) -> int: ...
```

`seen` shape: `{"other": int, "modifier_types": {id: int}, "action_types": {id: int}, 0: {"regular": int, "special": int}, 1: {...}, ...}`. As in the web version, `seen["other"]` is always recomputed as the sum of `modifier_types` + `action_types` counts inside `log_special_card_seen` — never incremented independently — to keep the two views (aggregate count vs per-type breakdown) from drifting apart.

Deviation from the web version: `logCardSeen`'s legacy `value === 'other'` branch (a leftover from before per-type Modifier/Action tracking existed) is dropped. Nothing in the current web app calls it any more — `logSpecialCardSeen`/`log_special_card_seen` fully replaced it — so the port omits the dead branch rather than translating it.

### `line.py`

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class Line:
    values: frozenset[int]
    has_regular_13: bool
    has_lucky_13: bool
    seven_kind: str | None   # None | "regular" | "special"
    card_count: int

def create_empty_line() -> Line: ...
def add_card_to_line(line: Line, value: int) -> Line: ...
def add_lucky13_card(line: Line) -> Line: ...
def add_unlucky7_card(line: Line) -> Line: ...
def remove_card_from_line(line: Line, value: int) -> Line: ...
def compute_raw_score(line: Line) -> int: ...
```

Behavior (doubled-13 removal rule, Unlucky-7 line-reset-to-just-{7} rule, Zero's score-suppression until `card_count >= 7`) is identical to `line.mjs`. The one implementation adjustment: `Line` is a frozen dataclass with a `frozenset` for `values`, rather than manually copying a JS-style object with a mutable `Set` — Python's dataclass immutability gives the same "always return a new object" guarantee the JS version enforces by convention, so it's used natively instead of hand-rolled.

### `round_tracker.py`

```python
def create_empty_round_seen() -> dict: ...
def log_round_card(round_seen: dict, value: int, kind: str) -> dict: ...
    # clamps at SHOE_BASE[value][kind], never raises (mirrors round.mjs's
    # Math.min behavior — needed so a post-reshuffle seen update is never
    # blocked by a round tally that predates the reshuffle)
def log_round_special_card(round_seen: dict, category: str, type_id: str) -> dict: ...
    # clamps at type max, same reasoning
def mine_count(line: Line, value: int, kind: str) -> int: ...
def pool_available(round_seen: dict, line: Line, value: int, kind: str) -> int: ...
```

### `engine.py`

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class Buckets:
    r: int  # bust
    u: int  # Unlucky-7 reset
    s: int  # safe/progress
    m: int  # neutral (Modifier/Action cards)
    d: int  # total undrawn

def compute_buckets(seen: dict, line: Line) -> Buckets: ...
def assert_partition(buckets: Buckets) -> None: ...
    # raises AssertionError if r+u+s+m != d
def compute_probabilities(buckets: Buckets) -> dict: ...
    # {"bust": float, "reset": float, "progress": float, "neutral": float}
def is_safe_card(line: Line, value: int, kind: str) -> bool: ...
def compute_expected_value(seen: dict, line: Line) -> float: ...

@dataclass(frozen=True)
class Recommendation:
    buckets: Buckets
    probabilities: dict
    ev: float
    raw_score: int
    action: str  # "HIT" | "STAY"

def recommend(seen: dict, line: Line) -> Recommendation: ...
```

All bucket math, including the Zero+Flip7 completing-draw EV special case (`unsuppressed_raw_score`), is translated line-for-line from `engine.mjs` — this file is the highest-risk part of the port (it went through the most review rounds on the web side) and gets no structural changes, only syntax translation.

### `storage.py`

```python
from pathlib import Path
from dataclasses import dataclass

STATE_VERSION = 1
DEFAULT_STATE_PATH = Path.home() / ".flip7-desktop" / "state.json"

@dataclass(frozen=True)
class AppState:
    seen: dict
    line: Line
    round_seen: dict
    recent_cards: list[str]

def load_state(path: Path = DEFAULT_STATE_PATH) -> AppState: ...
    # Returns a fresh default AppState (create_empty_seen/create_empty_line/
    # create_empty_round_seen/[]) if the file is missing, unreadable, or its
    # "version" field doesn't match STATE_VERSION — no migration function,
    # matching the web app's .v1->.v2 precedent of treating an old shape as
    # simply absent rather than crashing on load.
def save_state(state: AppState, path: Path = DEFAULT_STATE_PATH) -> None: ...
    # Writes {"version": STATE_VERSION, "seen": ..., "line": {...}, "round_seen": ...,
    # "recent_cards": [...]}, creating the parent directory if needed.
```

Deviation from the web version, deliberate: the web app persists `seen`/`line`/`round_seen` as three separately versioned localStorage keys (`.v1`→`.v2` bumps happened independently per key as their shapes changed). A single local JSON file has no equivalent to localStorage's per-key namespace, and splitting one file into three would just add complexity with no benefit — so the desktop port consolidates all persisted state into one file under one `version` field. A future shape change bumps `STATE_VERSION` once and the whole file is treated as stale, exactly as reshuffled/renamed localStorage keys are today.

The **undo stack is not persisted** — same as the web version, where `undoStack` is an in-memory module variable, lost on a page reload. On the desktop app it stays an in-memory list inside `app_state.py`'s state holder, lost on app restart; only the current authoritative state round-trips through `state.json`.

## GUI Design

### Window

- `QMainWindow`, title "Flip 7".
- `self.setWindowFlag(Qt.WindowType.WindowStaysOnTopHint, True)` set once at construction — always on, no menu/checkbox toggle, matching the literal request ("de manière à ce qu'elle ne soit jamais masquée").
- Fixed/compact sizing appropriate to the content (no need to be resizable to arbitrary large sizes — the web version's whole point was a compact, glanceable layout).

### Layout (top to bottom, mirroring `index.html`'s structure)

1. **Title bar row:** "Flip 7" label + a large, bold deck-count label on the right (mirrors `#title-bar`/`#deck-count`: big enough to check against the physical deck at a glance).
2. **Status row:** a Bust-%/recommendation label pair (mirrors `#bust-line`/`#recommendation`), a recent-cards label (mirrors `#recent-cards`), and the four control buttons — Annuler / Round / Reshuffle / Partie — on the same row (mirrors `#controls`).
3. **Three-column row:** `QGroupBox` "Autres joueurs", `QGroupBox` "Ma ligne", `QGroupBox` "Échange", laid out side by side in a `QHBoxLayout` — never stacked, matching the web version's explicit "3 narrow columns, not full-width sections" requirement.
   - **Autres joueurs / Ma ligne**, each internally split into two sub-columns via a nested `QHBoxLayout`: "chiffres normaux" (plain 1-12, in ascending order) and "cartes spéciales" (0, Unlucky-7, Lucky-13, the 6 Modifiers, the 5 Actions) — same split and same ordering as `isSpecialNumberCard`/`appendSpecialCardButtons` in `app.mjs`. Each sub-column is a `QVBoxLayout` of small fixed-size `QPushButton`s, one per row (not a grid) — reproducing the "vertical one-per-row list" the web CSS enforces via `.chip-row`.
   - **Ma ligne** additionally has, above its "Ajouter" sub-columns, a wrapping row of the player's currently-held-card chips (mirrors `#my-cards`).
   - **Échange** is a single wrapping row of pool buttons: number-pool buttons (click = select, pending a swap target) and Modifier/Action claim badges (click = claim outright), mirroring `#pool-grid-items`.
- A `FlowLayout` utility (`gui/flow_layout.py`) backs every "wrapping row of variable-count chips" (held-cards row, pool row) — Qt has no built-in flex-wrap layout, so this is a small custom `QLayout` subclass (a well-documented Qt pattern) that lays children left-to-right, wrapping to a new line when the row runs out of horizontal space, matching the web CSS's `flex-wrap: wrap` behavior for `#my-cards`/`#pool-grid-items`.

### Interaction model (identical to the web app)

- Clicking an "Autres joueurs" number/special button → logs the card to the shoe + round tallies only (no Line effect). Disabled once exhausted.
- Clicking a "Ma ligne" "Ajouter" button → logs the card to the shoe + round tallies AND adds it to the player's line.
- Clicking a Modifier/Action button (present identically in both "Autres joueurs" and "Ma ligne" — shared tally, no Line effect either way) → logs it to the shared shoe tally. Disabled once its max copies are seen; both copies of the button stay in sync.
- Clicking a held-card chip in "Ma ligne":
  - If a pool selection is pending → completes the swap (the held card is removed, the pending pool card takes its place; if the pool card can't safely enter the resulting line, show a warning dialog instead and cancel the pending selection).
  - If nothing is pending → removes the card outright (Steal representation).
  - Both paths push an undo snapshot.
- Clicking a number-pool button in "Échange" → sets it as the pending selection (visually highlighted) awaiting a "Ma ligne" click to complete the swap. Clicking anywhere outside the pool/line zones while a selection is pending cancels it with no side effect. Implementation: an `eventFilter` installed on the central widget, watching `QEvent.MouseButtonPress` — mirrors the web app's capture-phase document click listener (`app.mjs`'s `document.addEventListener('click', ..., true)`), which runs before any specific widget's own handler and checks whether the click landed inside the pool or line zone.
- Clicking a Modifier/Action claim badge in "Échange" → claims it outright (decrements the round pool count only, no Line effect), same single-tap Steal-style pattern.
- **Annuler** → pops the undo stack (unlimited depth) and restores `seen`/`line`/`round_seen`/`recent_cards` together, re-rendering.
- **Round** → resets `line` and `round_seen` to empty (keeps the shoe-lifetime `seen` tally), pushes an undo snapshot first.
- **Reshuffle** → resets `seen` to only account for the player's own currently-held cards (`seen_from_my_line`, ported unchanged including its "partial correction, opponents' hands unknown" caveat), pushes an undo snapshot first.
- **Partie** → resets everything (`seen`, `line`, `round_seen`) to empty, pushes an undo snapshot first.
- **Recent cards** label always shows the last 5 logged reveal labels, most recent first, updating on every log and correctly reversing on Annuler — same `RECENT_CARDS_LIMIT = 5` / push-and-slice behavior as the web app.

### Manual correction

The web app's `#manual-edit` section (numeric inputs to directly correct a per-card-type seen count, for recovering from a mis-tap) is ported as a simple secondary panel — a checkable `QGroupBox` "Correction manuelle" (collapsed/unchecked by default, matching the web version's treatment of this as a rarely-used escape hatch rather than primary UI), containing one `QSpinBox` per card type and Modifier/Action type, wired the same way (`change` → validate range → snapshot → update `seen` → re-render).

## Testing Strategy

- `tests/test_deck.py`, `test_shoe.py`, `test_line.py`, `test_round_tracker.py`, `test_engine.py`: pytest ports of the existing `.mjs` test files' cases — same inputs, same expected outputs, translated to `assert` statements. This includes the Lucky-13/regular-13 dual-flag edge cases, the Unlucky-7 line-reset case, the Zero score-suppression and completing-draw EV case, the partition invariant check, and the round-tracker clamp-not-throw behavior.
- `tests/test_storage.py`: round-trip save/load, missing-file default, corrupt/wrong-version-file default (using `tmp_path` fixtures, never touching the real `~/.flip7-desktop/`).
- `tests/test_app_state.py`: the ported state-transition logic from `app_state.py` (snapshot/undo, `log_my_card`, `complete_swap`, `claim_pool_modifier`, `seen_from_my_line`), tested directly without any Qt dependency — mirrors how `app.mjs`'s equivalent functions are exercised indirectly today via the scratch DOM-stub harness, but here they're first-class testable units since they're split out of the GUI file.
- GUI wiring (`gui/main_window.py`, `gui/chips.py`, `gui/flow_layout.py`) is verified manually (launch the app, click through the same scenarios the web app's DOM-stub harness covered) rather than with automated Qt tests — matching the web app's own precedent of manual/scripted-click verification for the presentation layer, with automated tests reserved for the logic layer underneath it.

## Open Items For User Review

None outstanding — GUI toolkit (PySide6) and persistence approach (single JSON file) were already decided via direct questions before this document was written. Flagging here per the spec self-review process in case anything above should change before the implementation plan is written.
