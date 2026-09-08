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
