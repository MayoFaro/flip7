"""Automated interaction walkthrough covering Task 10's manual verification
checklist. This sandbox has no real display, so literal manual/visual
verification (does the window look right on screen, does it truly stay
above other windows) is impossible here. Instead these tests drive the
real ``MainWindow`` headlessly (via the ``qapp`` offscreen fixture from
conftest.py) through every scenario in the checklist, calling the same
handler methods its buttons are wired to and asserting on the resulting
state -- turning the manual walkthrough into permanent regression coverage.

Each test uses small, low-traffic card values (5, 8, 9) that have plenty
of copies in the shoe, except where a scenario specifically wants to
exercise exhaustion, in which case a low-copy value (2) is used on purpose.
"""

from PySide6.QtWidgets import QMessageBox

from flip7_desktop.gui.main_window import MainWindow


# -- Autres joueurs: deck count + exhaustion -----------------------------


def test_deck_count_decrements_and_button_disables_when_exhausted(qapp, tmp_path):
    window = MainWindow(state_path=tmp_path / "state.json")
    assert window.deck_count_label.text() == "108"

    btn = window.seen_buttons[(2, "regular")]  # value 2 has exactly 2 regular copies
    assert btn.isEnabled()

    window._on_log_other_player_card(2, "regular")
    assert window.deck_count_label.text() == "107"
    assert btn.isEnabled()  # one copy of value 2 still remains

    window._on_log_other_player_card(2, "regular")
    assert window.deck_count_label.text() == "106"
    assert not btn.isEnabled()  # both copies of value 2 now seen


# -- Ma ligne -> Ajouter --------------------------------------------------


def test_log_my_card_adds_to_line_and_updates_recommendation(qapp, tmp_path):
    window = MainWindow(state_path=tmp_path / "state.json")
    window._on_log_my_card(9, "regular")

    assert 9 in window.manager.line.values
    expected = window.manager.recommendation()
    assert window.recommendation_label.text() == expected.action
    assert window.bust_label.text() == f"Bust : {expected.probabilities['bust'] * 100:.1f} %"


# -- Held-card chip click with nothing pending (Steal / remove) ----------


def test_click_held_card_with_nothing_pending_removes_it(qapp, tmp_path):
    window = MainWindow(state_path=tmp_path / "state.json")
    window._on_log_my_card(9, "regular")
    assert window.manager.pending_pool_selection is None

    window._on_my_card_clicked(9)
    assert 9 not in window.manager.line.values


# -- Two-step swap (pool select, then held-card click completes it) -----


def test_two_step_swap_completes(qapp, tmp_path):
    window = MainWindow(state_path=tmp_path / "state.json")
    window._on_log_my_card(9, "regular")
    window._on_log_other_player_card(5, "regular")  # makes 5/regular available in the pool

    window._on_pool_number_clicked(5, "regular")
    assert window.manager.pending_pool_selection == (5, "regular")

    window._on_my_card_clicked(9)  # completes the swap: 9 out, 5 in

    assert 9 not in window.manager.line.values
    assert 5 in window.manager.line.values
    assert window.manager.pending_pool_selection is None


def test_blocked_swap_leaves_line_unchanged(qapp, tmp_path, monkeypatch):
    window = MainWindow(state_path=tmp_path / "state.json")
    window._on_log_my_card(9, "regular")
    window._on_log_my_card(8, "regular")
    window._on_log_other_player_card(9, "regular")  # a second 9 revealed by another player

    line_before = window.manager.line
    window._on_pool_number_clicked(9, "regular")

    # Removing 8 would still leave 9 in the line -- swap should be blocked.
    # The handler catches SwapBlocked internally and shows a modal
    # QMessageBox.warning(...), which calls exec() and blocks waiting to be
    # dismissed -- nothing dismisses it under the offscreen QPA platform, so
    # without patching it out here the test suite hangs forever. Patching it
    # is just to keep this headless test from blocking; the actual assertion
    # is on state, not on the dialog.
    monkeypatch.setattr(QMessageBox, "warning", lambda *args, **kwargs: None)

    window._on_my_card_clicked(8)  # no exception should escape past the handler

    assert window.manager.line == line_before
    assert window.manager.pending_pool_selection is None


# -- Modifier/Action buttons disable both copies at max ------------------


def test_special_card_button_disables_both_copies_at_max(qapp, tmp_path):
    window = MainWindow(state_path=tmp_path / "state.json")
    buttons = window.special_buttons[("action", "swap")]  # max=2, one button per column
    assert len(buttons) == 2
    assert all(b.isEnabled() for b in buttons)

    window._on_log_special_card("action", "swap")
    assert all(b.isEnabled() for b in buttons)  # 1 of 2 max -- still enabled

    window._on_log_special_card("action", "swap")
    assert all(not b.isEnabled() for b in buttons)  # 2 of 2 max -- both disabled


