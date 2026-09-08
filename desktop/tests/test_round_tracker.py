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
