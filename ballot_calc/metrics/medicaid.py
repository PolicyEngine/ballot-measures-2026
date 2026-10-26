"""South Dakota Amendment I scenario: expansion adults lose Medicaid.

Person-level coverage counts and program cost changes. Costs are changes
(passes - current law), so negative values are savings.

Calibration: the model enrolls about twice as many expansion adults as
South Dakota's administrative count (it treats every income-eligible adult
flagged to take up Medicaid as enrolled, on annual survey income). The
coverage and budget figures are therefore scaled by admin / model
expansion enrollees (``calibrate``); the unscaled figures keep a ``_model``
suffix. Household distribution metrics (deciles, winners and losers,
income bands, poverty) are not scaled.
"""

from __future__ import annotations

import numpy as np

from ..config import CHANGE_THRESHOLD
from .core import weighted_sum

METRICS: tuple[str, ...] = (
    "people_losing_medicaid",
    "losing_below_100fpl",
    "losing_100_plus_fpl",
    "gaining_ptc",
    "medicaid_cost_change",
    "medicaid_state_cost_change",
    "medicaid_federal_cost_change",
    "ptc_change",
    "baseline_expansion_enrollees",
)

# Metrics scaled to administrative enrollment; each keeps a ``_model`` copy.
CALIBRATED: tuple[str, ...] = (
    "people_losing_medicaid",
    "losing_below_100fpl",
    "losing_100_plus_fpl",
    "gaining_ptc",
    "medicaid_cost_change",
    "medicaid_state_cost_change",
    "medicaid_federal_cost_change",
    "ptc_change",
    "state_revenue_impact",
    "state_spending_impact",
    "state_budget_impact",
    "federal_revenue_impact",
    "federal_spending_impact",
    "federal_budget_impact",
)

METRICS = (
    *METRICS,
    *(f"{name}_model" for name in CALIBRATED),
    "admin_expansion_enrollees",
    "enrollment_calibration_factor",
)


def calibrate(metrics: dict, kind_params: dict) -> dict:
    """Scale ``CALIBRATED`` metrics by admin / model expansion enrollees,
    keeping the model values under ``<name>_model``; returns ``metrics``."""
    admin = float(kind_params["admin_expansion_enrollees"])
    model = metrics["baseline_expansion_enrollees"]
    if model <= 0:
        raise RuntimeError("No expansion enrollees in the model to calibrate.")
    factor = admin / model
    for name in CALIBRATED:
        metrics[f"{name}_model"] = metrics[name]
        metrics[name] = metrics[name] * factor
    metrics["admin_expansion_enrollees"] = admin
    metrics["enrollment_calibration_factor"] = factor
    return metrics


def medicaid_metrics(base: dict, reform: dict, threshold=CHANGE_THRESHOLD) -> dict:
    pw = np.asarray(base["p_weight"], dtype=float)
    enrolled_base = np.asarray(base["p_medicaid_enrolled"], dtype=bool)
    enrolled_reform = np.asarray(reform["p_medicaid_enrolled"], dtype=bool)
    losing = enrolled_base & ~enrolled_reform
    # Medicaid MAGI as a share of the poverty guideline (1.0 = 100% FPL).
    income_level = np.asarray(base["p_medicaid_income_level"], dtype=float)
    tu_w = np.asarray(base["tu_weight"], dtype=float)
    ptc_delta = np.asarray(reform["tu_assigned_aca_ptc"], dtype=float) - np.asarray(
        base["tu_assigned_aca_ptc"], dtype=float
    )
    person_ptc_gain = ptc_delta[np.asarray(base["p_tu_index"])] > threshold

    def person_change(name):
        return weighted_sum(
            np.asarray(reform[name], dtype=float) - np.asarray(base[name], dtype=float),
            pw,
        )

    return {
        "people_losing_medicaid": float(pw[losing].sum()),
        # Below 100% FPL there is no marketplace subsidy: the coverage gap.
        "losing_below_100fpl": float(pw[losing & (income_level < 1)].sum()),
        "losing_100_plus_fpl": float(pw[losing & (income_level >= 1)].sum()),
        # People losing Medicaid whose tax unit's take-up-adjusted premium
        # tax credit rises.
        "gaining_ptc": float(pw[losing & person_ptc_gain].sum()),
        "medicaid_cost_change": person_change("p_medicaid_cost"),
        "medicaid_state_cost_change": person_change("p_medicaid_state_cost"),
        "medicaid_federal_cost_change": person_change("p_medicaid_federal_cost"),
        "ptc_change": weighted_sum(ptc_delta, tu_w),
        # Adults enrolled through the ACA expansion group under current law.
        "baseline_expansion_enrollees": float(
            pw[
                enrolled_base & np.asarray(base["p_is_expansion_adult"], dtype=bool)
            ].sum()
        ),
    }