# -- Claiming a Modifier/Action badge from the pool -----------------------


def test_claim_pool_modifier_decrements_round_pool_leaves_line_unchanged(qapp, tmp_path):
    window = MainWindow(state_path=tmp_path / "state.json")
    window._on_log_special_card("modifier", "minus2")
    assert window.manager.round_seen["modifier_types"]["minus2"] == 1

    card_count_before = window.manager.line.card_count
    window._on_claim_pool_modifier("modifier", "minus2")

    assert window.manager.round_seen["modifier_types"]["minus2"] == 0
    assert window.manager.line.card_count == card_count_before


# -- Undo, including a chain of two in a row ------------------------------


def test_undo_reverses_most_recent_action_and_chain_of_two(qapp, tmp_path):
    window = MainWindow(state_path=tmp_path / "state.json")
    window._on_log_my_card(9, "regular")
    window._on_log_my_card(8, "regular")
    assert window.manager.line.values == frozenset({8, 9})

    window._on_undo()
    assert window.manager.line.values == frozenset({9})

    window._on_undo()
    assert window.manager.line.values == frozenset()


# -- New round: clears line/round_seen, keeps seen ------------------------


def test_new_round_clears_line_and_round_seen_but_keeps_seen(qapp, tmp_path):
    window = MainWindow(state_path=tmp_path / "state.json")
    window._on_log_my_card(9, "regular")

    window._on_new_round()

    assert window.manager.line.card_count == 0
    assert window.manager.round_seen[9]["regular"] == 0
    assert window.manager.seen[9]["regular"] == 1


# -- Reshuffle: only own held cards stay marked seen; round_seen/line untouched --


def test_reshuffle_keeps_only_held_cards_seen_and_leaves_round_seen_and_line_untouched(qapp, tmp_path):
    window = MainWindow(state_path=tmp_path / "state.json")
    window._on_log_my_card(9, "regular")
    window._on_log_other_player_card(5, "regular")

    round_seen_before = window.manager.round_seen
    line_before = window.manager.line

    window._on_reshuffle()

    assert window.manager.seen[9]["regular"] == 1  # my held card stays seen
    assert window.manager.seen[5]["regular"] == 0  # someone else's reveal is forgotten

    # The gap flagged by prior reviews: reshuffle must not touch round_seen or line.
    assert window.manager.round_seen == round_seen_before
    assert window.manager.line == line_before


# -- New game: resets everything ------------------------------------------


def test_new_game_resets_seen_line_and_round_seen(qapp, tmp_path):
    window = MainWindow(state_path=tmp_path / "state.json")
    window._on_log_my_card(9, "regular")
    window._on_log_other_player_card(5, "regular")

    window._on_new_game()

    assert window.manager.line.card_count == 0
    assert window.manager.seen[9]["regular"] == 0
    assert window.manager.seen[5]["regular"] == 0
    assert window.manager.round_seen[9]["regular"] == 0
    assert window.manager.round_seen[5]["regular"] == 0


# -- Persistence round-trip: closing and relaunching restores state ------


def test_persistence_round_trip_across_window_instances(qapp, tmp_path):
    state_path = tmp_path / "state.json"
    window1 = MainWindow(state_path=state_path)
    window1._on_log_my_card(9, "regular")
    window1._on_log_other_player_card(5, "regular")

    # Simulate closing and relaunching the app: a fresh MainWindow pointed
    # at the same state file should load identical state.
    window2 = MainWindow(state_path=state_path)

    assert window2.deck_count_label.text() == window1.deck_count_label.text()
    assert window2.manager.line.values == window1.manager.line.values
    assert window2.manager.seen[9]["regular"] == window1.manager.seen[9]["regular"]
    assert window2.manager.seen[5]["regular"] == window1.manager.seen[5]["regular"]


# -- Manual edit path: spin box change is undoable ------------------------


def test_manual_seen_edit_and_undo(qapp, tmp_path):
    window = MainWindow(state_path=tmp_path / "state.json")
    assert window.manager.seen[9]["regular"] == 0

    window._on_manual_seen_changed(9, "regular", 3)
    assert window.manager.seen[9]["regular"] == 3

    window._on_undo()
    assert window.manager.seen[9]["regular"] == 0


# -- pool_available called directly (previously never exercised) ---------


def test_pool_available_called_directly_returns_sane_int(qapp, tmp_path):
    window = MainWindow(state_path=tmp_path / "state.json")
    window._on_log_other_player_card(5, "regular")

    available = window.manager.pool_available(5, "regular")

    assert isinstance(available, int)
    assert available == 1
