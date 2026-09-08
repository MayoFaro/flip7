from flip7_desktop.deck import (
    CARD_VALUES,
    SHOE_BASE,
    MODIFIER_TYPES,
    ACTION_TYPES,
    MODIFIERS_TOTAL,
    ACTIONS_TOTAL,
    TOTAL_CARDS,
)


def test_card_values_is_zero_through_thirteen():
    assert CARD_VALUES == list(range(14))


def test_shoe_base_zero_is_a_single_special_card():
    assert SHOE_BASE[0] == {"regular": 0, "special": 1}


def test_shoe_base_seven_has_unlucky_special():
    assert SHOE_BASE[7] == {"regular": 6, "special": 1}


def test_shoe_base_thirteen_has_lucky_special():
    assert SHOE_BASE[13] == {"regular": 12, "special": 1}


def test_modifier_types_are_six_single_copies():
    assert len(MODIFIER_TYPES) == 6
    assert all(t["max"] == 1 for t in MODIFIER_TYPES.values())


def test_action_types_are_five_double_copies():
    assert len(ACTION_TYPES) == 5
    assert all(t["max"] == 2 for t in ACTION_TYPES.values())


def test_modifiers_and_actions_totals():
    assert MODIFIERS_TOTAL == 6
    assert ACTIONS_TOTAL == 10


def test_total_cards_is_108():
    assert TOTAL_CARDS == 108
