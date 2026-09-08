# Flip 7 Desktop (Python) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a native PySide6 desktop app, in a new `desktop/` directory, that reproduces the web app's Flip 7 hit/stay advisor exactly (same rules engine, same 3-column fast-entry UI, same swap/steal/claim/undo behavior), pinned always-on-top.

**Architecture:** Faithful line-for-line port of the six JS domain modules (`deck`/`shoe`/`line`/`round_tracker`/`engine`/`storage`) into Python, plus a new `app_state.py` that isolates the state-transition logic from `app.mjs` (GUI-independent, unit-tested), topped by a thin PySide6 GUI layer (`gui/main_window.py`) that wires widgets to `app_state.AppStateManager` and re-renders after every action.

**Tech Stack:** Python >=3.10, PySide6, pytest, `src/` package layout.

**Spec:** `docs/superpowers/specs/2026-09-08-flip7-desktop-python-design.md`

## Global Constraints

- Python floor: `>=3.10` (matches the `orapa` reference project).
- GUI toolkit: PySide6 — the only GUI dependency.
- Persistence: a single JSON file at `~/.flip7-desktop/state.json` with a `"version"` field (`STATE_VERSION = 1`); a missing, corrupt, or version-mismatched file loads as fresh defaults — no migration function.
- Window: `Qt.WindowType.WindowStaysOnTopHint` set unconditionally at construction — no menu/checkbox toggle.
- Layout: `desktop/src/flip7_desktop/` (package code), `desktop/tests/` (pytest suite).
- Naming: snake_case throughout. Action-type ids are snake_case (`just_one_more`, `flip_four`) even though the web version used camelCase ids — the French labels users see (`"Encore une"`, `"Flip Four"`, etc.) are unchanged.
- Immutability discipline: every state-transition function returns a new object; nothing already-existing is mutated in place. `Line`, `Buckets`, `Recommendation`, and `AppState` are frozen dataclasses.
- The undo stack is in-memory only — never written to `state.json`.
- GUI-dependent tests set `QT_QPA_PLATFORM=offscreen` via a shared `qapp` fixture in `desktop/tests/conftest.py` (introduced in Task 8), so they run headless.

---

### Task 1: Project scaffolding + `deck.py`

**Files:**
- Create: `desktop/pyproject.toml`
- Create: `desktop/.gitignore`
- Create: `desktop/src/flip7_desktop/__init__.py`
- Create: `desktop/src/flip7_desktop/gui/__init__.py`
- Create: `desktop/src/flip7_desktop/deck.py`
- Test: `desktop/tests/test_deck.py`

**Interfaces:**
- Produces: `CARD_VALUES: list[int]`, `SHOE_BASE: dict[int, dict[str,int]]`, `MODIFIER_TYPES: dict[str, dict]`, `ACTION_TYPES: dict[str, dict]`, `MODIFIERS_TOTAL: int`, `ACTIONS_TOTAL: int`, `TOTAL_CARDS: int` — all in `flip7_desktop.deck`, consumed by every later task.

- [ ] **Step 1: Create the directory structure**

```bash
mkdir -p desktop/src/flip7_desktop/gui
mkdir -p desktop/tests
```

- [ ] **Step 2: Write `desktop/pyproject.toml`**

```toml
[project]
name = "flip7-desktop"
version = "0.1.0"
requires-python = ">=3.10"
dependencies = ["PySide6>=6.5"]

[project.optional-dependencies]
dev = ["pytest>=7.0"]

[project.scripts]
flip7-desktop = "flip7_desktop.main:main"

[build-system]
requires = ["setuptools>=61.0"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
where = ["src"]

[tool.pytest.ini_options]
pythonpath = ["src"]
```

- [ ] **Step 3: Write `desktop/.gitignore`**

```
.venv/
__pycache__/
*.egg-info/
.pytest_cache/
```

- [ ] **Step 4: Create empty package init files**

```bash
touch desktop/src/flip7_desktop/__init__.py
touch desktop/src/flip7_desktop/gui/__init__.py
```

- [ ] **Step 5: Create a venv and install the project in editable mode**

```bash
cd desktop
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
```

- [ ] **Step 6: Write the failing test — `desktop/tests/test_deck.py`**

```python
from flip7_desktop.deck import (
    CARD_VALUES,
    SHOE_BASE,
    MODIFIER_TYPES,
    ACTION_TYPES,
    MODIFIERS_TOTAL,
    ACTIONS_TOTAL,
    TOTAL_CARDS,
)


def test_card_values_is_zero_through_thirteen():
    assert CARD_VALUES == list(range(14))


def test_shoe_base_zero_is_a_single_special_card():
    assert SHOE_BASE[0] == {"regular": 0, "special": 1}


def test_shoe_base_seven_has_unlucky_special():
    assert SHOE_BASE[7] == {"regular": 6, "special": 1}


def test_shoe_base_thirteen_has_lucky_special():
    assert SHOE_BASE[13] == {"regular": 12, "special": 1}


def test_modifier_types_are_six_single_copies():
    assert len(MODIFIER_TYPES) == 6
    assert all(t["max"] == 1 for t in MODIFIER_TYPES.values())


def test_action_types_are_five_double_copies():
    assert len(ACTION_TYPES) == 5
    assert all(t["max"] == 2 for t in ACTION_TYPES.values())


def test_modifiers_and_actions_totals():
    assert MODIFIERS_TOTAL == 6
    assert ACTIONS_TOTAL == 10


def test_total_cards_is_108():
    assert TOTAL_CARDS == 108
```

- [ ] **Step 7: Run the test, verify it fails**

```bash
cd desktop && .venv/bin/pytest tests/test_deck.py -v
```
Expected: FAIL with `ModuleNotFoundError: No module named 'flip7_desktop.deck'`.

- [ ] **Step 8: Write `desktop/src/flip7_desktop/deck.py`**

```python
CARD_VALUES = list(range(14))

SHOE_BASE = {
    0: {"regular": 0, "special": 1},   # The Zero
    1: {"regular": 1, "special": 0},
    2: {"regular": 2, "special": 0},
    3: {"regular": 3, "special": 0},
    4: {"regular": 4, "special": 0},
    5: {"regular": 5, "special": 0},
    6: {"regular": 6, "special": 0},
    7: {"regular": 6, "special": 1},   # Unlucky 7
    8: {"regular": 8, "special": 0},
    9: {"regular": 9, "special": 0},
    10: {"regular": 10, "special": 0},
    11: {"regular": 11, "special": 0},
    12: {"regular": 12, "special": 0},
    13: {"regular": 12, "special": 1},  # Lucky 13
}

MODIFIER_TYPES = {
    "minus2": {"label": "-2", "max": 1},
    "minus4": {"label": "-4", "max": 1},
    "minus6": {"label": "-6", "max": 1},
    "minus8": {"label": "-8", "max": 1},
    "minus10": {"label": "-10", "max": 1},
    "div2": {"label": "÷2", "max": 1},
}

ACTION_TYPES = {
    "just_one_more": {"label": "Encore une", "max": 2},
    "swap": {"label": "Échange", "max": 2},
    "steal": {"label": "Vol", "max": 2},
    "discard": {"label": "Défausse", "max": 2},
    "flip_four": {"label": "Flip Four", "max": 2},
}

MODIFIERS_TOTAL = sum(t["max"] for t in MODIFIER_TYPES.values())
ACTIONS_TOTAL = sum(t["max"] for t in ACTION_TYPES.values())

TOTAL_CARDS = (
    sum(SHOE_BASE[v]["regular"] + SHOE_BASE[v]["special"] for v in CARD_VALUES)
    + MODIFIERS_TOTAL
    + ACTIONS_TOTAL
)
```

- [ ] **Step 9: Run the test, verify it passes**

```bash
cd desktop && .venv/bin/pytest tests/test_deck.py -v
```
Expected: 8 passed.

- [ ] **Step 10: Commit**

```bash
git add desktop/pyproject.toml desktop/.gitignore desktop/src desktop/tests/test_deck.py
git commit -m "Scaffold desktop/ Python project and port deck.py"
```

---

### Task 2: `shoe.py`

**Files:**
- Create: `desktop/src/flip7_desktop/shoe.py`
- Test: `desktop/tests/test_shoe.py`

**Interfaces:**
- Consumes: `CARD_VALUES`, `SHOE_BASE`, `MODIFIER_TYPES`, `ACTION_TYPES`, `TOTAL_CARDS` from `flip7_desktop.deck` (Task 1).
- Produces: `create_empty_seen() -> dict`, `log_card_seen(seen, value, kind) -> dict`, `log_special_card_seen(seen, category, type_id) -> dict`, `remaining_count(seen, value, kind) -> int`, `total_undrawn(seen) -> int` — consumed by Tasks 3-9. `seen` shape: `{"other": int, "modifier_types": {id: int}, "action_types": {id: int}, 0: {"regular": int, "special": int}, ..., 13: {...}}`.

- [ ] **Step 1: Write the failing test — `desktop/tests/test_shoe.py`**

