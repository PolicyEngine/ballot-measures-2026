"""``compute_measure_year`` end to end on synthetic passes for every
measure: complete metrics, guard behaviour, budget signs, kind metrics, the
South Dakota enrollment calibration and the SOI coverage metrics."""

from __future__ import annotations

import numpy as np
import pytest

from ballot_calc.measures import MEASURES, measure_years
from ballot_calc.metrics import (
    SPM_RESOURCES_ADD_OMITTED_INCOME,
    GuardError,
    compute_measure_year,
    metric_names,
)
from ballot_calc.metrics.medicaid import CALIBRATED
from ballot_calc.metrics.top_tail import SOI
from ballot_calc.states import STATES
from tests.conftest import reduce_synthetic, synthetic_filers, synthetic_passes

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
def test_every_measure_year_reduces(slug, year):
    measure = MEASURES[slug]
    result = reduce_synthetic(slug, year)
    metrics = result["metrics"]
    assert list(metrics) == list(metric_names(measure.kind))
    assert all(np.isfinite(v) for v in metrics.values())
    assert np.sign(metrics["target_change"]) == measure.target_sign
    assert np.sign(metrics["state_budget_impact"]) == BUDGET_SIGN[slug]
    assert metrics["state_budget_impact"] == pytest.approx(
        metrics["state_revenue_impact"] - metrics["state_spending_impact"]
    )
    assert metrics["children_pushed_into_poverty"] >= 0
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
    filers = synthetic_filers(measure.state) if measure.kind == "income_tax" else None
    with pytest.raises(GuardError, match="barely moves"):
        compute_measure_year(measure, measure.headline_year, base, base, filers=filers)


def test_guard_rejects_the_wrong_sign(passes):
    measure = MEASURES["wa-i-645"]
    base, reform = passes("wa-i-645")
    # Swap the passes: the tax rises instead of falling.
    with pytest.raises(GuardError, match="wrong way"):
        compute_measure_year(measure, 2028, reform, base, filers=synthetic_filers("WA"))


def test_income_tax_needs_filers(passes):
    base, reform = passes("ca-prop-3")
    with pytest.raises(RuntimeError, match="filers"):
        compute_measure_year(MEASURES["ca-prop-3"], 2031, base, reform)


def test_mismatched_households_raise(passes):
    measure = MEASURES["co-amendment-87"]
    base, reform = passes("co-amendment-87")
    reform["hh_id"] = reform["hh_id"] + 1
    with pytest.raises(RuntimeError, match="different households"):
        compute_measure_year(measure, 2027, base, reform, filers=synthetic_filers("CO"))


def test_wrong_state_raises(passes):
    measure = MEASURES["co-amendment-87"]
    base, reform = passes("ca-prop-3")
    with pytest.raises(RuntimeError, match="state_fips"):
        compute_measure_year(measure, 2027, base, reform, filers=synthetic_filers("CO"))


def test_income_tax_kind_metrics(passes):
    base, _ = passes("co-amendment-87")
    metrics = reduce_synthetic("co-amendment-87", 2027)["metrics"]
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


@pytest.mark.parametrize("slug,year", [("co-amendment-87", 2027), ("wa-i-645", 2028)])
def test_soi_coverage_metrics(slug, year):
    measure = MEASURES[slug]
    metrics = reduce_synthetic(slug, year)["metrics"]
    # synthetic_filers has 2x SOI's $1M+ returns and half its income above $1M.
    assert metrics["soi_coverage_returns_1m_plus"] == pytest.approx(2.0)
    assert metrics["soi_coverage_agi_above_1m"] == pytest.approx(0.5)
    # Every synthetic change is above $1M and equals the top-rate change on
    # income above $1M (scaled x2) except what is paid at the threshold.
    assert np.sign(metrics["revenue_coverage_scaled"]) == measure.target_sign
    assert abs(metrics["revenue_coverage_scaled"]) > abs(
        metrics["state_revenue_impact"]
    )
    assert set(SOI) >= {measure.state}


