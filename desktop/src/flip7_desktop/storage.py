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