```python
import pytest

from flip7_desktop.deck import TOTAL_CARDS
from flip7_desktop.shoe import (
    create_empty_seen,
    log_card_seen,
    log_special_card_seen,
    remaining_count,
    total_undrawn,
)


def test_empty_seen_has_zero_everywhere():
    seen = create_empty_seen()
    assert seen["other"] == 0
    assert seen[5] == {"regular": 0, "special": 0}
    assert seen["modifier_types"]["minus2"] == 0
    assert seen["action_types"]["steal"] == 0


def test_log_card_seen_increments_and_returns_new_object():
    seen = create_empty_seen()
    next_seen = log_card_seen(seen, 5, "regular")
    assert next_seen[5]["regular"] == 1
    assert seen[5]["regular"] == 0  # original untouched


def test_log_card_seen_raises_past_max():
    seen = create_empty_seen()
    seen = log_card_seen(seen, 1, "regular")  # only 1 copy of value-1 exists
    with pytest.raises(ValueError):
        log_card_seen(seen, 1, "regular")


def test_log_special_card_seen_increments_type_and_recomputes_other():
    seen = create_empty_seen()
    seen = log_special_card_seen(seen, "modifier", "minus2")
    assert seen["modifier_types"]["minus2"] == 1
    assert seen["other"] == 1
    seen = log_special_card_seen(seen, "action", "steal")
    assert seen["action_types"]["steal"] == 1
    assert seen["other"] == 2


def test_log_special_card_seen_raises_past_max():
    seen = create_empty_seen()
    seen = log_special_card_seen(seen, "modifier", "minus2")  # max 1
    with pytest.raises(ValueError):
        log_special_card_seen(seen, "modifier", "minus2")


def test_remaining_count_decreases_after_logging():
    seen = create_empty_seen()
    assert remaining_count(seen, 5, "regular") == 5
    seen = log_card_seen(seen, 5, "regular")
    assert remaining_count(seen, 5, "regular") == 4


def test_total_undrawn_starts_at_total_cards_and_decreases():
    seen = create_empty_seen()
    assert total_undrawn(seen) == TOTAL_CARDS
    seen = log_card_seen(seen, 5, "regular")
    assert total_undrawn(seen) == TOTAL_CARDS - 1
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
cd desktop && .venv/bin/pytest tests/test_shoe.py -v
```
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Write `desktop/src/flip7_desktop/shoe.py`**

```python
from .deck import CARD_VALUES, SHOE_BASE, MODIFIER_TYPES, ACTION_TYPES, TOTAL_CARDS


def create_empty_seen() -> dict:
    seen = {"other": 0, "modifier_types": {}, "action_types": {}}
    for v in CARD_VALUES:
        seen[v] = {"regular": 0, "special": 0}
    for type_id in MODIFIER_TYPES:
        seen["modifier_types"][type_id] = 0
    for type_id in ACTION_TYPES:
        seen["action_types"][type_id] = 0
    return seen


def log_card_seen(seen: dict, value: int, kind: str) -> dict:
    next_seen = {
        "other": seen["other"],
        "modifier_types": dict(seen["modifier_types"]),
        "action_types": dict(seen["action_types"]),
    }
    for v in CARD_VALUES:
        next_seen[v] = dict(seen[v])

    max_count = SHOE_BASE[value][kind]
    if seen[value][kind] + 1 > max_count:
        raise ValueError(f"Cannot log another {value}/{kind}: all {max_count} already seen")
    next_seen[value][kind] = seen[value][kind] + 1
    return next_seen


def remaining_count(seen: dict, value: int, kind: str) -> int:
    return SHOE_BASE[value][kind] - seen[value][kind]


def total_undrawn(seen: dict) -> int:
    seen_total = seen["other"]
    for v in CARD_VALUES:
        seen_total += seen[v]["regular"] + seen[v]["special"]
    return TOTAL_CARDS - seen_total


def _sum_type_counts(type_counts: dict) -> int:
    return sum(type_counts.values())


def log_special_card_seen(seen: dict, category: str, type_id: str) -> dict:
    types = MODIFIER_TYPES if category == "modifier" else ACTION_TYPES
    max_count = types[type_id]["max"]
    key = "modifier_types" if category == "modifier" else "action_types"
    current_count = seen[key][type_id]
    if current_count + 1 > max_count:
        raise ValueError(f"Cannot log another {type_id}: all {max_count} already seen")

    next_seen = {
        "other": seen["other"],
        "modifier_types": dict(seen["modifier_types"]),
        "action_types": dict(seen["action_types"]),
    }
    for v in CARD_VALUES:
        next_seen[v] = dict(seen[v])

    next_seen[key][type_id] = current_count + 1
    next_seen["other"] = _sum_type_counts(next_seen["modifier_types"]) + _sum_type_counts(next_seen["action_types"])
    return next_seen
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
cd desktop && .venv/bin/pytest tests/test_shoe.py -v
```
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/flip7_desktop/shoe.py desktop/tests/test_shoe.py
git commit -m "Port shoe.py (shoe-lifetime card tally)"
```

---

### Task 3: `line.py`

**Files:**
- Create: `desktop/src/flip7_desktop/line.py`
- Test: `desktop/tests/test_line.py`

**Interfaces:**
- Produces: `Line` (frozen dataclass: `values: frozenset[int]`, `has_regular_13: bool`, `has_lucky_13: bool`, `seven_kind: str | None`, `card_count: int`), `create_empty_line() -> Line`, `add_card_to_line(line, value) -> Line`, `add_lucky13_card(line) -> Line`, `add_unlucky7_card(line) -> Line`, `remove_card_from_line(line, value) -> Line`, `compute_raw_score(line) -> int` — consumed by Tasks 4, 5, 7, 9.

- [ ] **Step 1: Write the failing test — `desktop/tests/test_line.py`**

```python
from flip7_desktop.line import (
    create_empty_line,
    add_card_to_line,
    add_lucky13_card,
    add_unlucky7_card,
    remove_card_from_line,
    compute_raw_score,
)


def test_empty_line_defaults():
    line = create_empty_line()
    assert line.values == frozenset()
    assert not line.has_regular_13
    assert not line.has_lucky_13
    assert line.seven_kind is None
    assert line.card_count == 0


def test_add_card_to_line_tracks_regular_seven():
    line = add_card_to_line(create_empty_line(), 7)
    assert 7 in line.values
    assert line.seven_kind == "regular"
    assert line.card_count == 1


def test_add_card_to_line_sets_has_regular_13():
    line = add_card_to_line(create_empty_line(), 13)
    assert line.has_regular_13
    assert not line.has_lucky_13


def test_add_lucky13_does_not_touch_regular_13_flag():
    line = add_lucky13_card(create_empty_line())
    assert line.has_lucky_13
    assert not line.has_regular_13
    assert 13 in line.values


def test_add_unlucky7_resets_the_whole_line():
    line = add_card_to_line(create_empty_line(), 5)
    line = add_unlucky7_card(line)
    assert line.values == frozenset({7})
    assert line.seven_kind == "special"
    assert line.card_count == 1


def test_remove_doubled_thirteen_clears_lucky_flag_first():
    line = create_empty_line()
    line = add_card_to_line(line, 13)   # regular
    line = add_lucky13_card(line)        # + lucky
    line = remove_card_from_line(line, 13)
    assert 13 in line.values             # regular 13 still there
    assert line.has_regular_13
    assert not line.has_lucky_13
    line = remove_card_from_line(line, 13)
    assert 13 not in line.values
    assert not line.has_regular_13


def test_remove_seven_clears_seven_kind():
    line = add_card_to_line(create_empty_line(), 7)
    line = remove_card_from_line(line, 7)
    assert 7 not in line.values
    assert line.seven_kind is None


def test_compute_raw_score_suppressed_while_zero_held_and_incomplete():
    line = add_card_to_line(create_empty_line(), 0)
    line = add_card_to_line(line, 5)
    assert compute_raw_score(line) == 0


def test_compute_raw_score_unsuppressed_once_flip7_complete():
    line = create_empty_line()
    for v in (0, 1, 2, 3, 4, 5, 6):
        line = add_card_to_line(line, v)
    assert line.card_count == 7
    assert compute_raw_score(line) == sum((0, 1, 2, 3, 4, 5, 6))


def test_compute_raw_score_counts_doubled_thirteen_twice():
    line = create_empty_line()
    line = add_card_to_line(line, 13)
    line = add_lucky13_card(line)
    assert compute_raw_score(line) == 26
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
cd desktop && .venv/bin/pytest tests/test_line.py -v
```
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Write `desktop/src/flip7_desktop/line.py`**

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class Line:
    values: frozenset
    has_regular_13: bool
    has_lucky_13: bool
    seven_kind: str | None
    card_count: int


def create_empty_line() -> Line:
    return Line(values=frozenset(), has_regular_13=False, has_lucky_13=False, seven_kind=None, card_count=0)


def add_card_to_line(line: Line, value: int) -> Line:
    return Line(
        values=line.values | {value},
        has_regular_13=line.has_regular_13 or value == 13,
        has_lucky_13=line.has_lucky_13,
        seven_kind="regular" if value == 7 else line.seven_kind,
        card_count=line.card_count + 1,
    )


def add_lucky13_card(line: Line) -> Line:
    return Line(
        values=line.values | {13},
        has_regular_13=line.has_regular_13,
        has_lucky_13=True,
        seven_kind=line.seven_kind,
        card_count=line.card_count + 1,
    )


def add_unlucky7_card(line: Line) -> Line:
    return Line(values=frozenset({7}), has_regular_13=False, has_lucky_13=False, seven_kind="special", card_count=1)


def remove_card_from_line(line: Line, value: int) -> Line:
    if value not in line.values:
        return line

    if value == 13:
        if line.has_lucky_13:
            values = line.values if line.has_regular_13 else (line.values - {13})
            return Line(
                values=values,
                has_regular_13=line.has_regular_13,
                has_lucky_13=False,
                seven_kind=line.seven_kind,
                card_count=line.card_count - 1,
            )
        return Line(
            values=line.values - {13},
            has_regular_13=False,
            has_lucky_13=line.has_lucky_13,
            seven_kind=line.seven_kind,
            card_count=line.card_count - 1,
        )

    return Line(
        values=line.values - {value},
        has_regular_13=line.has_regular_13,
        has_lucky_13=line.has_lucky_13,
        seven_kind=None if value == 7 else line.seven_kind,
        card_count=line.card_count - 1,
    )


def compute_raw_score(line: Line) -> int:
    has_zero = 0 in line.values
    completed_flip7 = line.card_count >= 7
    if has_zero and not completed_flip7:
        return 0
    total = sum(line.values)
    if line.has_regular_13 and line.has_lucky_13:
        total += 13
    return total
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
cd desktop && .venv/bin/pytest tests/test_line.py -v
```
Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/flip7_desktop/line.py desktop/tests/test_line.py
git commit -m "Port line.py (player line model)"
```

---

### Task 4: `round_tracker.py`

**Files:**
- Create: `desktop/src/flip7_desktop/round_tracker.py`
- Test: `desktop/tests/test_round_tracker.py`

**Interfaces:**
- Consumes: `CARD_VALUES`, `SHOE_BASE`, `MODIFIER_TYPES`, `ACTION_TYPES` from `flip7_desktop.deck`; `Line` from `flip7_desktop.line`.
- Produces: `create_empty_round_seen() -> dict`, `log_round_card(round_seen, value, kind) -> dict`, `log_round_special_card(round_seen, category, type_id) -> dict`, `mine_count(line, value, kind) -> int`, `pool_available(round_seen, line, value, kind) -> int` — consumed by Tasks 7, 9. `round_seen` shape mirrors `seen` but has no `"other"` key.

- [ ] **Step 1: Write the failing test — `desktop/tests/test_round_tracker.py`**

```python
from flip7_desktop.line import create_empty_line, add_card_to_line, add_lucky13_card, add_unlucky7_card
from flip7_desktop.round_tracker import (
    create_empty_round_seen,
    log_round_card,
    log_round_special_card,
    mine_count,
    pool_available,
)


