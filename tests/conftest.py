"""Shared fixtures: synthetic pass arrays shaped like ``run_pass`` output.

The fast tests never import policyengine. ``synthetic_passes(slug)`` builds
baseline and reform array dicts for one measure with the same keys
``ballot_calc.passes.run_pass`` saves, from a small made-up state
population: one SPM unit and one tax unit per household, each household an
adult plus (for every other household) a school-age child.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from ballot_calc.measures import MEASURES
from ballot_calc.metrics import compute_measure_year
from ballot_calc.metrics.top_tail import SOI, tabulate
from ballot_calc.passes import SCHOOL_MEAL_TIER_CODES
from ballot_calc.states import STATES

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "frontend" / "public" / "data"

FREE, REDUCED, PAID = (SCHOOL_MEAL_TIER_CODES[t] for t in ("FREE", "REDUCED", "PAID"))
LUNCH_VALUE = {FREE: 4.31, REDUCED: 3.91, PAID: 0.0}
BREAKFAST_VALUE = {FREE: 2.12, REDUCED: 1.82, PAID: 0.0}
THRESHOLD = 30_000.0


def _population(state: str, n: int = 400, seed: int = 0) -> dict:
    rng = np.random.default_rng(seed)
    geo = STATES[state]
    hh_weight = rng.uniform(50, 150, n)
    # Incomes from $5k to $3M so every band and decile is populated.
    agi = np.geomspace(5_000, 3_000_000, n)
    net = 0.8 * agi
    has_child = np.arange(n) % 2 == 0
    p_hh = np.concatenate([np.arange(n), np.flatnonzero(has_child)])
    order = np.argsort(p_hh, kind="stable")
    p_hh = p_hh[order]
    p_age = np.concatenate([np.full(n, 40.0), np.full(has_child.sum(), 10.0)])[order]
    geoids = np.array(geo.district_geoids)[np.arange(n) % len(geo.district_geoids)]
    return {
        "hh_id": np.arange(n) + 1,
        "hh_weight": hh_weight,
        "hh_net_income": net,
        "hh_people": 1.0 + has_child,
        "hh_agi": agi,
        "hh_state_fips": np.full(n, geo.fips),
        "hh_cd_geoid": geoids,
        "p_hh_index": p_hh,
        "p_spm_index": p_hh.copy(),
        "p_tu_index": p_hh.copy(),
        "p_weight": hh_weight[p_hh],
        "p_age": p_age,
        "spm_hh_index": np.arange(n),
        "spm_threshold": np.full(n, THRESHOLD),
        "spm_deep_threshold": np.full(n, THRESHOLD / 2),
        "tu_weight": hh_weight.copy(),
        "tu_agi": agi.copy(),
    }


def _finish(arrays: dict) -> dict:
    """Derive the SPM and poverty arrays from household net income.

    SPM resources leave out partnership income, as policyengine-us 2.60.4
    does: households above $2M of AGI hold all but $29,000 of their
    current-law net income as partnership income, which the SPM arrays omit
    (``spm_omitted_market_income``), so they look poor (threshold $30,000).
    """
    omitted = np.where(
        arrays["hh_agi"] > 2_000_000, 0.8 * arrays["hh_agi"] - 29_000.0, 0.0
    )
    arrays["spm_omitted_market_income"] = omitted
    arrays["spm_net_income"] = arrays["hh_net_income"] - omitted
    spm = arrays["p_spm_index"]
    arrays["p_in_poverty"] = (arrays["spm_net_income"] < arrays["spm_threshold"])[spm]
    arrays["p_in_deep_poverty"] = (
        arrays["spm_net_income"] < arrays["spm_deep_threshold"]
    )[spm]
    return arrays


def synthetic_passes(slug: str, seed: int = 0) -> tuple[dict, dict]:
    """(baseline, reform) arrays for ``slug`` with a plausible effect."""
    measure = MEASURES[slug]
    base = _population(measure.state, seed=seed)
    n = len(base["hh_id"])
    zeros = np.zeros(n)
    for variable in (
        measure.state_revenue_variables
        + measure.state_spending_variables
        + measure.federal_revenue_variables
        + measure.federal_spending_variables
        + (measure.target_variable,)
    ):
        base[f"hh__{variable}"] = zeros.copy()
    reform = {k: v.copy() for k, v in base.items()}
    agi = base["hh_agi"]

    if measure.kind == "income_tax":
        base_tax = 0.05 * agi
        extra = np.where(agi > 1_000_000, 0.03 * (agi - 1_000_000), 0.0)
        reform_tax = base_tax + measure.target_sign * extra
        base["tu_state_tax"], reform["tu_state_tax"] = base_tax, reform_tax
        base[f"hh__{measure.target_variable}"] = base_tax
        reform[f"hh__{measure.target_variable}"] = reform_tax
        reform["hh_net_income"] = base["hh_net_income"] - (reform_tax - base_tax)
    elif measure.kind == "tabor_refund":
        refund = np.where(agi < 500_000, 86.0, 0.0)
        base["tu_refund"], reform["tu_refund"] = refund, np.zeros(n)
        base["hh__co_sales_tax_refund"] = refund
        reform["hh__co_sales_tax_refund"] = np.zeros(n)
        base["hh__co_income_tax"] = 0.044 * agi - refund
        reform["hh__co_income_tax"] = 0.044 * agi
        reform["hh_net_income"] = base["hh_net_income"] - refund
    elif measure.kind == "school_meals":
        k12 = (base["p_age"] >= 5) & (base["p_age"] <= 17)
        base["p_is_k12"] = reform["p_is_k12"] = k12
        spm_k12 = np.bincount(
            base["p_spm_index"], weights=k12.astype(float), minlength=n
        )
        base["spm_k12"] = reform["spm_k12"] = spm_k12
        income = base["hh_net_income"]
        tier = np.where(income < 35_000, FREE, np.where(income < 50_000, REDUCED, PAID))
        base["spm_lunch_tier"] = base["spm_breakfast_tier"] = tier
        reform["spm_lunch_tier"] = reform["spm_breakfast_tier"] = np.full(n, FREE)
        for arrays, tiers in ((base, tier), (reform, np.full(n, FREE))):
            arrays["spm_lunch_value"] = np.vectorize(LUNCH_VALUE.get)(tiers).astype(
                float
            )
            arrays["spm_breakfast_value"] = np.vectorize(BREAKFAST_VALUE.get)(
                tiers
            ).astype(float)
            arrays["scalar_school_days"] = np.array(180.0)
            arrays["spm_school_meal_net_subsidy"] = (
                180
                * spm_k12
                * (arrays["spm_lunch_value"] + arrays["spm_breakfast_value"])
            )
            arrays["hh__school_meal_net_subsidy"] = arrays[
                "spm_school_meal_net_subsidy"
            ]
        reform["hh_net_income"] = base["hh_net_income"] + (
            reform["spm_school_meal_net_subsidy"] - base["spm_school_meal_net_subsidy"]
        )
    elif measure.kind == "medicaid":
        p_hh = base["p_hh_index"]
        level = (agi / 16_000)[p_hh]
        adult = base["p_age"] >= 19
        expansion = adult & (level <= 1.38)
        base["p_medicaid_income_level"] = reform["p_medicaid_income_level"] = level
        base["p_is_expansion_adult"] = reform["p_is_expansion_adult"] = expansion
        base["p_is_aca_ptc_eligible"] = np.zeros_like(expansion)
        reform["p_is_aca_ptc_eligible"] = expansion & (level >= 1)
        base["p_medicaid_enrolled"] = expansion.copy()
        reform["p_medicaid_enrolled"] = np.zeros_like(expansion)
        cost = np.where(expansion, 8_000.0, 0.0)
        base["p_medicaid_cost"], reform["p_medicaid_cost"] = cost, np.zeros_like(cost)
        base["p_medicaid_state_cost"] = 0.1 * cost
        base["p_medicaid_federal_cost"] = 0.9 * cost
        reform["p_medicaid_state_cost"] = np.zeros_like(cost)
        reform["p_medicaid_federal_cost"] = np.zeros_like(cost)
        tu_level = agi / 16_000
        base["tu_assigned_aca_ptc"] = base["tu_aca_ptc"] = np.zeros(n)
        ptc = np.where((tu_level >= 1) & (tu_level <= 1.38), 5_000.0, 0.0)
        reform["tu_assigned_aca_ptc"] = reform["tu_aca_ptc"] = ptc
        for arrays in (base, reform):
            arrays["hh__medicaid_enrolled"] = np.bincount(
                p_hh, weights=arrays["p_medicaid_enrolled"].astype(float), minlength=n
            )
            arrays["hh__medicaid_state_cost"] = np.bincount(
                p_hh, weights=arrays["p_medicaid_state_cost"], minlength=n
            )
            arrays["hh__medicaid_federal_cost"] = np.bincount(
                p_hh, weights=arrays["p_medicaid_federal_cost"], minlength=n
            )
            arrays["hh__assigned_aca_ptc"] = arrays["tu_assigned_aca_ptc"]
        lost = base["hh__medicaid_state_cost"] + base["hh__medicaid_federal_cost"]
        reform["hh_net_income"] = base["hh_net_income"] - lost + ptc
    return _finish(base), _finish(reform)


def synthetic_filers(state: str) -> dict:
    """A filer tabulation (``top_tail.tabulate``) with 2x SOI's $1M+ returns
    and half its income above $1M, like the Populace build."""
    soi = SOI[state]
    returns = 2 * soi["returns_1m_plus"]
    above = 0.5 * soi["agi_above_1m"]
    agi = np.array([300_000.0, 750_000.0, 1_000_000 + above / returns])
    weight = np.array(
        [
            soi["returns"] - soi["returns_500k_1m"] - returns,
            soi["returns_500k_1m"],
            returns,
        ]
    )
    return tabulate(agi, weight)


def reduce_synthetic(slug: str, year: int, seed: int = 0) -> dict:
    """``compute_measure_year`` on synthetic passes (and filers)."""
    measure = MEASURES[slug]
    base, reform = synthetic_passes(slug, seed=seed)
    filers = synthetic_filers(measure.state) if measure.kind == "income_tax" else None
    return compute_measure_year(measure, year, base, reform, filers=filers)


@pytest.fixture
def passes():
    """``passes(slug)`` -> (baseline, reform) synthetic arrays."""
    return synthetic_passes
