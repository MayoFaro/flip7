import pytest

from flip7_desktop.app_state import AppStateManager, SwapBlocked, card_label, seen_from_round_in_play


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


def test_reshuffle_keeps_everyone_currently_in_play_marked_seen():
    mgr = AppStateManager()
    mgr.log_my_card(5, "regular")
    mgr.log_other_player_card(9, "regular")
    mgr.reshuffle()
    assert mgr.seen[5]["regular"] == 1  # still in my line
    assert mgr.seen[9]["regular"] == 1  # revealed this round -- presumed still on someone's table


def test_reshuffle_frees_cards_from_a_round_that_already_ended():
    mgr = AppStateManager()
    mgr.log_other_player_card(9, "regular")
    mgr.new_round()  # that round fully resolved -- the 9 is genuinely back in the discard pile
    mgr.reshuffle()
    assert mgr.seen[9]["regular"] == 0


def test_reshuffle_returns_action_cards_played_this_round_to_circulation():
    mgr = AppStateManager()
    mgr.log_special_card("action", "swap")
    mgr.reshuffle()
    assert mgr.seen["action_types"]["swap"] == 0  # actions are discarded the instant they're played


def test_reshuffle_keeps_modifier_cards_played_this_round_marked_seen():
    mgr = AppStateManager()
    mgr.log_special_card("modifier", "minus2")
    mgr.reshuffle()
    assert mgr.seen["modifier_types"]["minus2"] == 1  # modifiers stay attached to a line, unlike actions


def test_new_game_resets_everything():
    mgr = AppStateManager()
    mgr.log_my_card(5, "regular")
    mgr.new_game()
    assert mgr.line.card_count == 0
    assert mgr.seen[5]["regular"] == 0
    assert mgr.round_seen[5]["regular"] == 0
    assert mgr.recent_cards == []


def test_steal_pool_card_adds_it_without_removing_anything():
    mgr = AppStateManager()
    mgr.log_other_player_card(9, "regular")
    mgr.steal_pool_card(9, "regular")
    assert 9 in mgr.line.values
    assert mgr.pending_pool_selection is None


def test_steal_pool_card_blocked_when_it_would_bust():
    mgr = AppStateManager()
    mgr.log_my_card(9, "regular")
    mgr.log_other_player_card(9, "regular")
    with pytest.raises(SwapBlocked):
        mgr.steal_pool_card(9, "regular")
    assert mgr.line.values == frozenset({9})  # unchanged


def test_seen_from_round_in_play_replays_round_seen_minus_actions():
    mgr = AppStateManager()
    mgr.log_my_card(5, "regular")
    mgr.log_special_card("action", "steal")
    seen = seen_from_round_in_play(mgr.round_seen)
    assert seen[5]["regular"] == 1
    assert seen["action_types"]["steal"] == 0


def test_log_my_card_duplicate_busts_the_line_and_is_not_added_to_round_pool():
    mgr = AppStateManager()
    mgr.log_my_card(9, "regular")
    mgr.log_my_card(9, "regular")  # a second, different physical "9" -- a bust
    assert mgr.line.busted
    assert mgr.line.card_count == 1  # the duplicate never joins the line
    assert mgr.seen[9]["regular"] == 2  # both physical cards are gone from the shoe
    assert mgr.round_seen[9]["regular"] == 1  # but only the first counts as "in the pool"
    assert mgr.pool_available(9, "regular") == 0


def test_undo_reverses_a_bust():
    mgr = AppStateManager()
    mgr.log_my_card(9, "regular")
    mgr.log_my_card(9, "regular")
    mgr.undo()
    assert not mgr.line.busted
    assert mgr.seen[9]["regular"] == 1


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
