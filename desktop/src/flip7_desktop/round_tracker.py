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