def test_empty_round_seen_has_zero_everywhere():
    rs = create_empty_round_seen()
    assert rs[5] == {"regular": 0, "special": 0}
    assert rs["modifier_types"]["minus2"] == 0


def test_log_round_card_increments():
    rs = log_round_card(create_empty_round_seen(), 5, "regular")
    assert rs[5]["regular"] == 1


def test_log_round_card_clamps_instead_of_raising():
    rs = create_empty_round_seen()
    rs = log_round_card(rs, 1, "regular")  # max 1
    rs = log_round_card(rs, 1, "regular")  # would overflow — must clamp, not raise
    assert rs[1]["regular"] == 1


def test_log_round_special_card_clamps_at_type_max():
    rs = create_empty_round_seen()
    rs = log_round_special_card(rs, "modifier", "minus2")  # max 1
    rs = log_round_special_card(rs, "modifier", "minus2")
    assert rs["modifier_types"]["minus2"] == 1


def test_mine_count_for_seven_checks_seven_kind():
    line = add_unlucky7_card(create_empty_line())
    assert mine_count(line, 7, "special") == 1
    assert mine_count(line, 7, "regular") == 0


def test_mine_count_for_thirteen_checks_the_right_flag():
    line = add_lucky13_card(create_empty_line())
    assert mine_count(line, 13, "special") == 1
    assert mine_count(line, 13, "regular") == 0


def test_mine_count_for_plain_value():
    line = add_card_to_line(create_empty_line(), 5)
    assert mine_count(line, 5, "regular") == 1
    assert mine_count(line, 6, "regular") == 0


def test_pool_available_excludes_my_own_held_copy():
    line = add_card_to_line(create_empty_line(), 9)
    rs = log_round_card(create_empty_round_seen(), 9, "regular")  # someone revealed a 9 this round
    # I hold the only 9 revealed so far -> nothing left in the pool
    assert pool_available(rs, line, 9, "regular") == 0
    rs = log_round_card(rs, 9, "regular")  # a second 9 revealed, held by someone else
    assert pool_available(rs, line, 9, "regular") == 1
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
cd desktop && .venv/bin/pytest tests/test_round_tracker.py -v
```
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Write `desktop/src/flip7_desktop/round_tracker.py`**

```python
from .deck import CARD_VALUES, SHOE_BASE, MODIFIER_TYPES, ACTION_TYPES
from .line import Line


def create_empty_round_seen() -> dict:
    round_seen = {"modifier_types": {}, "action_types": {}}
    for v in CARD_VALUES:
        round_seen[v] = {"regular": 0, "special": 0}
    for type_id in MODIFIER_TYPES:
        round_seen["modifier_types"][type_id] = 0
    for type_id in ACTION_TYPES:
        round_seen["action_types"][type_id] = 0
    return round_seen


def log_round_card(round_seen: dict, value: int, kind: str) -> dict:
    next_round_seen = {
        "modifier_types": dict(round_seen["modifier_types"]),
        "action_types": dict(round_seen["action_types"]),
    }
    for v in CARD_VALUES:
        next_round_seen[v] = dict(round_seen[v])
    max_count = SHOE_BASE[value][kind]
    next_round_seen[value][kind] = min(round_seen[value][kind] + 1, max_count)
    return next_round_seen


def log_round_special_card(round_seen: dict, category: str, type_id: str) -> dict:
    types = MODIFIER_TYPES if category == "modifier" else ACTION_TYPES
    max_count = types[type_id]["max"]
    key = "modifier_types" if category == "modifier" else "action_types"
    next_round_seen = {
        "modifier_types": dict(round_seen["modifier_types"]),
        "action_types": dict(round_seen["action_types"]),
    }
    for v in CARD_VALUES:
        next_round_seen[v] = dict(round_seen[v])
    next_round_seen[key][type_id] = min(round_seen[key][type_id] + 1, max_count)
    return next_round_seen


def mine_count(line: Line, value: int, kind: str) -> int:
    if value == 7:
        return 1 if (7 in line.values and line.seven_kind == kind) else 0
    if value == 13:
        return 1 if (line.has_lucky_13 if kind == "special" else line.has_regular_13) else 0
    return 1 if value in line.values else 0


def pool_available(round_seen: dict, line: Line, value: int, kind: str) -> int:
    return round_seen[value][kind] - mine_count(line, value, kind)
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
cd desktop && .venv/bin/pytest tests/test_round_tracker.py -v
```
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/flip7_desktop/round_tracker.py desktop/tests/test_round_tracker.py
git commit -m "Port round_tracker.py (round-scoped swap/steal pool tally)"
```

---

### Task 5: `engine.py`

**Files:**
- Create: `desktop/src/flip7_desktop/engine.py`
- Test: `desktop/tests/test_engine.py`

**Interfaces:**
- Consumes: `CARD_VALUES`, `MODIFIERS_TOTAL`, `ACTIONS_TOTAL` from `flip7_desktop.deck`; `remaining_count`, `total_undrawn` from `flip7_desktop.shoe`; `Line`, `compute_raw_score` from `flip7_desktop.line`.
- Produces: `Buckets` (frozen dataclass: `r, u, s, m, d: int`), `compute_buckets(seen, line) -> Buckets`, `assert_partition(buckets) -> None`, `compute_probabilities(buckets) -> dict`, `is_safe_card(line, value, kind) -> bool`, `compute_expected_value(seen, line) -> float`, `Recommendation` (frozen dataclass: `buckets, probabilities, ev, raw_score, action`), `recommend(seen, line) -> Recommendation` — consumed by Tasks 7, 9.

- [ ] **Step 1: Write the failing test — `desktop/tests/test_engine.py`**

```python
import pytest

from flip7_desktop.shoe import create_empty_seen, log_card_seen
from flip7_desktop.line import create_empty_line, add_card_to_line, add_lucky13_card
from flip7_desktop.engine import (
    compute_buckets,
    assert_partition,
    compute_probabilities,
    is_safe_card,
    compute_expected_value,
    recommend,
)


def test_partition_holds_for_a_fresh_game():
    buckets = compute_buckets(create_empty_seen(), create_empty_line())
    assert_partition(buckets)  # must not raise


def test_holding_a_value_moves_its_remaining_copies_to_bust():
    line = add_card_to_line(create_empty_line(), 5)
    buckets = compute_buckets(create_empty_seen(), line)
    assert_partition(buckets)
    assert buckets.r >= 5  # all 5 undrawn copies of value 5 now bust


def test_unlucky_seven_is_safe_on_an_empty_line():
    buckets = compute_buckets(create_empty_seen(), create_empty_line())
    assert buckets.u == 0  # empty line: the Unlucky 7 copy counts as safe, not reset


def test_unlucky_seven_resets_a_nonempty_line():
    line = add_card_to_line(create_empty_line(), 5)
    buckets = compute_buckets(create_empty_seen(), line)
    assert buckets.u == 1  # the one undrawn Unlucky-7 copy


def test_lucky_thirteen_is_always_safe_even_holding_regular_13():
    line = add_card_to_line(create_empty_line(), 13)
    assert is_safe_card(line, 13, "special")
    assert not is_safe_card(line, 13, "regular")


def test_expected_value_equals_raw_score_when_no_cards_remain():
    seen = create_empty_seen()
    for v in range(14):
        for kind in ("regular", "special"):
            from flip7_desktop.deck import SHOE_BASE

            for _ in range(SHOE_BASE[v][kind]):
                seen = log_card_seen(seen, v, kind)
    line = add_card_to_line(create_empty_line(), 5)
    assert compute_expected_value(seen, line) == 5


def test_recommend_hits_on_an_empty_line():
    result = recommend(create_empty_seen(), create_empty_line())
    assert result.action == "HIT"  # nothing to lose, EV is always positive


def test_recommend_stays_when_almost_every_card_busts():
    # Hold every plain value 1-12 and a regular 13: only the two special
    # number cards (Zero, Lucky 13) and Modifier/Action cards stay safe.
    line = create_empty_line()
    for v in range(1, 13):
        line = add_card_to_line(line, v)
    line = add_card_to_line(line, 13)
    result = recommend(create_empty_seen(), line)
    assert result.action == "STAY"
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
cd desktop && .venv/bin/pytest tests/test_engine.py -v
```
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Write `desktop/src/flip7_desktop/engine.py`**

