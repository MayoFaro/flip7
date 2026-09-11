from dataclasses import dataclass

from .deck import CARD_VALUES, MODIFIERS_TOTAL, ACTIONS_TOTAL
from .shoe import remaining_count, total_undrawn
from .line import Line, compute_raw_score


@dataclass(frozen=True)
class Buckets:
    r: int
    u: int
    s: int
    m: int
    d: int


def compute_buckets(seen: dict, line: Line) -> Buckets:
    d = total_undrawn(seen)
    r = 0
    u = 0
    s = 0

    for v in CARD_VALUES:
        rem_reg = remaining_count(seen, v, "regular")
        rem_spec = remaining_count(seen, v, "special")

        if v == 7:
            if 7 in line.values:
                r += rem_reg
            else:
                s += rem_reg
            if len(line.values) == 0:
                s += rem_spec
            else:
                u += rem_spec
            continue

        if v == 13:
            if line.has_regular_13:
                r += rem_reg
            else:
                s += rem_reg
            s += rem_spec
            continue

        if v in line.values:
            r += rem_reg + rem_spec
        else:
            s += rem_reg + rem_spec

    m = MODIFIERS_TOTAL + ACTIONS_TOTAL - seen["other"]

    return Buckets(r=r, u=u, s=s, m=m, d=d)


def assert_partition(buckets: Buckets) -> None:
    total = buckets.r + buckets.u + buckets.s + buckets.m
    if total != buckets.d:
        raise AssertionError(
            f"Partition invariant violated: R({buckets.r})+U({buckets.u})+"
            f"S({buckets.s})+M({buckets.m}) = {total} != D({buckets.d})"
        )


def compute_probabilities(buckets: Buckets) -> dict:
    if buckets.d == 0:
        return {"bust": 0.0, "reset": 0.0, "progress": 0.0, "neutral": 0.0}
    return {
        "bust": buckets.r / buckets.d,
        "reset": buckets.u / buckets.d,
        "progress": buckets.s / buckets.d,
        "neutral": buckets.m / buckets.d,
    }


def is_safe_card(line: Line, value: int, kind: str) -> bool:
    if value == 13 and kind == "special":
        return True
    if value == 13 and kind == "regular":
        return not line.has_regular_13
    if value == 7 and kind == "regular":
        return 7 not in line.values
    return value not in line.values


def compute_expected_value(seen: dict, line: Line) -> float:
    d = total_undrawn(seen)
    raw_score = compute_raw_score(line)
    if d == 0:
        return raw_score

    holds_zero = 0 in line.values
    unsuppressed_raw_score = raw_score
    if holds_zero:
        unsuppressed_raw_score = sum(line.values)
        if line.has_regular_13 and line.has_lucky_13:
            unsuppressed_raw_score += 13

    ev = 0.0

    for v in CARD_VALUES:
        for kind in ("regular", "special"):
            rem = remaining_count(seen, v, kind)
            if rem == 0:
                continue

            completes_flip7 = line.card_count + 1 >= 7
            base = unsuppressed_raw_score if (holds_zero and completes_flip7) else raw_score

            if v == 7 and kind == "special":
                if len(line.values) == 0:
                    bonus = 15 if completes_flip7 else 0
                    ev += (rem / d) * (base + 7 + bonus)
                else:
                    ev += (rem / d) * 7
                continue

            if not is_safe_card(line, v, kind):
                continue

            bonus = 15 if completes_flip7 else 0
            ev += (rem / d) * (base + v + bonus)

    m = MODIFIERS_TOTAL + ACTIONS_TOTAL - seen["other"]
    ev += (m / d) * raw_score

    return ev


@dataclass(frozen=True)
class Recommendation:
    buckets: Buckets
    probabilities: dict
    ev: float
    raw_score: int
    action: str


def recommend(seen: dict, line: Line) -> Recommendation:
    buckets = compute_buckets(seen, line)
    assert_partition(buckets)
    probabilities = compute_probabilities(buckets)
    raw_score = compute_raw_score(line)
    if line.busted:
        return Recommendation(buckets=buckets, probabilities=probabilities, ev=0.0, raw_score=raw_score, action="BUSTED")
    ev = compute_expected_value(seen, line)
    action = "HIT" if ev > raw_score else "STAY"
    return Recommendation(buckets=buckets, probabilities=probabilities, ev=ev, raw_score=raw_score, action=action)
