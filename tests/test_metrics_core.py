"""Core reducers (ballot_calc/metrics/core.py) on small synthetic arrays."""

from __future__ import annotations

import numpy as np
import pytest

from ballot_calc.measures import LOW_INCOME_BANDS
from ballot_calc.metrics.core import (
    CORE_METRICS,
    INTRA_COLUMNS,
    GuardError,
    HouseholdArrays,
    PersonArrays,
    budget_metrics,
    check_target,
    core_results,
    decile_tables,
    district_table,
    household_metrics,
    income_band_table,
    kish,
    poverty_metrics,
    weighted_deciles,
)
from ballot_calc.states import STATES


def _households(change, weight=None, revenue=None, spending=None, n_geo=8):
    change = np.asarray(change, dtype=float)
    n = len(change)
    weight = np.ones(n) if weight is None else np.asarray(weight, dtype=float)
    zeros = np.zeros(n)
    return HouseholdArrays(
        weight=weight,
        baseline_net_income=np.linspace(10_000, 200_000, n),
        change=change,
        people=np.full(n, 2.0),
        agi=np.linspace(0, 400_000, n),
        geoid=np.array([801 + i % n_geo for i in range(n)]),
        state_revenue_delta=zeros if revenue is None else np.asarray(revenue, float),
        state_spending_delta=zeros if spending is None else np.asarray(spending, float),
        federal_revenue_delta=zeros,
        federal_spending_delta=zeros,
    )


def test_kish_equal_weights_is_the_count():
    assert kish(np.full(50, 3.0)) == pytest.approx(50)
    assert kish(np.array([1.0, 0.0, 0.0])) == pytest.approx(1)
    assert kish(np.array([])) == 0.0


def test_weighted_deciles_split_weight_evenly():
    values = np.arange(1000, dtype=float)
    weights = np.ones(1000)
    deciles = weighted_deciles(values, weights)
    assert set(deciles) == set(range(1, 11))
    for d in range(1, 11):
        assert (deciles == d).sum() == pytest.approx(100, abs=1)
    # Deciles rise with income.
    assert deciles[0] == 1 and deciles[-1] == 10


def test_weighted_deciles_respect_weights():
    # The top household carries half the weight, so it spans deciles 6-10
    # and is assigned the top decile; the rest share the bottom half.
    values = np.array([1.0, 2.0, 3.0, 4.0, 5.0, 100.0])
    weights = np.array([1, 1, 1, 1, 1, 5], dtype=float)
    deciles = weighted_deciles(values, weights)
    assert deciles[-1] == 10
    assert (deciles[:-1] <= 6).all()
    assert (np.diff(deciles) >= 0).all()


def test_winners_and_losers_use_the_one_dollar_threshold():
    hh = _households([5.0, 0.5, -0.5, -20.0], weight=[1, 2, 3, 4])
    m = household_metrics(hh)
    assert m["winners"] == 1
    assert m["losers"] == 4
    assert m["winners_rate"] == pytest.approx(10.0)
    assert m["losers_rate"] == pytest.approx(40.0)
    assert m["avg_gain"] == pytest.approx(5.0)
    assert m["avg_loss"] == pytest.approx(-20.0)
    assert m["affected_sample_households"] == 2
    assert m["effective_affected_sample_households"] == pytest.approx(
        kish(np.array([1, 4]))
    )
    assert m["net_income_change_total"] == pytest.approx(5 + 1 - 1.5 - 80)
    assert m["avg_household_net_income_change"] == pytest.approx(
        (5 + 1 - 1.5 - 80) / 10
    )


def test_poverty_rates_and_counts():
    persons = PersonArrays(
        weight=np.array([1.0, 1.0, 2.0, 2.0]),
        age=np.array([40.0, 10.0, 40.0, 10.0]),
        poverty_baseline=np.array([True, True, False, False]),
        poverty_reform=np.array([False, True, False, True]),
        deep_poverty_baseline=np.array([True, False, False, False]),
        deep_poverty_reform=np.array([False, False, False, False]),
    )
    m = poverty_metrics(persons)
    assert m["poverty_baseline_rate"] == pytest.approx(100 * 2 / 6)
    assert m["poverty_reform_rate"] == pytest.approx(100 * 3 / 6)
    assert m["poverty_rate_change"] == pytest.approx(100 / 6)
    assert m["poverty_percent_change"] == pytest.approx(50.0)
    assert m["child_poverty_baseline_rate"] == pytest.approx(100 / 3)
    assert m["child_poverty_reform_rate"] == pytest.approx(100.0)
    assert m["deep_poverty_reform_rate"] == 0
    assert m["deep_poverty_percent_change"] == pytest.approx(-100.0)
    assert m["deep_child_poverty_percent_change"] == 0  # baseline rate 0
    assert m["people_lifted_out_of_poverty"] == 1
    assert m["people_pushed_into_poverty"] == 2
    assert m["children_lifted_out_of_poverty"] == 0