```python
from dataclasses import dataclass

from .deck import CARD_VALUES, MODIFIERS_TOTAL, ACTIONS_TOTAL
from .shoe import remaining_count, total_undrawn
from .line import Line, compute_raw_score


@dataclass(frozen=True)
class Buckets:
    r: int
    u: int
    s: int
    m: int
    d: int


def compute_buckets(seen: dict, line: Line) -> Buckets:
    d = total_undrawn(seen)
    r = 0
    u = 0
    s = 0

    for v in CARD_VALUES:
        rem_reg = remaining_count(seen, v, "regular")
        rem_spec = remaining_count(seen, v, "special")

        if v == 7:
            if 7 in line.values:
                r += rem_reg
            else:
                s += rem_reg
            if len(line.values) == 0:
                s += rem_spec
            else:
                u += rem_spec
            continue

        if v == 13:
            if line.has_regular_13:
                r += rem_reg
            else:
                s += rem_reg
            s += rem_spec
            continue

        if v in line.values:
            r += rem_reg + rem_spec
        else:
            s += rem_reg + rem_spec

    m = MODIFIERS_TOTAL + ACTIONS_TOTAL - seen["other"]

    return Buckets(r=r, u=u, s=s, m=m, d=d)


def assert_partition(buckets: Buckets) -> None:
    total = buckets.r + buckets.u + buckets.s + buckets.m
    if total != buckets.d:
        raise AssertionError(
            f"Partition invariant violated: R({buckets.r})+U({buckets.u})+"
            f"S({buckets.s})+M({buckets.m}) = {total} != D({buckets.d})"
        )


def compute_probabilities(buckets: Buckets) -> dict:
    if buckets.d == 0:
        return {"bust": 0.0, "reset": 0.0, "progress": 0.0, "neutral": 0.0}
    return {
        "bust": buckets.r / buckets.d,
        "reset": buckets.u / buckets.d,
        "progress": buckets.s / buckets.d,
        "neutral": buckets.m / buckets.d,
    }


def is_safe_card(line: Line, value: int, kind: str) -> bool:
    if value == 13 and kind == "special":
        return True
    if value == 13 and kind == "regular":
        return not line.has_regular_13
    if value == 7 and kind == "regular":
        return 7 not in line.values
    return value not in line.values


def compute_expected_value(seen: dict, line: Line) -> float:
    d = total_undrawn(seen)
    raw_score = compute_raw_score(line)
    if d == 0:
        return raw_score

    holds_zero = 0 in line.values
    unsuppressed_raw_score = raw_score
    if holds_zero:
        unsuppressed_raw_score = sum(line.values)
        if line.has_regular_13 and line.has_lucky_13:
            unsuppressed_raw_score += 13

    ev = 0.0

    for v in CARD_VALUES:
        for kind in ("regular", "special"):
            rem = remaining_count(seen, v, kind)
            if rem == 0:
                continue

            completes_flip7 = line.card_count + 1 >= 7
            base = unsuppressed_raw_score if (holds_zero and completes_flip7) else raw_score

            if v == 7 and kind == "special":
                if len(line.values) == 0:
                    bonus = 15 if completes_flip7 else 0
                    ev += (rem / d) * (base + 7 + bonus)
                else:
                    ev += (rem / d) * 7
                continue

            if not is_safe_card(line, v, kind):
                continue

            bonus = 15 if completes_flip7 else 0
            ev += (rem / d) * (base + v + bonus)

    m = MODIFIERS_TOTAL + ACTIONS_TOTAL - seen["other"]
    ev += (m / d) * raw_score

    return ev


@dataclass(frozen=True)
class Recommendation:
    buckets: Buckets
    probabilities: dict
    ev: float
    raw_score: int
    action: str


def recommend(seen: dict, line: Line) -> Recommendation:
    buckets = compute_buckets(seen, line)
    assert_partition(buckets)
    probabilities = compute_probabilities(buckets)
    ev = compute_expected_value(seen, line)
    raw_score = compute_raw_score(line)
    action = "HIT" if ev > raw_score else "STAY"
    return Recommendation(buckets=buckets, probabilities=probabilities, ev=ev, raw_score=raw_score, action=action)
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
cd desktop && .venv/bin/pytest tests/test_engine.py -v
```
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/flip7_desktop/engine.py desktop/tests/test_engine.py
git commit -m "Port engine.py (bust probability + EV recommendation)"
```

---

### Task 6: `storage.py`

**Files:**
- Create: `desktop/src/flip7_desktop/storage.py`
- Test: `desktop/tests/test_storage.py`

**Interfaces:**
- Consumes: `CARD_VALUES` from `flip7_desktop.deck`; `create_empty_seen` from `flip7_desktop.shoe`; `Line`, `create_empty_line` from `flip7_desktop.line`; `create_empty_round_seen` from `flip7_desktop.round_tracker`.
- Produces: `STATE_VERSION: int`, `DEFAULT_STATE_PATH: Path`, `AppState` (frozen dataclass: `seen, line, round_seen, recent_cards`), `load_state(path=DEFAULT_STATE_PATH) -> AppState`, `save_state(state, path=DEFAULT_STATE_PATH) -> None` — consumed by Task 7 (indirectly, via Task 9) and Task 9.

- [ ] **Step 1: Write the failing test — `desktop/tests/test_storage.py`**

```python
import json

from flip7_desktop.storage import AppState, load_state, save_state, STATE_VERSION
from flip7_desktop.shoe import create_empty_seen, log_card_seen
from flip7_desktop.line import create_empty_line, add_card_to_line
from flip7_desktop.round_tracker import create_empty_round_seen


def test_round_trip_preserves_all_fields(tmp_path):
    path = tmp_path / "state.json"
    seen = log_card_seen(create_empty_seen(), 5, "regular")
    line = add_card_to_line(create_empty_line(), 5)
    state = AppState(seen=seen, line=line, round_seen=create_empty_round_seen(), recent_cards=["5"])

    save_state(state, path)
    loaded = load_state(path)

    assert loaded.seen[5]["regular"] == 1
    assert 5 in loaded.line.values
    assert loaded.line.card_count == 1
    assert loaded.recent_cards == ["5"]


def test_load_missing_file_returns_defaults(tmp_path):
    state = load_state(tmp_path / "does-not-exist.json")
    assert state.line.card_count == 0
    assert state.recent_cards == []


def test_load_wrong_version_returns_defaults(tmp_path):
    path = tmp_path / "state.json"
    path.write_text(json.dumps({"version": STATE_VERSION + 1, "junk": True}), encoding="utf-8")
    state = load_state(path)
    assert state.line.card_count == 0


def test_load_corrupt_json_returns_defaults(tmp_path):
    path = tmp_path / "state.json"
    path.write_text("{not valid json", encoding="utf-8")
    state = load_state(path)
    assert state.line.card_count == 0


def test_save_creates_parent_directory(tmp_path):
    path = tmp_path / "nested" / "state.json"
    save_state(AppState(seen=create_empty_seen(), line=create_empty_line(), round_seen=create_empty_round_seen(), recent_cards=[]), path)
    assert path.exists()
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
cd desktop && .venv/bin/pytest tests/test_storage.py -v
```
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Write `desktop/src/flip7_desktop/storage.py`**

```python
import json
from pathlib import Path
from dataclasses import dataclass

from .deck import CARD_VALUES
from .shoe import create_empty_seen
from .line import Line, create_empty_line
from .round_tracker import create_empty_round_seen

STATE_VERSION = 1
DEFAULT_STATE_PATH = Path.home() / ".flip7-desktop" / "state.json"


@dataclass(frozen=True)
class AppState:
    seen: dict
    line: Line
    round_seen: dict
    recent_cards: list


def _default_state() -> AppState:
    return AppState(
        seen=create_empty_seen(),
        line=create_empty_line(),
        round_seen=create_empty_round_seen(),
        recent_cards=[],
    )


def _line_to_dict(line: Line) -> dict:
    return {
        "values": sorted(line.values),
        "has_regular_13": line.has_regular_13,
        "has_lucky_13": line.has_lucky_13,
        "seven_kind": line.seven_kind,
        "card_count": line.card_count,
    }


def _line_from_dict(data: dict) -> Line:
    return Line(
        values=frozenset(data["values"]),
        has_regular_13=data["has_regular_13"],
        has_lucky_13=data["has_lucky_13"],
        seven_kind=data["seven_kind"],
        card_count=data["card_count"],
    )


def _seen_to_json_safe(seen: dict) -> dict:
    result = {"other": seen["other"], "modifier_types": seen["modifier_types"], "action_types": seen["action_types"]}
    for v in CARD_VALUES:
        result[str(v)] = seen[v]
    return result


def _seen_from_json_safe(data: dict) -> dict:
    result = {"other": data["other"], "modifier_types": data["modifier_types"], "action_types": data["action_types"]}
    for v in CARD_VALUES:
        result[v] = data[str(v)]
    return result


def _round_seen_to_json_safe(round_seen: dict) -> dict:
    result = {"modifier_types": round_seen["modifier_types"], "action_types": round_seen["action_types"]}
    for v in CARD_VALUES:
        result[str(v)] = round_seen[v]
    return result


def _round_seen_from_json_safe(data: dict) -> dict:
    result = {"modifier_types": data["modifier_types"], "action_types": data["action_types"]}
    for v in CARD_VALUES:
        result[v] = data[str(v)]
    return result


def load_state(path: Path = DEFAULT_STATE_PATH) -> AppState:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("version") != STATE_VERSION:
            return _default_state()
        return AppState(
            seen=_seen_from_json_safe(data["seen"]),
            line=_line_from_dict(data["line"]),
            round_seen=_round_seen_from_json_safe(data["round_seen"]),
            recent_cards=list(data["recent_cards"]),
        )
    except (FileNotFoundError, json.JSONDecodeError, KeyError, TypeError, ValueError):
        return _default_state()


