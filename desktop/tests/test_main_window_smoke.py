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
