"""Reducers every measure shares: pure numpy, no policyengine import.

Inputs are plain arrays for one state (the pipeline simulates state
subsets). Household arrays (``HouseholdArrays``) carry weights, baseline
net income, the net-income change and per-household budget deltas; person
arrays (``PersonArrays``) carry weights, ages and baseline/reform poverty
flags. Every change is (measure passes) - (current law). Budget figures are
signed from the government's side: a positive ``state_budget_impact`` means
the state gains revenue or spends less.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from ..config import CHANGE_THRESHOLD

# Intra-decile groups (app-v2 semantics): relative change in household net
# income, (lower, upper], and the winners_losers.csv column for each.
INTRA_GROUPS = (
    ("lose_more_5pct", -np.inf, -0.05),
    ("lose_less_5pct", -0.05, -1e-3),
    ("no_change", -1e-3, 1e-3),
    ("gain_less_5pct", 1e-3, 0.05),
    ("gain_more_5pct", 0.05, np.inf),
)
INTRA_COLUMNS = tuple(name for name, _, _ in INTRA_GROUPS)

POVERTY_FAMILIES = ("poverty", "child_poverty", "deep_poverty", "deep_child_poverty")
POVERTY_SUFFIXES = ("baseline_rate", "reform_rate", "rate_change", "percent_change")
BUDGET_METRICS = (
    "state_revenue_impact",
    "state_spending_impact",
    "state_budget_impact",
    "federal_revenue_impact",
    "federal_spending_impact",
    "federal_budget_impact",
)

# metrics.csv keys every measure-year carries, in order.
CORE_METRICS: tuple[str, ...] = (
    "households",
    "sample_households",
    "effective_sample_households",
    "affected_sample_households",
    "effective_affected_sample_households",
    "net_income_change_total",
    "avg_household_net_income_change",
    "winners",
    "losers",
    "winners_rate",
    "losers_rate",
    "avg_gain",
    "avg_loss",
    *(
        f"{family}_{suffix}"
        for family in POVERTY_FAMILIES
        for suffix in POVERTY_SUFFIXES
    ),
    "people_lifted_out_of_poverty",
    "people_pushed_into_poverty",
    "children_lifted_out_of_poverty",
    "children_pushed_into_poverty",
    *BUDGET_METRICS,
    "target_change",
)


class GuardError(RuntimeError):
    """The measure's target variable did not move the expected way."""


@dataclass
class HouseholdArrays:
    weight: np.ndarray
    baseline_net_income: np.ndarray
    change: np.ndarray
    people: np.ndarray
    agi: np.ndarray
    geoid: np.ndarray
    state_revenue_delta: np.ndarray
    state_spending_delta: np.ndarray
    federal_revenue_delta: np.ndarray
    federal_spending_delta: np.ndarray

    @property
    def state_budget_delta(self) -> np.ndarray:
        return self.state_revenue_delta - self.state_spending_delta


@dataclass
class PersonArrays:
    weight: np.ndarray
    age: np.ndarray
    poverty_baseline: np.ndarray
    poverty_reform: np.ndarray
    deep_poverty_baseline: np.ndarray
    deep_poverty_reform: np.ndarray


def kish(weights: np.ndarray) -> float:
    """Kish effective sample size: (sum w)^2 / sum w^2."""
    weights = np.asarray(weights, dtype=float)
    if weights.size == 0 or weights.sum() == 0:
        return 0.0
    return float(weights.sum() ** 2 / (weights**2).sum())


def weighted_sum(values, weights, mask=None) -> float:
    values = np.asarray(values, dtype=float)
    weights = np.asarray(weights, dtype=float)
    if mask is None:
        return float((values * weights).sum())
    return float((values[mask] * weights[mask]).sum())


def _ratio(numerator: float, denominator: float) -> float:
    return numerator / denominator if denominator else 0.0


def weighted_deciles(values: np.ndarray, weights: np.ndarray) -> np.ndarray:
    """Assign within-state deciles (1..10) of ``values`` by weight."""
    values = np.asarray(values, dtype=float)
    sorter = np.argsort(values, kind="stable")
    cumulative = np.cumsum(np.asarray(weights, dtype=float)[sorter])
    bounds = np.interp(
        [cumulative[-1] * q / 10 for q in range(1, 10)], cumulative, values[sorter]
    )
    return np.digitize(values, bounds) + 1