def save_state(state: AppState, path: Path = DEFAULT_STATE_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": STATE_VERSION,
        "seen": _seen_to_json_safe(state.seen),
        "line": _line_to_dict(state.line),
        "round_seen": _round_seen_to_json_safe(state.round_seen),
        "recent_cards": state.recent_cards,
    }
    path.write_text(json.dumps(payload), encoding="utf-8")
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
cd desktop && .venv/bin/pytest tests/test_storage.py -v
```
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/flip7_desktop/storage.py desktop/tests/test_storage.py
git commit -m "Port storage.py (single JSON state file)"
```

---

### Task 7: `app_state.py`

**Files:**
- Create: `desktop/src/flip7_desktop/app_state.py`
- Test: `desktop/tests/test_app_state.py`

**Interfaces:**
- Consumes: `MODIFIER_TYPES`, `ACTION_TYPES` from `flip7_desktop.deck`; `create_empty_seen`, `log_card_seen`, `log_special_card_seen` from `flip7_desktop.shoe`; `create_empty_line`, `add_card_to_line`, `add_lucky13_card`, `add_unlucky7_card`, `remove_card_from_line` from `flip7_desktop.line`; `create_empty_round_seen`, `log_round_card`, `log_round_special_card`, `pool_available` (module function) from `flip7_desktop.round_tracker`; `recommend`, `is_safe_card` from `flip7_desktop.engine`.
- Produces: `RECENT_CARDS_LIMIT = 5`, `card_label(value, kind) -> str`, `add_card_by_kind(line, value, kind) -> Line`, `seen_from_my_line(current_line) -> dict`, `SwapBlocked` (exception), `AppStateManager` class with attributes `seen`, `line`, `round_seen`, `recent_cards`, `undo_stack`, `pending_pool_selection` and methods `log_my_card`, `remove_my_card`, `my_card_click`, `complete_swap`, `log_other_player_card`, `log_special_card`, `claim_pool_modifier`, `set_seen_count`, `set_special_seen_count`, `undo`, `new_round`, `reshuffle`, `new_game`, `recommendation`, `pool_available` — all consumed by Task 9.

- [ ] **Step 1: Write the failing test — `desktop/tests/test_app_state.py`**

```python
import pytest

from flip7_desktop.app_state import AppStateManager, SwapBlocked, card_label, seen_from_my_line
from flip7_desktop.line import create_empty_line, add_card_to_line, add_lucky13_card


def test_card_label_zero():
    assert card_label(0, "special") == "0 (Zéro)"


def test_card_label_unlucky_seven():
    assert card_label(7, "special") == "7 – Malchance"


def test_card_label_lucky_thirteen():
    assert card_label(13, "special") == "13 – Chance"


def test_card_label_plain_number():
    assert card_label(9, "regular") == "9"


def test_log_my_card_adds_to_line_and_tallies():
    mgr = AppStateManager()
    mgr.log_my_card(5, "regular")
    assert 5 in mgr.line.values
    assert mgr.seen[5]["regular"] == 1
    assert mgr.round_seen[5]["regular"] == 1
    assert mgr.recent_cards == ["5"]


def test_log_my_card_raises_when_exhausted():
    mgr = AppStateManager()
    mgr.log_my_card(1, "regular")  # only 1 copy of value 1 exists
    with pytest.raises(ValueError):
        mgr.log_my_card(1, "regular")


def test_undo_restores_previous_state():
    mgr = AppStateManager()
    mgr.log_my_card(5, "regular")
    mgr.undo()
    assert 5 not in mgr.line.values
    assert mgr.seen[5]["regular"] == 0
    assert mgr.recent_cards == []


def test_undo_with_empty_stack_is_a_no_op():
    mgr = AppStateManager()
    mgr.undo()
    assert mgr.line.card_count == 0


def test_my_card_click_removes_when_nothing_pending():
    mgr = AppStateManager()
    mgr.log_my_card(5, "regular")
    mgr.my_card_click(5)
    assert 5 not in mgr.line.values


def test_swap_completes_and_updates_line():
    mgr = AppStateManager()
    mgr.log_my_card(5, "regular")
    mgr.log_other_player_card(9, "regular")
    mgr.pending_pool_selection = (9, "regular")
    mgr.complete_swap(5)
    assert 5 not in mgr.line.values
    assert 9 in mgr.line.values
    assert mgr.pending_pool_selection is None


def test_swap_blocked_when_target_already_in_line():
    mgr = AppStateManager()
    mgr.log_my_card(5, "regular")
    mgr.log_my_card(9, "regular")
    mgr.log_other_player_card(9, "regular")
    mgr.pending_pool_selection = (9, "regular")
    with pytest.raises(SwapBlocked):
        mgr.complete_swap(5)
    assert mgr.pending_pool_selection is None
    assert mgr.line.values == frozenset({5, 9})  # unchanged


def test_claim_pool_modifier_decrements_round_pool_only():
    mgr = AppStateManager()
    mgr.log_special_card("modifier", "minus2")
    assert mgr.round_seen["modifier_types"]["minus2"] == 1
    mgr.claim_pool_modifier("modifier", "minus2")
    assert mgr.round_seen["modifier_types"]["minus2"] == 0
    assert mgr.line.card_count == 0


def test_new_round_resets_line_and_round_seen_but_keeps_seen():
    mgr = AppStateManager()
    mgr.log_my_card(5, "regular")
    mgr.new_round()
    assert mgr.line.card_count == 0
    assert mgr.round_seen[5]["regular"] == 0
    assert mgr.seen[5]["regular"] == 1


def test_reshuffle_keeps_only_my_held_cards_marked_seen():
    mgr = AppStateManager()
    mgr.log_my_card(5, "regular")
    mgr.log_other_player_card(9, "regular")
    mgr.reshuffle()
    assert mgr.seen[5]["regular"] == 1
    assert mgr.seen[9]["regular"] == 0


def test_new_game_resets_everything():
    mgr = AppStateManager()
    mgr.log_my_card(5, "regular")
    mgr.new_game()
    assert mgr.line.card_count == 0
    assert mgr.seen[5]["regular"] == 0
    assert mgr.round_seen[5]["regular"] == 0


def test_seen_from_my_line_handles_doubled_thirteen():
    line = add_lucky13_card(add_card_to_line(create_empty_line(), 13))
    seen = seen_from_my_line(line)
    assert seen[13]["regular"] == 1
    assert seen[13]["special"] == 1


def test_set_seen_count_is_undoable():
    mgr = AppStateManager()
    mgr.set_seen_count(5, "regular", 3)
    assert mgr.seen[5]["regular"] == 3
    mgr.undo()
    assert mgr.seen[5]["regular"] == 0


def test_set_special_seen_count_recomputes_other():
    mgr = AppStateManager()
    mgr.set_special_seen_count("modifier", "minus2", 1)
    assert mgr.seen["modifier_types"]["minus2"] == 1
    assert mgr.seen["other"] == 1
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
cd desktop && .venv/bin/pytest tests/test_app_state.py -v
```
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Write `desktop/src/flip7_desktop/app_state.py`**

