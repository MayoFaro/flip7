from dataclasses import dataclass


@dataclass(frozen=True)
class Line:
    values: frozenset
    has_regular_13: bool
    has_lucky_13: bool
    seven_kind: str | None
    card_count: int
    busted: bool = False


def create_empty_line() -> Line:
    return Line(values=frozenset(), has_regular_13=False, has_lucky_13=False, seven_kind=None, card_count=0)


def add_card_to_line(line: Line, value: int) -> Line:
    return Line(
        values=line.values | {value},
        has_regular_13=line.has_regular_13 or value == 13,
        has_lucky_13=line.has_lucky_13,
        seven_kind="regular" if value == 7 else line.seven_kind,
        card_count=line.card_count + 1,
        busted=line.busted,
    )


def add_lucky13_card(line: Line) -> Line:
    return Line(
        values=line.values | {13},
        has_regular_13=line.has_regular_13,
        has_lucky_13=True,
        seven_kind=line.seven_kind,
        card_count=line.card_count + 1,
        busted=line.busted,
    )


def add_unlucky7_card(line: Line) -> Line:
    return Line(values=frozenset({7}), has_regular_13=False, has_lucky_13=False, seven_kind="special", card_count=1)


def remove_card_from_line(line: Line, value: int) -> Line:
    if value not in line.values:
        return line

    if value == 13:
        if line.has_lucky_13:
            values = line.values if line.has_regular_13 else (line.values - {13})
            return Line(
                values=values,
                has_regular_13=line.has_regular_13,
                has_lucky_13=False,
                seven_kind=line.seven_kind,
                card_count=line.card_count - 1,
                busted=line.busted,
            )
        return Line(
            values=line.values - {13},
            has_regular_13=False,
            has_lucky_13=line.has_lucky_13,
            seven_kind=line.seven_kind,
            card_count=line.card_count - 1,
            busted=line.busted,
        )

    return Line(
        values=line.values - {value},
        has_regular_13=line.has_regular_13,
        has_lucky_13=line.has_lucky_13,
        seven_kind=None if value == 7 else line.seven_kind,
        card_count=line.card_count - 1,
        busted=line.busted,
    )


def mark_busted(line: Line) -> Line:
    """Flags the line as busted without adding a card -- used when a
    duplicate value is drawn for the player: it never joins `values`
    (a set can't hold two of the same value), it just ends the round."""
    return Line(
        values=line.values,
        has_regular_13=line.has_regular_13,
        has_lucky_13=line.has_lucky_13,
        seven_kind=line.seven_kind,
        card_count=line.card_count,
        busted=True,
    )


def compute_raw_score(line: Line) -> int:
    if line.busted:
        return 0
    has_zero = 0 in line.values
    completed_flip7 = line.card_count >= 7
    if has_zero and not completed_flip7:
        return 0
    total = sum(line.values)
    if line.has_regular_13 and line.has_lucky_13:
        total += 13
    return total