def check_target(
    change: float,
    baseline_total: float,
    sign: int,
    label: str,
    rel_tol: float = 1e-3,
    abs_tol: float = 1.0,
) -> None:
    """Raise ``GuardError`` unless the target moved by a non-trivial amount
    in the expected direction. Catches stale pins, wrong parameter paths and
    overrides that start after the scored year."""
    if not np.isfinite(change):
        raise GuardError(f"{label}: target change is not finite ({change}).")
    floor = max(abs_tol, rel_tol * abs(baseline_total))
    if abs(change) < floor:
        raise GuardError(
            f"{label}: target barely moves (change {change:,.2f}; baseline total "
            f"{baseline_total:,.2f}; floor {floor:,.2f}). Check the pin, the "
            "parameter paths and the override start dates."
        )
    if np.sign(change) != sign:
        raise GuardError(
            f"{label}: target moves the wrong way (change {change:,.2f}, "
            f"expected sign {sign:+d})."
        )


def poverty_metrics(persons: PersonArrays) -> dict:
    """Rates in percent; rate changes in percentage points; percent changes
    relative to the baseline rate. Negative changes mean poverty falls."""
    w = np.asarray(persons.weight, dtype=float)
    is_child = np.asarray(persons.age) < 18
    everyone = np.ones_like(is_child, dtype=bool)

    def rate(flag, mask):
        return 100 * _ratio(float(w[mask & flag].sum()), float(w[mask].sum()))

    out = {}
    for family, base, reform, mask in (
        ("poverty", persons.poverty_baseline, persons.poverty_reform, everyone),
        ("child_poverty", persons.poverty_baseline, persons.poverty_reform, is_child),
        (
            "deep_poverty",
            persons.deep_poverty_baseline,
            persons.deep_poverty_reform,
            everyone,
        ),
        (
            "deep_child_poverty",
            persons.deep_poverty_baseline,
            persons.deep_poverty_reform,
            is_child,
        ),
    ):
        base = np.asarray(base, dtype=bool)
        reform = np.asarray(reform, dtype=bool)
        base_rate, reform_rate = rate(base, mask), rate(reform, mask)
        out[f"{family}_baseline_rate"] = base_rate
        out[f"{family}_reform_rate"] = reform_rate
        out[f"{family}_rate_change"] = reform_rate - base_rate
        out[f"{family}_percent_change"] = 100 * _ratio(
            reform_rate - base_rate, base_rate
        )
    base = np.asarray(persons.poverty_baseline, dtype=bool)
    reform = np.asarray(persons.poverty_reform, dtype=bool)
    lifted = base & ~reform
    out["people_lifted_out_of_poverty"] = float(w[lifted].sum())
    out["people_pushed_into_poverty"] = float(w[~base & reform].sum())
    out["children_lifted_out_of_poverty"] = float(w[lifted & is_child].sum())
    out["children_pushed_into_poverty"] = float(w[~base & reform & is_child].sum())
    return out


def budget_metrics(hh: HouseholdArrays, extra_state_spending: float = 0.0) -> dict:
    """``extra_state_spending`` is a statewide cost not attributed to
    households (e.g. administration)."""
    w = hh.weight
    state_revenue = weighted_sum(hh.state_revenue_delta, w)
    state_spending = weighted_sum(hh.state_spending_delta, w) + extra_state_spending
    federal_revenue = weighted_sum(hh.federal_revenue_delta, w)
    federal_spending = weighted_sum(hh.federal_spending_delta, w)
    return {
        "state_revenue_impact": state_revenue,
        "state_spending_impact": state_spending,
        "state_budget_impact": state_revenue - state_spending,
        "federal_revenue_impact": federal_revenue,
        "federal_spending_impact": federal_spending,
        "federal_budget_impact": federal_revenue - federal_spending,
    }


def household_metrics(hh: HouseholdArrays, threshold: float = CHANGE_THRESHOLD) -> dict:
    w = np.asarray(hh.weight, dtype=float)
    change = np.asarray(hh.change, dtype=float)
    total = float(w.sum())
    gain = change > threshold
    lose = change < -threshold
    affected = gain | lose
    winners = float(w[gain].sum())
    losers = float(w[lose].sum())
    return {
        "households": total,
        "sample_households": float(len(w)),
        "effective_sample_households": kish(w),
        "affected_sample_households": float(affected.sum()),
        "effective_affected_sample_households": kish(w[affected]),
        "net_income_change_total": weighted_sum(change, w),
        "avg_household_net_income_change": _ratio(weighted_sum(change, w), total),
        "winners": winners,
        "losers": losers,
        "winners_rate": 100 * _ratio(winners, total),
        "losers_rate": 100 * _ratio(losers, total),
        "avg_gain": _ratio(weighted_sum(change, w, gain), winners),
        "avg_loss": _ratio(weighted_sum(change, w, lose), losers),
    }