```python
"""State-transition logic for the Flip 7 desktop app, ported from the
web app's app.mjs. Kept independent of any GUI toolkit so it can be
unit-tested directly; gui/main_window.py is a thin wiring layer on top.
"""

from .deck import MODIFIER_TYPES, ACTION_TYPES
from .shoe import create_empty_seen, log_card_seen, log_special_card_seen
from .line import (
    create_empty_line,
    add_card_to_line,
    add_lucky13_card,
    add_unlucky7_card,
    remove_card_from_line,
)
from .round_tracker import create_empty_round_seen, log_round_card, log_round_special_card, pool_available as _pool_available
from .engine import recommend, is_safe_card

RECENT_CARDS_LIMIT = 5


def card_label(value: int, kind: str) -> str:
    if value == 0:
        return "0 (Zéro)"
    if value == 7 and kind == "special":
        return "7 – Malchance"
    if value == 13 and kind == "special":
        return "13 – Chance"
    return str(value)


def add_card_by_kind(line, value: int, kind: str):
    if value == 7 and kind == "special":
        return add_unlucky7_card(line)
    if value == 13 and kind == "special":
        return add_lucky13_card(line)
    return add_card_to_line(line, value)


def seen_from_my_line(current_line) -> dict:
    result = create_empty_seen()
    for v in current_line.values:
        if v == 0:
            result = log_card_seen(result, 0, "special")
        elif v == 7:
            result = log_card_seen(result, 7, current_line.seven_kind)
        elif v == 13:
            if current_line.has_regular_13:
                result = log_card_seen(result, 13, "regular")
            if current_line.has_lucky_13:
                result = log_card_seen(result, 13, "special")
        else:
            result = log_card_seen(result, v, "regular")
    return result


class SwapBlocked(Exception):
    """Raised by complete_swap when the pending pool card would bust the line."""


class AppStateManager:
    def __init__(self, seen=None, line=None, round_seen=None, recent_cards=None):
        self.seen = seen if seen is not None else create_empty_seen()
        self.line = line if line is not None else create_empty_line()
        self.round_seen = round_seen if round_seen is not None else create_empty_round_seen()
        self.recent_cards = list(recent_cards) if recent_cards is not None else []
        self.undo_stack = []
        self.pending_pool_selection = None  # (value, kind) | None

    def _snapshot(self):
        self.undo_stack.append(
            {"seen": self.seen, "line": self.line, "round_seen": self.round_seen, "recent_cards": self.recent_cards}
        )

    def _push_recent(self, label: str):
        self.recent_cards = (self.recent_cards + [label])[-RECENT_CARDS_LIMIT:]

    def log_my_card(self, value: int, kind: str):
        next_seen = log_card_seen(self.seen, value, kind)
        next_round_seen = log_round_card(self.round_seen, value, kind)
        self._snapshot()
        self.seen = next_seen
        self.round_seen = next_round_seen
        self.line = add_card_by_kind(self.line, value, kind)
        self._push_recent(card_label(value, kind))

    def remove_my_card(self, value: int):
        self._snapshot()
        self.line = remove_card_from_line(self.line, value)

    def my_card_click(self, value: int):
        if self.pending_pool_selection is not None:
            self.complete_swap(value)
        else:
            self.remove_my_card(value)

    def complete_swap(self, remove_value: int):
        if self.pending_pool_selection is None:
            return
        value, kind = self.pending_pool_selection
        is_unlucky_seven = value == 7 and kind == "special"
        line_after_removal = remove_card_from_line(self.line, remove_value)
        if not is_unlucky_seven and not is_safe_card(line_after_removal, value, kind):
            self.pending_pool_selection = None
            raise SwapBlocked("Cette carte est déjà dans votre ligne — la prendre vous ferait buster.")
        self._snapshot()
        self.line = add_card_by_kind(line_after_removal, value, kind)
        self.pending_pool_selection = None

    def log_other_player_card(self, value: int, kind: str):
        next_seen = log_card_seen(self.seen, value, kind)
        next_round_seen = log_round_card(self.round_seen, value, kind)
        self._snapshot()
        self.seen = next_seen
        self.round_seen = next_round_seen
        self._push_recent(card_label(value, kind))

    def log_special_card(self, category: str, type_id: str):
        next_seen = log_special_card_seen(self.seen, category, type_id)
        self._snapshot()
        self.seen = next_seen
        self.round_seen = log_round_special_card(self.round_seen, category, type_id)
        types = MODIFIER_TYPES if category == "modifier" else ACTION_TYPES
        self._push_recent(types[type_id]["label"])

    def claim_pool_modifier(self, category: str, type_id: str):
        self._snapshot()
        key = "modifier_types" if category == "modifier" else "action_types"
        next_counts = dict(self.round_seen[key])
        next_counts[type_id] -= 1
        self.round_seen = {**self.round_seen, key: next_counts}

    def set_seen_count(self, value: int, kind: str, count: int):
        self._snapshot()
        self.seen = {**self.seen, value: {**self.seen[value], kind: count}}

    def set_special_seen_count(self, category: str, type_id: str, count: int):
        self._snapshot()
        key = "modifier_types" if category == "modifier" else "action_types"
        next_counts = {**self.seen[key], type_id: count}
        next_seen = {**self.seen, key: next_counts}
        next_seen["other"] = sum(next_seen["modifier_types"].values()) + sum(next_seen["action_types"].values())
        self.seen = next_seen

    def undo(self):
        if not self.undo_stack:
            return
        previous = self.undo_stack.pop()
        self.seen = previous["seen"]
        self.line = previous["line"]
        self.round_seen = previous["round_seen"]
        self.recent_cards = previous["recent_cards"]

    def new_round(self):
        self._snapshot()
        self.line = create_empty_line()
        self.round_seen = create_empty_round_seen()

    def reshuffle(self):
        self._snapshot()
        self.seen = seen_from_my_line(self.line)

    def new_game(self):
        self._snapshot()
        self.seen = create_empty_seen()
        self.line = create_empty_line()
        self.round_seen = create_empty_round_seen()

    def recommendation(self):
        return recommend(self.seen, self.line)

    def pool_available(self, value: int, kind: str) -> int:
        return _pool_available(self.round_seen, self.line, value, kind)
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
cd desktop && .venv/bin/pytest tests/test_app_state.py -v
```
Expected: 18 passed.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/flip7_desktop/app_state.py desktop/tests/test_app_state.py
git commit -m "Add app_state.py: GUI-independent state-transition layer"
```

---

### Task 8: GUI primitives — `gui/flow_layout.py` + `gui/chips.py`

**Files:**
- Create: `desktop/src/flip7_desktop/gui/flow_layout.py`
- Create: `desktop/src/flip7_desktop/gui/chips.py`
- Create: `desktop/tests/conftest.py`
- Test: `desktop/tests/test_flow_layout.py`
- Test: `desktop/tests/test_chips.py`

**Interfaces:**
- Produces: `FlowLayout` (a `QLayout` subclass with `addWidget`/`count`/`clear()`), `make_chip_button(text, on_click, object_name=None) -> QPushButton`, `make_held_card_chip(text, on_click) -> QPushButton`, `make_pool_number_button(text, on_click, selected=False) -> QPushButton`, `make_pool_badge(text, on_click) -> QPushButton` — consumed by Task 9. `conftest.py` provides a session-scoped `qapp` fixture reused by every later GUI test.

- [ ] **Step 1: Write `desktop/tests/conftest.py`**

```python
import os

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

import pytest
from PySide6.QtWidgets import QApplication


@pytest.fixture(scope="session")
def qapp():
    app = QApplication.instance() or QApplication([])
    yield app
```

- [ ] **Step 2: Write the failing tests — `desktop/tests/test_flow_layout.py`**

```python
from PySide6.QtWidgets import QWidget, QPushButton

from flip7_desktop.gui.flow_layout import FlowLayout


def test_flow_layout_holds_added_widgets(qapp):
    container = QWidget()
    layout = FlowLayout(container)
    layout.addWidget(QPushButton("A"))
    layout.addWidget(QPushButton("B"))
    assert layout.count() == 2


def test_flow_layout_clear_removes_all_items(qapp):
    container = QWidget()
    layout = FlowLayout(container)
    layout.addWidget(QPushButton("A"))
    layout.addWidget(QPushButton("B"))
    layout.clear()
    assert layout.count() == 0
```

- [ ] **Step 3: Write the failing tests — `desktop/tests/test_chips.py`**

```python
from flip7_desktop.gui.chips import make_chip_button, make_held_card_chip, make_pool_number_button, make_pool_badge


def test_make_chip_button_wires_click_callback(qapp):
    calls = []
    btn = make_chip_button("5", lambda: calls.append(True))
    btn.click()
    assert calls == [True]


def test_make_pool_number_button_marks_selected(qapp):
    btn = make_pool_number_button("9 (2)", lambda: None, selected=True)
    assert btn.property("chipRole") == "poolSelected"


def test_make_held_card_chip_role(qapp):
    btn = make_held_card_chip("5", lambda: None)
    assert btn.property("chipRole") == "held"


def test_make_pool_badge_role(qapp):
    btn = make_pool_badge("-2 (1)", lambda: None)
    assert btn.property("chipRole") == "badge"
```

- [ ] **Step 4: Run the tests, verify they fail**

```bash
cd desktop && .venv/bin/pytest tests/test_flow_layout.py tests/test_chips.py -v
```
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 5: Write `desktop/src/flip7_desktop/gui/flow_layout.py`**

```python
from PySide6.QtCore import Qt, QMargins, QPoint, QRect, QSize
from PySide6.QtWidgets import QLayout


class FlowLayout(QLayout):
    """Arranges child widgets left-to-right, wrapping to a new row when
    the current row runs out of horizontal space. Qt has no built-in
    equivalent to CSS's `flex-wrap: wrap`, which the web version relies
    on for #my-cards and #pool-grid-items — this is the standard Qt
    FlowLayout recipe, translated to PySide6.
    """

    def __init__(self, parent=None, margin=0, h_spacing=4, v_spacing=4):
        super().__init__(parent)
        self._h_spacing = h_spacing
        self._v_spacing = v_spacing
        self._items = []
        self.setContentsMargins(QMargins(margin, margin, margin, margin))

    def addItem(self, item):
        self._items.append(item)

    def count(self):
        return len(self._items)

    def itemAt(self, index):
        if 0 <= index < len(self._items):
            return self._items[index]
        return None

    def takeAt(self, index):
        if 0 <= index < len(self._items):
            return self._items.pop(index)
        return None

    def expandingDirections(self):
        return Qt.Orientation(0)

    def hasHeightForWidth(self):
        return True

    def heightForWidth(self, width):
        return self._do_layout(QRect(0, 0, width, 0), test_only=True)

    def setGeometry(self, rect):
        super().setGeometry(rect)
        self._do_layout(rect, test_only=False)

    def sizeHint(self):
        return self.minimumSize()

    def minimumSize(self):
        size = QSize()
        for item in self._items:
            size = size.expandedTo(item.minimumSize())
        margins = self.contentsMargins()
        size += QSize(margins.left() + margins.right(), margins.top() + margins.bottom())
        return size

    def _do_layout(self, rect, test_only):
        left, top, right, bottom = self.getContentsMargins()
        effective_rect = rect.adjusted(left, top, -right, -bottom)
        x = effective_rect.x()
        y = effective_rect.y()
        line_height = 0

        for item in self._items:
            item_size = item.sizeHint()
            next_x = x + item_size.width() + self._h_spacing
            if next_x - self._h_spacing > effective_rect.right() and line_height > 0:
                x = effective_rect.x()
                y = y + line_height + self._v_spacing
                next_x = x + item_size.width() + self._h_spacing
                line_height = 0

            if not test_only:
                item.setGeometry(QRect(QPoint(x, y), item_size))

            x = next_x
            line_height = max(line_height, item_size.height())

        return y + line_height - rect.y() + bottom

    def clear(self):
        while self._items:
            item = self.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
```

- [ ] **Step 6: Write `desktop/src/flip7_desktop/gui/chips.py`**

```python
from PySide6.QtWidgets import QPushButton


def make_chip_button(text: str, on_click, object_name: str | None = None) -> QPushButton:
    """A small, content-sized push button wired to a no-argument callback."""
    btn = QPushButton(text)
    if object_name:
        btn.setObjectName(object_name)
    btn.clicked.connect(on_click)
    return btn


def make_held_card_chip(text: str, on_click) -> QPushButton:
    btn = make_chip_button(text, on_click)
    btn.setProperty("chipRole", "held")
    return btn


def make_pool_number_button(text: str, on_click, selected: bool = False) -> QPushButton:
    btn = make_chip_button(text, on_click)
    btn.setProperty("chipRole", "poolSelected" if selected else "pool")
    return btn


def make_pool_badge(text: str, on_click) -> QPushButton:
    btn = make_chip_button(text, on_click)
    btn.setProperty("chipRole", "badge")
    return btn
