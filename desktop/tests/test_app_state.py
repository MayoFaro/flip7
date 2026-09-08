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