def test_tabor_refund_kind_metrics(passes):
    base, _ = passes("co-prop-nn")
    metrics = reduce_synthetic("co-prop-nn", 2027)["metrics"]
    w = base["tu_weight"]
    recipients = w[base["tu_refund"] > 0].sum()
    assert metrics["refund_recipients_baseline"] == pytest.approx(recipients)
    assert metrics["avg_refund_baseline"] == pytest.approx(86.0)
    assert metrics["refund_total_baseline"] == pytest.approx(
        metrics["state_revenue_impact"]
    )
    assert metrics["losers"] == pytest.approx(recipients)


def test_medicaid_kind_metrics_and_calibration(passes):
    measure = MEASURES["sd-amendment-i"]
    base, _ = passes("sd-amendment-i")
    metrics = reduce_synthetic("sd-amendment-i", 2028)["metrics"]
    pw = base["p_weight"]
    enrolled = base["p_medicaid_enrolled"]
    level = base["p_medicaid_income_level"]
    # Model (unscaled) values.
    model_losing = pw[enrolled].sum()
    assert metrics["people_losing_medicaid_model"] == pytest.approx(model_losing)
    assert metrics["baseline_expansion_enrollees"] == pytest.approx(model_losing)
    assert metrics["losing_100_plus_fpl_model"] == pytest.approx(
        pw[enrolled & (level >= 1)].sum()
    )
    # Calibration to administrative enrollment.
    admin = measure.kind_params["admin_expansion_enrollees"]
    factor = admin / model_losing
    assert metrics["admin_expansion_enrollees"] == admin
    assert metrics["enrollment_calibration_factor"] == pytest.approx(factor)
    for name in CALIBRATED:
        assert metrics[name] == pytest.approx(metrics[f"{name}_model"] * factor)
    # Everyone in the expansion group loses it, so the calibrated count is
    # the administrative enrollment.
    assert metrics["people_losing_medicaid"] == pytest.approx(admin)
    assert metrics["losing_below_100fpl"] + metrics["losing_100_plus_fpl"] == (
        pytest.approx(metrics["people_losing_medicaid"])
    )
    # Everyone at or above 100% FPL gains a premium tax credit; no one below.
    assert metrics["gaining_ptc"] == pytest.approx(metrics["losing_100_plus_fpl"])
    assert metrics["medicaid_state_cost_change"] < 0
    assert metrics["medicaid_federal_cost_change"] < 0
    assert metrics["medicaid_cost_change"] == pytest.approx(
        metrics["medicaid_state_cost_change"] + metrics["medicaid_federal_cost_change"]
    )
    assert metrics["ptc_change"] > 0
    # State spending falls by the state Medicaid share; federal spending by
    # the federal share net of new credits (both calibrated).
    assert metrics["state_spending_impact"] == pytest.approx(
        metrics["medicaid_state_cost_change"]
    )
    assert metrics["federal_spending_impact"] == pytest.approx(
        metrics["medicaid_federal_cost_change"] + metrics["ptc_change"]
    )
    assert metrics["state_budget_impact"] == pytest.approx(
        metrics["state_revenue_impact"] - metrics["state_spending_impact"]
    )
    # Household distribution metrics are not scaled.
    assert metrics["losers"] == pytest.approx(
        base["hh_weight"][np.bincount(base["p_hh_index"], weights=enrolled) > 0].sum()
    )


def test_calibration_needs_model_enrollees():
    from ballot_calc.metrics.medicaid import calibrate

    with pytest.raises(RuntimeError, match="expansion enrollees"):
        calibrate(
            {"baseline_expansion_enrollees": 0.0}, {"admin_expansion_enrollees": 1}
        )


def test_children_pushed_into_poverty(passes):
    measure = MEASURES["co-prop-nn"]
    base, reform = passes("co-prop-nn")
    # A family with a child just above the line loses its refund.
    i = int(np.flatnonzero((base["hh_people"] == 2) & (base["tu_refund"] > 0))[3])
    for arrays, extra in ((base, 50.0), (reform, -36.0)):
        arrays["spm_net_income"][i] = arrays["spm_threshold"][i] + extra
    p_spm = base["p_spm_index"]
    for arrays in (base, reform):
        arrays["p_in_poverty"] = (arrays["spm_net_income"] < arrays["spm_threshold"])[
            p_spm
        ]
    metrics = compute_measure_year(measure, 2027, base, reform)["metrics"]
    members = p_spm == i
    child = members & (base["p_age"] < 18)
    assert metrics["children_pushed_into_poverty"] == pytest.approx(
        base["p_weight"][child].sum()
    )
    assert metrics["people_pushed_into_poverty"] >= base["p_weight"][members].sum()