```

- [ ] **Step 7: Run the tests, verify they pass**

```bash
cd desktop && .venv/bin/pytest tests/test_flow_layout.py tests/test_chips.py -v
```
Expected: 6 passed.

- [ ] **Step 8: Commit**

```bash
git add desktop/src/flip7_desktop/gui/flow_layout.py desktop/src/flip7_desktop/gui/chips.py desktop/tests/conftest.py desktop/tests/test_flow_layout.py desktop/tests/test_chips.py
git commit -m "Add FlowLayout utility and chip-button factories"
```

---

### Task 9: `gui/main_window.py` + `main.py`

**Files:**
- Create: `desktop/src/flip7_desktop/gui/main_window.py`
- Create: `desktop/src/flip7_desktop/main.py`
- Test: `desktop/tests/test_main_window_smoke.py`

**Interfaces:**
- Consumes: everything produced by Tasks 1-8 (`deck`, `shoe.remaining_count`, `app_state.AppStateManager`/`SwapBlocked`/`card_label`, `storage.AppState`/`load_state`/`save_state`/`DEFAULT_STATE_PATH`, `gui.flow_layout.FlowLayout`, `gui.chips.*`).
- Produces: `MainWindow(state_path: Path | None = None)` — a `QMainWindow` subclass; `main()` — the application entry point referenced by `pyproject.toml`'s `[project.scripts]`.

- [ ] **Step 1: Write the failing test — `desktop/tests/test_main_window_smoke.py`**

```python
from flip7_desktop.gui.main_window import MainWindow


def test_main_window_constructs_with_fresh_state(qapp, tmp_path):
    window = MainWindow(state_path=tmp_path / "state.json")
    assert window.deck_count_label.text() == "108"
    assert window.recommendation_label.text() == "HIT"  # empty line: nothing to lose


def test_logging_a_card_updates_deck_count_and_persists(qapp, tmp_path):
    state_path = tmp_path / "state.json"
    window = MainWindow(state_path=state_path)
    window._on_log_other_player_card(5, "regular")
    assert window.deck_count_label.text() == "107"
    assert state_path.exists()


def test_window_stays_on_top_flag_is_set(qapp, tmp_path):
    from PySide6.QtCore import Qt

    window = MainWindow(state_path=tmp_path / "state.json")
    assert bool(window.windowFlags() & Qt.WindowType.WindowStaysOnTopHint)
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
cd desktop && .venv/bin/pytest tests/test_main_window_smoke.py -v
```
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Write `desktop/src/flip7_desktop/gui/main_window.py`**

```python
from functools import partial
from pathlib import Path

from PySide6.QtCore import Qt, QEvent
from PySide6.QtWidgets import (
    QMainWindow,
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QGroupBox,
    QLabel,
    QPushButton,
    QSpinBox,
    QFormLayout,
    QMessageBox,
)

from ..deck import CARD_VALUES, SHOE_BASE, MODIFIER_TYPES, ACTION_TYPES
from ..app_state import AppStateManager, SwapBlocked, card_label
from ..shoe import remaining_count
from .. import storage
from .flow_layout import FlowLayout
from .chips import make_chip_button, make_held_card_chip, make_pool_number_button, make_pool_badge


def is_special_number_card(value: int, kind: str) -> bool:
    return value in (0, 7, 13) and kind == "special"


class MainWindow(QMainWindow):
    def __init__(self, state_path: Path | None = None):
        super().__init__()
        self.setWindowTitle("Flip 7")
        self.setWindowFlag(Qt.WindowType.WindowStaysOnTopHint, True)

        self.state_path = state_path if state_path is not None else storage.DEFAULT_STATE_PATH
        state = storage.load_state(self.state_path)
        self.manager = AppStateManager(
            seen=state.seen, line=state.line, round_seen=state.round_seen, recent_cards=state.recent_cards
        )

        self.seen_buttons = {}
        self.line_buttons = {}
        self.special_buttons = {}
        self.manual_seen_inputs = {}
        self.manual_special_inputs = {}

        central = QWidget()
        central.installEventFilter(self)
        self.setCentralWidget(central)
        root = QVBoxLayout(central)

        root.addLayout(self._build_title_bar())
        root.addLayout(self._build_status_bar())

        columns = QHBoxLayout()
        columns.addWidget(self._build_seen_group(), 1)
        columns.addWidget(self._build_line_group(), 1)
        columns.addWidget(self._build_pool_group(), 1)
        root.addLayout(columns)

        root.addWidget(self._build_manual_edit_group())

        self.render()

    # -- construction -----------------------------------------------

    def _build_title_bar(self):
        row = QHBoxLayout()
        title = QLabel("Flip 7")
        title.setStyleSheet("font-size: 16pt; font-weight: bold;")
        self.deck_count_label = QLabel("–")
        self.deck_count_label.setStyleSheet("font-size: 22pt; font-weight: bold; color: #d99a00;")
        row.addWidget(title)
        row.addStretch(1)
        row.addWidget(self.deck_count_label)
        return row

    def _build_status_bar(self):
        row = QHBoxLayout()
        self.bust_label = QLabel("Bust : – %")
        self.recommendation_label = QLabel("–")
        self.recommendation_label.setStyleSheet("font-size: 14pt; font-weight: bold;")
        self.recent_label = QLabel("–")
        row.addWidget(self.bust_label)
        row.addWidget(self.recommendation_label)
        row.addWidget(self.recent_label, 1)

        undo_btn = QPushButton("Annuler")
        undo_btn.clicked.connect(self._on_undo)
        round_btn = QPushButton("Round")
        round_btn.clicked.connect(self._on_new_round)
        reshuffle_btn = QPushButton("Reshuffle")
        reshuffle_btn.clicked.connect(self._on_reshuffle)
        game_btn = QPushButton("Partie")
        game_btn.clicked.connect(self._on_new_game)
        for btn in (undo_btn, round_btn, reshuffle_btn, game_btn):
            row.addWidget(btn)
        return row

    def _build_seen_group(self):
        group = QGroupBox("Autres joueurs")
        outer = QVBoxLayout(group)
        columns = QHBoxLayout()
        numbers_col = QVBoxLayout()
        specials_col = QVBoxLayout()
        for v in CARD_VALUES:
            for kind in ("regular", "special"):
                if SHOE_BASE[v][kind] == 0:
                    continue
                btn = make_chip_button(card_label(v, kind), partial(self._on_log_other_player_card, v, kind))
                self.seen_buttons[(v, kind)] = btn
                (specials_col if is_special_number_card(v, kind) else numbers_col).addWidget(btn)
        self._append_special_card_buttons(specials_col)
        numbers_col.addStretch(1)
        specials_col.addStretch(1)
        columns.addLayout(numbers_col)
        columns.addLayout(specials_col)
        outer.addLayout(columns)
        return group

    def _build_line_group(self):
        group = QGroupBox("Ma ligne")
        outer = QVBoxLayout(group)
        outer.addWidget(QLabel("Actuelle"))
        my_cards_container = QWidget()
        self.my_cards_layout = FlowLayout(my_cards_container)
        outer.addWidget(my_cards_container)

        outer.addWidget(QLabel("Ajouter"))
        columns = QHBoxLayout()
        numbers_col = QVBoxLayout()
        specials_col = QVBoxLayout()
        for v in CARD_VALUES:
            for kind in ("regular", "special"):
                if SHOE_BASE[v][kind] == 0:
                    continue
                btn = make_chip_button(card_label(v, kind), partial(self._on_log_my_card, v, kind))
                self.line_buttons[(v, kind)] = btn
                (specials_col if is_special_number_card(v, kind) else numbers_col).addWidget(btn)
        self._append_special_card_buttons(specials_col)
        numbers_col.addStretch(1)
        specials_col.addStretch(1)
        columns.addLayout(numbers_col)
        columns.addLayout(specials_col)
        outer.addLayout(columns)
        return group

    def _append_special_card_buttons(self, layout):
        for type_id, type_def in MODIFIER_TYPES.items():
            btn = make_chip_button(type_def["label"], partial(self._on_log_special_card, "modifier", type_id))
            self.special_buttons.setdefault(("modifier", type_id), []).append(btn)
            layout.addWidget(btn)
        for type_id, type_def in ACTION_TYPES.items():
            btn = make_chip_button(type_def["label"], partial(self._on_log_special_card, "action", type_id))
            self.special_buttons.setdefault(("action", type_id), []).append(btn)
            layout.addWidget(btn)

    def _build_pool_group(self):
        group = QGroupBox("Échange")
        outer = QVBoxLayout(group)
        pool_container = QWidget()
        self.pool_layout = FlowLayout(pool_container)
        outer.addWidget(pool_container)
        return group

    def _build_manual_edit_group(self):
        group = QGroupBox("Correction manuelle")
        group.setCheckable(True)
        group.setChecked(False)
        form = QFormLayout(group)
        for v in CARD_VALUES:
            for kind in ("regular", "special"):
                max_count = SHOE_BASE[v][kind]
                if max_count == 0:
                    continue
                spin = QSpinBox()
                spin.setRange(0, max_count)
                spin.valueChanged.connect(partial(self._on_manual_seen_changed, v, kind))
                self.manual_seen_inputs[(v, kind)] = spin
                form.addRow(f"{card_label(v, kind)} vues :", spin)
        for type_id, type_def in MODIFIER_TYPES.items():
            spin = QSpinBox()
            spin.setRange(0, type_def["max"])
            spin.valueChanged.connect(partial(self._on_manual_special_changed, "modifier", type_id))
            self.manual_special_inputs[("modifier", type_id)] = spin
            form.addRow(f"{type_def['label']} vues :", spin)
        for type_id, type_def in ACTION_TYPES.items():
            spin = QSpinBox()
            spin.setRange(0, type_def["max"])
            spin.valueChanged.connect(partial(self._on_manual_special_changed, "action", type_id))
            self.manual_special_inputs[("action", type_id)] = spin
            form.addRow(f"{type_def['label']} vues :", spin)
        return group

    # -- click handlers -----------------------------------------------

    def _on_log_other_player_card(self, value, kind):
        try:
            self.manager.log_other_player_card(value, kind)
        except ValueError as err:
            QMessageBox.warning(self, "Flip 7", str(err))
            return
        self._save_and_render()

    def _on_log_my_card(self, value, kind):
        try:
            self.manager.log_my_card(value, kind)
        except ValueError as err:
            QMessageBox.warning(self, "Flip 7", str(err))
            return
        self._save_and_render()

    def _on_log_special_card(self, category, type_id):
        try:
            self.manager.log_special_card(category, type_id)
        except ValueError as err:
            QMessageBox.warning(self, "Flip 7", str(err))
            return
        self._save_and_render()

    def _on_my_card_clicked(self, value):
        try:
            self.manager.my_card_click(value)
        except SwapBlocked as err:
            QMessageBox.warning(self, "Flip 7", str(err))
        self._save_and_render()

    def _on_pool_number_clicked(self, value, kind):
        self.manager.pending_pool_selection = (value, kind)
        self.render()

    def _on_claim_pool_modifier(self, category, type_id):
        self.manager.claim_pool_modifier(category, type_id)
        self._save_and_render()

    def _on_undo(self):
        self.manager.undo()
        self._save_and_render()

    def _on_new_round(self):
        self.manager.new_round()
        self._save_and_render()

    def _on_reshuffle(self):
        self.manager.reshuffle()
        self._save_and_render()

    def _on_new_game(self):
        self.manager.new_game()
        self._save_and_render()

    def _on_manual_seen_changed(self, value, kind, new_count):
        if new_count == self.manager.seen[value][kind]:
            return
        self.manager.set_seen_count(value, kind, new_count)
        self._save_and_render()

    def _on_manual_special_changed(self, category, type_id, new_count):
        key = "modifier_types" if category == "modifier" else "action_types"
        if new_count == self.manager.seen[key][type_id]:
            return
        self.manager.set_special_seen_count(category, type_id, new_count)
        self._save_and_render()

    # -- click-outside cancels a pending pool selection ----------------

    def eventFilter(self, obj, event):
        if event.type() == QEvent.Type.MouseButtonPress and self.manager.pending_pool_selection is not None:
            self.manager.pending_pool_selection = None
            self.render()
        return super().eventFilter(obj, event)

    # -- persistence + rendering ---------------------------------------

    def _save_and_render(self):
        storage.save_state(
            storage.AppState(
                seen=self.manager.seen,
                line=self.manager.line,
                round_seen=self.manager.round_seen,
                recent_cards=self.manager.recent_cards,
            ),
            self.state_path,
        )
        self.render()

    def render(self):
        result = self.manager.recommendation()
        self.bust_label.setText(f"Bust : {result.probabilities['bust'] * 100:.1f} %")
        self.recommendation_label.setText(result.action)
        self.deck_count_label.setText(str(result.buckets.d))
        self.recent_label.setText(
            ", ".join(reversed(self.manager.recent_cards)) if self.manager.recent_cards else "–"
        )

        for (v, kind), btn in self.seen_buttons.items():
            btn.setDisabled(remaining_count(self.manager.seen, v, kind) == 0)
        for (v, kind), btn in self.line_buttons.items():
            btn.setDisabled(remaining_count(self.manager.seen, v, kind) == 0)
        for (category, type_id), buttons in self.special_buttons.items():
            key = "modifier_types" if category == "modifier" else "action_types"
            type_def = MODIFIER_TYPES[type_id] if category == "modifier" else ACTION_TYPES[type_id]
            disabled = self.manager.seen[key][type_id] >= type_def["max"]
            for btn in buttons:
                btn.setDisabled(disabled)

        for (v, kind), spin in self.manual_seen_inputs.items():
            spin.blockSignals(True)
            spin.setValue(self.manager.seen[v][kind])
            spin.blockSignals(False)
        for (category, type_id), spin in self.manual_special_inputs.items():
            key = "modifier_types" if category == "modifier" else "action_types"
            spin.blockSignals(True)
            spin.setValue(self.manager.seen[key][type_id])
            spin.blockSignals(False)

        self._render_my_cards()
        self._render_pool()

    def _render_my_cards(self):
        self.my_cards_layout.clear()
        for chip_value, label in self._held_card_chips():
            btn = make_held_card_chip(label, partial(self._on_my_card_clicked, chip_value))
            self.my_cards_layout.addWidget(btn)

    def _held_card_chips(self):
        chips = []
        for v in self.manager.line.values:
            if v == 7:
                chips.append((7, card_label(7, self.manager.line.seven_kind)))
            elif v == 13:
                if self.manager.line.has_regular_13 and self.manager.line.has_lucky_13:
                    chips.append((13, "13 (+ Chance)"))
                elif self.manager.line.has_lucky_13:
                    chips.append((13, card_label(13, "special")))
                else:
                    chips.append((13, card_label(13, "regular")))
            else:
                chips.append((v, card_label(v, "regular")))
        return chips

    def _render_pool(self):
        self.pool_layout.clear()
        for v in CARD_VALUES:
            for kind in ("regular", "special"):
                if SHOE_BASE[v][kind] == 0:
                    continue
                available = self.manager.pool_available(v, kind)
                if available <= 0:
                    continue
                selected = self.manager.pending_pool_selection == (v, kind)
                btn = make_pool_number_button(
                    f"{card_label(v, kind)} ({available})",
                    partial(self._on_pool_number_clicked, v, kind),
                    selected=selected,
                )
                self.pool_layout.addWidget(btn)
        for type_id, type_def in MODIFIER_TYPES.items():
            count = self.manager.round_seen["modifier_types"][type_id]
            if count <= 0:
                continue
            btn = make_pool_badge(
                f"{type_def['label']} ({count})", partial(self._on_claim_pool_modifier, "modifier", type_id)
            )
            self.pool_layout.addWidget(btn)
        for type_id, type_def in ACTION_TYPES.items():
            count = self.manager.round_seen["action_types"][type_id]
            if count <= 0:
                continue
            btn = make_pool_badge(
                f"{type_def['label']} ({count})", partial(self._on_claim_pool_modifier, "action", type_id)
            )
            self.pool_layout.addWidget(btn)
