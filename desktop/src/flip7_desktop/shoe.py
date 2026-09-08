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
