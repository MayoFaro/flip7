import pytest

from flip7_desktop.shoe import create_empty_seen, log_card_seen
from flip7_desktop.line import create_empty_line, add_card_to_line, add_lucky13_card, mark_busted
from flip7_desktop.engine import (
    compute_buckets,
    assert_partition,
    compute_probabilities,
    is_safe_card,
    compute_expected_value,
    recommend,
)


def test_partition_holds_for_a_fresh_game():
    buckets = compute_buckets(create_empty_seen(), create_empty_line())
    assert_partition(buckets)  # must not raise


def test_holding_a_value_moves_its_remaining_copies_to_bust():
    line = add_card_to_line(create_empty_line(), 5)
    buckets = compute_buckets(create_empty_seen(), line)
    assert_partition(buckets)
    assert buckets.r >= 5  # all 5 undrawn copies of value 5 now bust


def test_unlucky_seven_is_safe_on_an_empty_line():
    buckets = compute_buckets(create_empty_seen(), create_empty_line())
    assert buckets.u == 0  # empty line: the Unlucky 7 copy counts as safe, not reset


def test_unlucky_seven_resets_a_nonempty_line():
    line = add_card_to_line(create_empty_line(), 5)
    buckets = compute_buckets(create_empty_seen(), line)
    assert buckets.u == 1  # the one undrawn Unlucky-7 copy


def test_lucky_thirteen_is_always_safe_even_holding_regular_13():
    line = add_card_to_line(create_empty_line(), 13)
    assert is_safe_card(line, 13, "special")
    assert not is_safe_card(line, 13, "regular")


def test_expected_value_equals_raw_score_when_no_cards_remain():
    seen = create_empty_seen()
    for v in range(14):
        for kind in ("regular", "special"):
            from flip7_desktop.deck import SHOE_BASE

            for _ in range(SHOE_BASE[v][kind]):
                seen = log_card_seen(seen, v, kind)
    line = add_card_to_line(create_empty_line(), 5)
    assert compute_expected_value(seen, line) == 5


def test_recommend_hits_on_an_empty_line():
    result = recommend(create_empty_seen(), create_empty_line())
    assert result.action == "HIT"  # nothing to lose, EV is always positive


def test_recommend_stays_when_almost_every_card_busts():
    # Hold every plain value 1-12 and a regular 13: only the two special
    # number cards (Zero, Lucky 13) and Modifier/Action cards stay safe.
    line = create_empty_line()
    for v in range(1, 13):
        line = add_card_to_line(line, v)
    line = add_card_to_line(line, 13)
    result = recommend(create_empty_seen(), line)
    assert result.action == "STAY"


def test_recommend_reports_busted_instead_of_hit_or_stay():
    line = mark_busted(add_card_to_line(create_empty_line(), 5))
    result = recommend(create_empty_seen(), line)
    assert result.action == "BUSTED"
    assert result.raw_score == 0