```

- [ ] **Step 4: Write `desktop/src/flip7_desktop/main.py`**

```python
import sys

from PySide6.QtWidgets import QApplication

from .gui.main_window import MainWindow

STYLE_SHEET = """
QPushButton[chipRole="held"] {
    border-radius: 10px;
    padding: 2px 10px;
}
QPushButton[chipRole="poolSelected"] {
    background-color: #f4c95d;
    font-weight: bold;
}
QPushButton[chipRole="badge"] {
    border: 1px solid #d98a5f;
    color: #7a4a26;
}
"""


def main():
    app = QApplication(sys.argv)
    app.setStyleSheet(STYLE_SHEET)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run the test, verify it passes**

```bash
cd desktop && .venv/bin/pytest tests/test_main_window_smoke.py -v
```
Expected: 3 passed.

- [ ] **Step 6: Run the full test suite**

```bash
cd desktop && .venv/bin/pytest -v
```
Expected: every test across all nine modules passes (deck, shoe, line, round_tracker, engine, storage, app_state, flow_layout, chips, main_window_smoke).

- [ ] **Step 7: Commit**

```bash
git add desktop/src/flip7_desktop/gui/main_window.py desktop/src/flip7_desktop/main.py desktop/tests/test_main_window_smoke.py
git commit -m "Add MainWindow: 3-column always-on-top GUI wired to AppStateManager"
```

---

### Task 10: Manual verification pass + README

**Files:**
- Create: `desktop/README.md`

**Interfaces:**
- Consumes: `main()` from Task 9.
- Produces: nothing new — this task is a verification gate plus run instructions, no new importable code.

- [ ] **Step 1: Write `desktop/README.md`**

```markdown
# Flip 7 Desktop

Native PySide6 port of the Flip 7 hit/stay advisor, pinned always-on-top.

## Setup

```bash
cd desktop
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
```

## Run

```bash
.venv/bin/flip7-desktop
```

## Test

```bash
.venv/bin/pytest
```

State is persisted to `~/.flip7-desktop/state.json`.
```

- [ ] **Step 2: Launch the app and manually verify every scenario below**

```bash
cd desktop && .venv/bin/flip7-desktop
```

Check off each scenario against the running app:
- Window opens titled "Flip 7", stays visible when another window is focused on top of it (always-on-top).
- Deck count starts at 108; clicking any "Autres joueurs" number decrements it by 1 and disables that button once its copies are exhausted.
- Clicking a "Ma ligne → Ajouter" number adds a chip under "Actuelle" and updates Bust %/recommendation.
- Clicking a held-card chip with nothing pending removes it (Steal).
- Clicking a pool number in "Échange" highlights it, then clicking a held-card chip completes the swap (chip replaced); clicking anywhere outside the pool/line zones instead cancels the pending selection with no change.
- Clicking a Modifier/Action button in either "Autres joueurs" or "Ma ligne" logs it identically in both places (both copies disable together at max).
- Clicking a Modifier/Action badge in "Échange" removes it from the pool with no line effect.
- "Annuler" undoes the most recent action, including a chain of several in a row.
- "Round" clears the line and the round pool but keeps the deck count.
- "Reshuffle" resets the deck count to 108 minus only the player's own currently held cards.
- "Partie" resets everything.
- Closing and relaunching the app restores the exact same state (persistence round-trip).
- Expanding "Correction manuelle" and changing a spin box updates the corresponding tally and is itself undoable via "Annuler".

- [ ] **Step 3: Commit**

```bash
git add desktop/README.md
git commit -m "Add desktop app README and run instructions"
```
