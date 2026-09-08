import pytest

from flip7_desktop.deck import TOTAL_CARDS
from flip7_desktop.shoe import (
    create_empty_seen,
    log_card_seen,
    log_special_card_seen,
    remaining_count,
    total_undrawn,
)


def test_empty_seen_has_zero_everywhere():
    seen = create_empty_seen()
    assert seen["other"] == 0
    assert seen[5] == {"regular": 0, "special": 0}
    assert seen["modifier_types"]["minus2"] == 0
    assert seen["action_types"]["steal"] == 0


def test_log_card_seen_increments_and_returns_new_object():
    seen = create_empty_seen()
    next_seen = log_card_seen(seen, 5, "regular")
    assert next_seen[5]["regular"] == 1
    assert seen[5]["regular"] == 0  # original untouched


def test_log_card_seen_raises_past_max():
    seen = create_empty_seen()
    seen = log_card_seen(seen, 1, "regular")  # only 1 copy of value-1 exists
    with pytest.raises(ValueError):
        log_card_seen(seen, 1, "regular")


def test_log_special_card_seen_increments_type_and_recomputes_other():
    seen = create_empty_seen()
    seen = log_special_card_seen(seen, "modifier", "minus2")
    assert seen["modifier_types"]["minus2"] == 1
    assert seen["other"] == 1
    seen = log_special_card_seen(seen, "action", "steal")
    assert seen["action_types"]["steal"] == 1
    assert seen["other"] == 2


def test_log_special_card_seen_raises_past_max():
    seen = create_empty_seen()
    seen = log_special_card_seen(seen, "modifier", "minus2")  # max 1
    with pytest.raises(ValueError):
        log_special_card_seen(seen, "modifier", "minus2")


def test_remaining_count_decreases_after_logging():
    seen = create_empty_seen()
    assert remaining_count(seen, 5, "regular") == 5
    seen = log_card_seen(seen, 5, "regular")
    assert remaining_count(seen, 5, "regular") == 4


def test_total_undrawn_starts_at_total_cards_and_decreases():
    seen = create_empty_seen()
    assert total_undrawn(seen) == TOTAL_CARDS
    seen = log_card_seen(seen, 5, "regular")
    assert total_undrawn(seen) == TOTAL_CARDS - 1