def test_budget_signs():
    # Revenue up 10 per household, spending up 3: the state gains 7 each.
    hh = _households([0, 0], revenue=[10, 10], spending=[3, 3])
    m = budget_metrics(hh, extra_state_spending=4)
    assert m["state_revenue_impact"] == 20
    assert m["state_spending_impact"] == 10
    assert m["state_budget_impact"] == 10
    assert m["federal_budget_impact"] == 0


@pytest.mark.parametrize(
    "change,baseline,sign,match",
    [
        (0.0, 1e9, +1, "barely moves"),
        (5e5, 1e9, +1, "barely moves"),  # below 0.1% of the baseline
        (0.5, 0.0, -1, "barely moves"),
        (-2e8, 1e9, +1, "wrong way"),
        (float("nan"), 1e9, +1, "not finite"),
    ],
)
def test_guard_rejects(change, baseline, sign, match):
    with pytest.raises(GuardError, match=match):
        check_target(change, baseline, sign, "test")


def test_guard_accepts_a_real_move():
    check_target(2e8, 1e9, +1, "test")
    check_target(-30_000, 140_000, -1, "test")


def test_intra_decile_shares_sum_to_one():
    rng = np.random.default_rng(1)
    hh = _households(rng.normal(0, 3_000, 500), weight=rng.uniform(1, 5, 500))
    rows, intra = decile_tables(hh)
    assert [r["decile"] for r in rows] == list(range(1, 11))
    for i in range(10):
        assert sum(intra["deciles"][c][i] for c in INTRA_COLUMNS) == pytest.approx(1.0)
    assert sum(intra["all"].values()) == pytest.approx(1.0)


def test_relative_change_by_decile():
    hh = _households(np.full(100, 100.0))
    rows, _ = decile_tables(hh)
    for row in rows:
        assert row["average_change"] == pytest.approx(100.0)
        assert row["relative_change"] > 0


def test_negative_incomes_do_not_flip_the_relative_change():
    hh = _households(np.full(100, 10.0))
    # One huge business loss in the bottom decile.
    hh.baseline_net_income[0] = -10_000_000
    rows, _ = decile_tables(hh)
    assert rows[0]["average_change"] > 0
    assert rows[0]["relative_change"] > 0


def test_income_bands_cover_every_household():
    hh = _households(np.full(50, 10.0), revenue=np.full(50, -1.0))
    rows = income_band_table(hh, LOW_INCOME_BANDS)
    assert sum(r["households"] for r in rows) == pytest.approx(50)
    assert sum(r["total_change"] for r in rows) == pytest.approx(500)
    assert sum(r["state_budget_impact"] for r in rows) == pytest.approx(-50)
    assert [r["bracket"] for r in rows] == [label for _, _, label in LOW_INCOME_BANDS]


def test_districts_only_for_district_states():
    hh = _households(np.full(80, 10.0), revenue=np.full(80, 2.0))
    co = district_table(hh, STATES["CO"])
    assert [r["district"] for r in co] == [f"CO-0{i}" for i in range(1, 9)]
    assert sum(r["households"] for r in co) == pytest.approx(80)
    assert all(r["winners_share"] == pytest.approx(1.0) for r in co)
    assert sum(r["state_budget_impact"] for r in co) == pytest.approx(160)
    assert district_table(hh, STATES["ND"]) == []


def test_core_results_carry_every_core_metric_but_target():
    hh = _households(np.full(40, 1.5))
    persons = PersonArrays(
        weight=np.ones(4),
        age=np.array([30.0, 5.0, 30.0, 5.0]),
        poverty_baseline=np.zeros(4, bool),
        poverty_reform=np.zeros(4, bool),
        deep_poverty_baseline=np.zeros(4, bool),
        deep_poverty_reform=np.zeros(4, bool),
    )
    result = core_results(hh, persons, bands=LOW_INCOME_BANDS, geo=STATES["CO"])
    assert set(CORE_METRICS) - set(result["metrics"]) == {"target_change"}
