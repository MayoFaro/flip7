import json

from flip7_desktop.storage import AppState, load_state, save_state, STATE_VERSION
from flip7_desktop.shoe import create_empty_seen, log_card_seen
from flip7_desktop.line import create_empty_line, add_card_to_line, mark_busted
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


def test_round_trip_preserves_busted_flag(tmp_path):
    path = tmp_path / "state.json"
    line = mark_busted(add_card_to_line(create_empty_line(), 5))
    state = AppState(seen=create_empty_seen(), line=line, round_seen=create_empty_round_seen(), recent_cards=[])

    save_state(state, path)
    loaded = load_state(path)

    assert loaded.line.busted


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
