"""North Dakota participation adjustment (ballot_calc/metrics/school_meals.py)."""

from __future__ import annotations

import numpy as np
import pytest

from ballot_calc.measures import MEASURES
from ballot_calc.metrics import compute_measure_year
from ballot_calc.metrics.school_meals import adjust, participation_rates

ND = MEASURES["nd-measure-2"]


def test_registry_inputs_are_complete():
    params = ND.kind_params
    for key in (
        "public_enrollment",
        "cep_students",
        "lunch_meals",
        "breakfast_meals",
        "participating_enrollment",
        "admin_cost_per_biennium",
        "uplift_lunch",
        "uplift_breakfast",
    ):
        assert params[key] is not None, key
    assert 0 < params["uplift_lunch"] < 0.3
    assert 0 < params["uplift_breakfast"] < 0.3


def test_participation_rates_from_meals_served():
    rates = participation_rates(ND.kind_params, 180)
    lunch, breakfast = rates["low"]
    params = ND.kind_params
    assert lunch == pytest.approx(
        params["lunch_meals"] / (180 * params["participating_enrollment"])
    )
    # About two-thirds of students eat lunch and a quarter breakfast.
    assert 0.6 < lunch < 0.72
    assert 0.2 < breakfast < 0.3
    assert rates["high"][0] == pytest.approx(lunch + params["uplift_lunch"])
    assert rates["high"][1] == pytest.approx(breakfast + params["uplift_breakfast"])
    assert rates["low"][0] < rates["central"][0] < rates["high"][0]


def test_rates_are_capped_at_one():
    params = {**ND.kind_params, "uplift_lunch": 5.0, "uplift_breakfast": 5.0}
    rates = participation_rates(params, 180)
    assert rates["high"] == (1.0, 1.0)


def test_adjusted_change_matches_the_formula(passes):
    base, reform = passes("nd-measure-2")
    out = adjust(ND, base, reform)
    params = ND.kind_params
    k12_model = base["p_weight"][base["p_is_k12"]].sum()
    scale = (params["public_enrollment"] - params["cep_students"]) / k12_model
    assert out["metrics"]["enrollment_scale"] == pytest.approx(scale)
    rates = participation_rates(params, 180)
    d_lunch = reform["spm_lunch_value"] - base["spm_lunch_value"]
    d_breakfast = reform["spm_breakfast_value"] - base["spm_breakfast_value"]
    w = base["hh_weight"]
    for case in ("low", "high"):
        r_l, r_b = rates[case]
        expected = (
            w * scale * 180 * base["spm_k12"] * (r_l * d_lunch + r_b * d_breakfast)
        ).sum()
        assert out["metrics"][f"meal_value_change_adjusted_{case}"] == pytest.approx(
            expected
        )
        admin = params["admin_cost_per_biennium"] / 2
        assert out["metrics"][f"state_cost_adjusted_{case}"] == pytest.approx(
            expected + admin
        )
        assert out["metrics"][f"state_cost_biennium_{case}"] == pytest.approx(
            2 * (expected + admin)
        )
    model = (
        w
        * (reform["spm_school_meal_net_subsidy"] - base["spm_school_meal_net_subsidy"])
    ).sum()
    assert out["metrics"]["meal_value_change_model"] == pytest.approx(model)
    # Without the enrollment scale, the adjustment is participation alone.
    assert out["metrics"]["meal_value_change_adjusted_high"] / scale < model


def test_children_newly_free_counts_paid_and_reduced_kids(passes):
    base, reform = passes("nd-measure-2")
    out = adjust(ND, base, reform)
    p_spm = base["p_spm_index"]
    newly = base["p_is_k12"] & (base["spm_lunch_tier"][p_spm] != 0)
    assert out["metrics"]["children_newly_free_model"] == pytest.approx(
        base["p_weight"][newly].sum()
    )


def test_poverty_recomputed_with_the_adjusted_change(passes):
    base, reform = passes("nd-measure-2")
    # Put one family just under the poverty line with a paid-tier child.
    i = int(np.flatnonzero(base["spm_k12"] > 0)[-1])
    for arrays in (base, reform):
        arrays["spm_net_income"][i] = arrays["spm_threshold"][i] - 1.0
    out = adjust(ND, base, reform)
    p_spm = base["p_spm_index"]
    members = p_spm == i
    assert out["poverty_baseline"][members].all()
    assert not out["poverty_reform"][members].any()
    assert out["change"][base["spm_hh_index"][i]] > 1.0


def test_measure_year_uses_the_adjusted_change(passes):
    base, reform = passes("nd-measure-2")
    result = compute_measure_year(ND, 2028, base, reform)
    m = result["metrics"]
    rates = participation_rates(ND.kind_params, 180)
    assert rates["low"][0] < rates["central"][0] < rates["high"][0]
    # Central case lies between the low and high cases.
    assert m["meal_value_change_adjusted_low"] < m["net_income_change_total"]
    assert m["net_income_change_total"] < m["meal_value_change_adjusted_high"]
    admin = ND.kind_params["admin_cost_per_biennium"] / 2
    assert m["state_spending_impact"] == pytest.approx(
        m["net_income_change_total"] + admin
    )
    assert m["state_budget_impact"] == pytest.approx(-m["state_spending_impact"])
    assert result["diagnostics"]["model_net_income_change_total"] == pytest.approx(
        m["meal_value_change_model"]
    )


def test_central_cost_is_the_budget_figure(passes):
    base, reform = passes("nd-measure-2")
    m = compute_measure_year(ND, 2028, base, reform)["metrics"]
    assert m["state_cost_central"] == pytest.approx(-m["state_budget_impact"])
    assert m["state_cost_central"] == pytest.approx(m["state_spending_impact"])
    assert m["state_cost_biennium_central"] == pytest.approx(
        2 * m["state_cost_central"]
    )
    assert m["state_cost_adjusted_low"] <= m["state_cost_central"]
    assert m["state_cost_central"] <= m["state_cost_adjusted_high"]
    assert m["state_cost_biennium_low"] <= m["state_cost_biennium_central"]
    assert m["state_cost_biennium_central"] <= m["state_cost_biennium_high"]