def decile_tables(hh: HouseholdArrays) -> tuple[list[dict], dict]:
    """Average and relative change by within-state decile of baseline
    household net income, and the person-weighted intra-decile shares."""
    w = np.asarray(hh.weight, dtype=float)
    baseline = np.asarray(hh.baseline_net_income, dtype=float)
    change = np.asarray(hh.change, dtype=float)
    decile = weighted_deciles(baseline, w)
    # Relative to the decile's net income with negative incomes counted as
    # zero: a few large business losses can make the bottom decile's summed
    # net income negative, which would flip the sign of its change.
    nonnegative = np.maximum(baseline, 0)
    rows = []
    for d in range(1, 11):
        mask = decile == d
        count = float(w[mask].sum())
        total_change = weighted_sum(change, w, mask)
        rows.append(
            {
                "decile": d,
                "average_change": _ratio(total_change, count),
                "relative_change": _ratio(
                    total_change, weighted_sum(nonnegative, w, mask)
                ),
            }
        )
    relative = change / np.maximum(baseline, 1)
    people = np.asarray(hh.people, dtype=float) * w
    deciles = {name: [] for name in INTRA_COLUMNS}
    for d in range(1, 11):
        mask = decile == d
        d_people = people[mask]
        d_total = float(d_people.sum())
        d_relative = relative[mask]
        for name, lower, upper in INTRA_GROUPS:
            in_group = (d_relative > lower) & (d_relative <= upper)
            deciles[name].append(_ratio(float(d_people[in_group].sum()), d_total))
    intra = {
        "all": {name: sum(deciles[name]) / 10 for name in INTRA_COLUMNS},
        "deciles": deciles,
    }
    return rows, intra


def income_band_table(
    hh: HouseholdArrays, bands, threshold: float = CHANGE_THRESHOLD
) -> list[dict]:
    """Households by household AGI band (``bands`` = (low, high, label);
    low <= AGI < high)."""
    w = np.asarray(hh.weight, dtype=float)
    change = np.asarray(hh.change, dtype=float)
    agi = np.asarray(hh.agi, dtype=float)
    budget = hh.state_budget_delta
    rows = []
    for low, high, label in bands:
        band = (agi >= low) & (agi < high)
        count = float(w[band].sum())
        total = weighted_sum(change, w, band)
        rows.append(
            {
                "bracket": label,
                "households": count,
                "winners": float(w[band & (change > threshold)].sum()),
                "losers": float(w[band & (change < -threshold)].sum()),
                "total_change": total,
                "average_change": _ratio(total, count),
                "state_budget_impact": weighted_sum(budget, w, band),
            }
        )
    return rows


def district_table(
    hh: HouseholdArrays, geo, threshold: float = CHANGE_THRESHOLD
) -> list:
    """One row per congressional district (empty for at-large states)."""
    if not geo.has_districts:
        return []
    w = np.asarray(hh.weight, dtype=float)
    change = np.asarray(hh.change, dtype=float)
    baseline = np.asarray(hh.baseline_net_income, dtype=float)
    geoid = np.asarray(hh.geoid)
    budget = hh.state_budget_delta
    rows = []
    for district in geo.district_geoids:
        mask = geoid == district
        count = float(w[mask].sum())
        avg_change = _ratio(weighted_sum(change, w, mask), count)
        avg_baseline = _ratio(weighted_sum(baseline, w, mask), count)
        rows.append(
            {
                "district": geo.district_label(district),
                "households": count,
                "average_household_income_change": avg_change,
                "relative_household_income_change": _ratio(avg_change, avg_baseline)
                if avg_baseline > 0
                else 0.0,
                "winners_share": _ratio(
                    float(w[mask & (change > threshold)].sum()), count
                ),
                "losers_share": _ratio(
                    float(w[mask & (change < -threshold)].sum()), count
                ),
                "state_budget_impact": weighted_sum(budget, w, mask),
            }
        )
    return rows


def core_results(
    hh: HouseholdArrays,
    persons: PersonArrays,
    *,
    bands,
    geo,
    extra_state_spending: float = 0.0,
) -> dict:
    """Metrics, deciles, intra-decile shares, AGI bands and districts."""
    metrics = {
        **household_metrics(hh),
        **poverty_metrics(persons),
        **budget_metrics(hh, extra_state_spending),
    }
    deciles, intra = decile_tables(hh)
    return {
        "metrics": metrics,
        "deciles": deciles,
        "intra_decile": intra,
        "income_brackets": income_band_table(hh, bands),
        "districts": district_table(hh, geo),
    }