@pytest.mark.parametrize(
    "slug,year,flip",
    [("wa-i-645", 2028, "lifted"), ("co-amendment-87", 2027, "pushed_deep")],
)
def test_omitted_income_is_added_back(slug, year, flip):
    """Top-income households whose SPM resources omit partnership income
    cross the line on the model's own resources; with the income added back
    (the published metrics) none of them do."""
    assert SPM_RESOURCES_ADD_OMITTED_INCOME is True
    result = reduce_synthetic(slug, year)
    metrics = result["metrics"]
    model = result["diagnostics"]["poverty_model_spm_resources"]
    added = result["diagnostics"]["poverty_with_omitted_income"]
    assert result["diagnostics"]["spm_resources_add_omitted_income"] is True
    for key, value in added.items():
        assert metrics[key] == pytest.approx(value)
    if flip == "lifted":
        assert model["people_lifted_out_of_poverty"] > 0
        assert metrics["people_lifted_out_of_poverty"] == 0
    else:
        assert model["deep_poverty_rate_change"] > 0
        assert metrics["deep_poverty_rate_change"] == 0
    assert metrics["poverty_baseline_rate"] < model["poverty_baseline_rate"]


@pytest.mark.parametrize("slug,year", measure_years())
def test_add_back_applies_to_baseline_and_reform(slug, year):
    """The same per-SPM-unit income is added to resources in both
    simulations: poverty is recomputed from each pass's own SPM net income
    plus the current-law omitted income, against the same thresholds."""
    measure = MEASURES[slug]
    base, reform = synthetic_passes(slug)
    result = reduce_synthetic(slug, year)
    added = base["spm_omitted_market_income"]
    assert added.max() > 0
    if measure.kind == "school_meals":
        # ND recomputes poverty from current-law resources plus the
        # participation-adjusted meal value; the add-back is in both.
        from ballot_calc.metrics.school_meals import adjust

        flags = adjust(measure, base, reform, extra_resources=added)
        resources = base["spm_net_income"] + added
        p_spm = base["p_spm_index"]
        assert np.array_equal(
            flags["poverty_baseline"], (resources < base["spm_threshold"])[p_spm]
        )
        hh_change = flags["change"]
        assert (flags["poverty_reform"] <= flags["poverty_baseline"]).all()
        assert hh_change.sum() > 0
        return
    p_spm = base["p_spm_index"]
    w = base["p_weight"]
    for policy, arrays in (("baseline", base), ("reform", reform)):
        poor = ((arrays["spm_net_income"] + added) < base["spm_threshold"])[p_spm]
        assert result["metrics"][f"poverty_{policy}_rate"] == pytest.approx(
            100 * w[poor].sum() / w.sum()
        )


def test_add_back_uses_one_array_for_both_passes(passes):
    """The omitted income is model input; passes that disagree on it fail."""
    measure = MEASURES["ca-prop-3"]
    base, reform = passes("ca-prop-3")
    reform["spm_omitted_market_income"] = reform["spm_omitted_market_income"] + 1.0
    with pytest.raises(RuntimeError, match="differs between passes"):
        compute_measure_year(measure, 2031, base, reform, filers=synthetic_filers("CA"))


def test_adjustment_record():
    from ballot_calc.metrics import SPM_RESOURCES_ADJUSTMENT

    assert SPM_RESOURCES_ADJUSTMENT["applied"] is True
    assert SPM_RESOURCES_ADJUSTMENT["added_to_spm_resources"] == [
        "partnership_s_corp_income",
        "farm_rent_income",
        "ak_permanent_fund_dividend",
    ]
    assert SPM_RESOURCES_ADJUSTMENT["not_added"] == ["debt_relief"]
