"""``compute_measure_year`` end to end on synthetic passes for every
measure: complete metrics, guard behaviour, budget signs and kind metrics."""

from __future__ import annotations

import numpy as np
import pytest

from ballot_calc.measures import MEASURES, measure_years
from ballot_calc.metrics import GuardError, compute_measure_year, metric_names
from ballot_calc.states import STATES

# Expected sign of state_budget_impact when each measure passes.
BUDGET_SIGN = {
    "co-amendment-87": +1,
    "co-prop-nn": +1,
    "ca-prop-3": +1,
    "wa-i-645": -1,
    "nd-measure-2": -1,
    "sd-amendment-i": +1,
}


@pytest.mark.parametrize("slug,year", measure_years())
def test_every_measure_year_reduces(passes, slug, year):
    measure = MEASURES[slug]
    base, reform = passes(slug)
    result = compute_measure_year(measure, year, base, reform)
    metrics = result["metrics"]
    assert list(metrics) == list(metric_names(measure.kind))
    assert all(np.isfinite(v) for v in metrics.values())
    assert np.sign(metrics["target_change"]) == measure.target_sign
    assert np.sign(metrics["state_budget_impact"]) == BUDGET_SIGN[slug]
    assert metrics["state_budget_impact"] == pytest.approx(
        metrics["state_revenue_impact"] - metrics["state_spending_impact"]
    )
    assert len(result["deciles"]) == 10
    assert len(result["income_brackets"]) == len(measure.income_bands)
    geo = STATES[measure.state]
    expected_districts = len(geo.district_geoids) if geo.has_districts else 0
    assert len(result["districts"]) == expected_districts
    assert result["guard"]["target_variable"] == measure.target_variable


@pytest.mark.parametrize("slug", sorted(MEASURES))
def test_guard_rejects_a_reform_that_changes_nothing(passes, slug):
    measure = MEASURES[slug]
    base, _ = passes(slug)
    with pytest.raises(GuardError, match="barely moves"):
        compute_measure_year(measure, measure.headline_year, base, base)


def test_guard_rejects_the_wrong_sign(passes):
    measure = MEASURES["wa-i-645"]
    base, reform = passes("wa-i-645")
    # Swap the passes: the tax rises instead of falling.
    with pytest.raises(GuardError, match="wrong way"):
        compute_measure_year(measure, 2028, reform, base)


def test_mismatched_households_raise(passes):
    measure = MEASURES["co-amendment-87"]
    base, reform = passes("co-amendment-87")
    reform["hh_id"] = reform["hh_id"] + 1
    with pytest.raises(RuntimeError, match="different households"):
        compute_measure_year(measure, 2027, base, reform)


def test_wrong_state_raises(passes):
    measure = MEASURES["co-amendment-87"]
    base, reform = passes("ca-prop-3")
    with pytest.raises(RuntimeError, match="state_fips"):
        compute_measure_year(measure, 2027, base, reform)


def test_income_tax_kind_metrics(passes):
    measure = MEASURES["co-amendment-87"]
    base, reform = passes("co-amendment-87")
    metrics = compute_measure_year(measure, 2027, base, reform)["metrics"]
    # Only $1M+ tax units pay more in the synthetic reform.
    assert metrics["revenue_share_agi_1m_plus"] == pytest.approx(1.0)
    assert metrics["tax_units_paying_less"] == 0
    assert metrics["tax_units_paying_more"] > 0
    assert metrics["avg_tax_change_paying_more"] > 0
    w = base["tu_weight"]
    assert metrics["baseline_state_income_tax"] == pytest.approx(
        (w * base["tu_state_tax"]).sum()
    )
    # The household view mirrors the tax change.
    assert metrics["net_income_change_total"] == pytest.approx(
        -metrics["state_revenue_impact"]
    )


def test_tabor_refund_kind_metrics(passes):
    measure = MEASURES["co-prop-nn"]
    base, reform = passes("co-prop-nn")
    metrics = compute_measure_year(measure, 2027, base, reform)["metrics"]
    w = base["tu_weight"]
    recipients = w[base["tu_refund"] > 0].sum()
    assert metrics["refund_recipients_baseline"] == pytest.approx(recipients)
    assert metrics["avg_refund_baseline"] == pytest.approx(86.0)
    assert metrics["refund_total_baseline"] == pytest.approx(
        metrics["state_revenue_impact"]
    )
    assert metrics["losers"] == pytest.approx(recipients)


def test_medicaid_kind_metrics(passes):
    measure = MEASURES["sd-amendment-i"]
    base, reform = passes("sd-amendment-i")
    metrics = compute_measure_year(measure, 2028, base, reform)["metrics"]
    pw = base["p_weight"]
    enrolled = base["p_medicaid_enrolled"]
    level = base["p_medicaid_income_level"]
    assert metrics["people_losing_medicaid"] == pytest.approx(pw[enrolled].sum())
    assert metrics["losing_below_100fpl"] + metrics[
        "losing_100_plus_fpl"
    ] == pytest.approx(metrics["people_losing_medicaid"])
    assert metrics["losing_100_plus_fpl"] == pytest.approx(
        pw[enrolled & (level >= 1)].sum()
    )
    # Everyone at or above 100% FPL gains a premium tax credit; no one below.
    assert metrics["gaining_ptc"] == pytest.approx(metrics["losing_100_plus_fpl"])
    assert metrics["baseline_expansion_enrollees"] == pytest.approx(pw[enrolled].sum())
    assert metrics["medicaid_state_cost_change"] < 0
    assert metrics["medicaid_federal_cost_change"] < 0
    assert metrics["medicaid_cost_change"] == pytest.approx(
        metrics["medicaid_state_cost_change"] + metrics["medicaid_federal_cost_change"]
    )
    assert metrics["ptc_change"] > 0
    # State spending falls by the state Medicaid share; federal spending by
    # the federal share net of new credits.
    assert metrics["state_spending_impact"] == pytest.approx(
        metrics["medicaid_state_cost_change"]
    )
    assert metrics["federal_spending_impact"] == pytest.approx(
        metrics["medicaid_federal_cost_change"] + metrics["ptc_change"]
    )
