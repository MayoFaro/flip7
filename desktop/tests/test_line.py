from flip7_desktop.line import (
    create_empty_line,
    add_card_to_line,
    add_lucky13_card,
    add_unlucky7_card,
    remove_card_from_line,
    mark_busted,
    compute_raw_score,
)


def test_empty_line_defaults():
    line = create_empty_line()
    assert line.values == frozenset()
    assert not line.has_regular_13
    assert not line.has_lucky_13
    assert line.seven_kind is None
    assert line.card_count == 0
    assert not line.busted


def test_add_card_to_line_tracks_regular_seven():
    line = add_card_to_line(create_empty_line(), 7)
    assert 7 in line.values
    assert line.seven_kind == "regular"
    assert line.card_count == 1


def test_add_card_to_line_sets_has_regular_13():
    line = add_card_to_line(create_empty_line(), 13)
    assert line.has_regular_13
    assert not line.has_lucky_13


def test_add_lucky13_does_not_touch_regular_13_flag():
    line = add_lucky13_card(create_empty_line())
    assert line.has_lucky_13
    assert not line.has_regular_13
    assert 13 in line.values


def test_add_unlucky7_resets_the_whole_line():
    line = add_card_to_line(create_empty_line(), 5)
    line = add_unlucky7_card(line)
    assert line.values == frozenset({7})
    assert line.seven_kind == "special"
    assert line.card_count == 1


def test_remove_doubled_thirteen_clears_lucky_flag_first():
    line = create_empty_line()
    line = add_card_to_line(line, 13)   # regular
    line = add_lucky13_card(line)        # + lucky
    line = remove_card_from_line(line, 13)
    assert 13 in line.values             # regular 13 still there
    assert line.has_regular_13
    assert not line.has_lucky_13
    line = remove_card_from_line(line, 13)
    assert 13 not in line.values
    assert not line.has_regular_13


def test_remove_seven_clears_seven_kind():
    line = add_card_to_line(create_empty_line(), 7)
    line = remove_card_from_line(line, 7)
    assert 7 not in line.values
    assert line.seven_kind is None


def test_compute_raw_score_suppressed_while_zero_held_and_incomplete():
    line = add_card_to_line(create_empty_line(), 0)
    line = add_card_to_line(line, 5)
    assert compute_raw_score(line) == 0


def test_compute_raw_score_unsuppressed_once_flip7_complete():
    line = create_empty_line()
    for v in (0, 1, 2, 3, 4, 5, 6):
        line = add_card_to_line(line, v)
    assert line.card_count == 7
    assert compute_raw_score(line) == sum((0, 1, 2, 3, 4, 5, 6))


def test_compute_raw_score_counts_doubled_thirteen_twice():
    line = create_empty_line()
    line = add_card_to_line(line, 13)
    line = add_lucky13_card(line)
    assert compute_raw_score(line) == 26


def test_mark_busted_keeps_values_but_sets_the_flag():
    line = add_card_to_line(create_empty_line(), 5)
    line = mark_busted(line)
    assert line.busted
    assert line.values == frozenset({5})
    assert line.card_count == 1  # unchanged -- marking busted adds no card


def test_compute_raw_score_is_zero_once_busted():
    line = create_empty_line()
    for v in (0, 1, 2, 3, 4, 5, 6):
        line = add_card_to_line(line, v)
    line = mark_busted(line)
    assert compute_raw_score(line) == 0  # even a completed Flip 7 scores 0 once busted


def test_add_unlucky7_clears_a_prior_bust():
    line = mark_busted(add_card_to_line(create_empty_line(), 5))
    line = add_unlucky7_card(line)
    assert not line.busted
