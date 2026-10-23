"""North Dakota Measure No. 2: participation-adjusted school meal costs.

The model values school meals as if every K-12 child (ages 5-17) ate both
meals on every school day. That overstates both the households' gain and
the state's cost, because (a) not every student eats every meal, (b) some
children attend private schools, which the measure does not cover, and
(c) students at Community Eligibility Provision (CEP) schools already eat
free. The adjustment, per SPM unit:

    adjusted change = s x days x K12 children x (r_L x dL + r_B x dB)

- dL, dB: the model's change in the per-child daily lunch and breakfast
  value (free rate minus the household's current rate);
- s = (public K-12 enrollment - students at CEP schools) / model K-12
  children, so the affected children add up to non-CEP public enrollment;
- r_L, r_B: meals served per enrolled student per school day. The low case
  is current participation (annual meals / (days x enrollment at schools
  in the programs)); the high case adds the participation rise seen when
  states adopted universal free meals (``uplift_*`` in the registry).

The state pays the free rate minus federal reimbursement for every meal, so
the adjusted meal value is the state's meal cost; administration is added
on top. Deciles, winners and poverty use the central case (the midpoint of
the low and high participation rates); poverty is recomputed as baseline
SPM resources plus the adjusted change against the same thresholds. The
model's unadjusted figures are kept as ``*_model`` metrics.
"""

from __future__ import annotations

import numpy as np

from .core import weighted_sum

METRICS: tuple[str, ...] = (
    "k12_children_model",
    "children_newly_free_model",
    "meal_value_change_model",
    "meal_value_change_adjusted_low",
    "meal_value_change_adjusted_high",
    "state_cost_adjusted_low",
    "state_cost_adjusted_high",
    "state_cost_biennium_low",
    "state_cost_biennium_high",
    "participation_lunch",
    "participation_breakfast",
    "enrollment_scale",
)

FREE = 0


def participation_rates(kind_params: dict, school_days: float) -> dict:
    """Current (low), high and central participation rates per meal."""
    enrollment = kind_params["participating_enrollment"]
    low_lunch = kind_params["lunch_meals"] / (school_days * enrollment)
    low_breakfast = kind_params["breakfast_meals"] / (school_days * enrollment)
    up_lunch = kind_params["uplift_lunch"]
    up_breakfast = kind_params["uplift_breakfast"]
    return {
        "low": (low_lunch, low_breakfast),
        "high": (
            min(low_lunch + up_lunch, 1.0),
            min(low_breakfast + up_breakfast, 1.0),
        ),
        "central": (
            min(low_lunch + up_lunch / 2, 1.0),
            min(low_breakfast + up_breakfast / 2, 1.0),
        ),
    }


def adjust(measure, base: dict, reform: dict, extra_resources=0.0) -> dict:
    """Participation-adjusted household changes, poverty flags, state cost
    deltas and the school meal metrics."""
    params = measure.kind_params
    days = float(base["scalar_school_days"])
    hh_weight = np.asarray(base["hh_weight"], dtype=float)
    spm_hh = np.asarray(base["spm_hh_index"])
    spm_weight = hh_weight[spm_hh]
    k12 = np.asarray(base["spm_k12"], dtype=float)
    d_lunch = np.asarray(reform["spm_lunch_value"], dtype=float) - np.asarray(
        base["spm_lunch_value"], dtype=float
    )
    d_breakfast = np.asarray(reform["spm_breakfast_value"], dtype=float) - np.asarray(
        base["spm_breakfast_value"], dtype=float
    )

    # Unadjusted model change, and a check that the lunch/breakfast split
    # reproduces the model's own subsidy change.
    d_model = np.asarray(
        reform["spm_school_meal_net_subsidy"], dtype=float
    ) - np.asarray(base["spm_school_meal_net_subsidy"], dtype=float)
    rebuilt = days * k12 * (d_lunch + d_breakfast)
    # The model computes in float32, so compare relative to the amount.
    gap = (
        float((np.abs(rebuilt - d_model) / np.maximum(np.abs(d_model), 1.0)).max())
        if len(d_model)
        else 0.0
    )
    if gap > 1e-3:
        raise RuntimeError(
            "School meal split does not reproduce school_meal_net_subsidy "
            f"(max relative gap {gap})."
        )

    p_weight = np.asarray(base["p_weight"], dtype=float)
    p_spm = np.asarray(base["p_spm_index"])
    is_k12 = np.asarray(base["p_is_k12"], dtype=bool)
    k12_model = float(p_weight[is_k12].sum())
    scale = (params["public_enrollment"] - params["cep_students"]) / k12_model
    rates = participation_rates(params, days)

    def spm_change(case):
        r_lunch, r_breakfast = rates[case]
        return scale * days * k12 * (r_lunch * d_lunch + r_breakfast * d_breakfast)

    changes = {case: spm_change(case) for case in rates}
    admin_per_year = params["admin_cost_per_biennium"] / 2
    adjusted = {
        case: float((change * spm_weight).sum()) for case, change in changes.items()
    }

    # Central case for the household views.
    central = changes["central"]
    hh_change = np.bincount(spm_hh, weights=central, minlength=len(hh_weight))

    threshold = np.asarray(base["spm_threshold"], dtype=float)
    deep_threshold = np.asarray(base["spm_deep_threshold"], dtype=float)
    # ``extra_resources`` (per SPM unit) adds income the model's SPM
    # resources leave out; see metrics/__init__.py.
    resources = np.asarray(base["spm_net_income"], dtype=float) + extra_resources
    resources_reform = resources + central

    newly_free = (
        is_k12
        & (np.asarray(base["spm_lunch_tier"])[p_spm] != FREE)
        & (np.asarray(reform["spm_lunch_tier"])[p_spm] == FREE)
    )
    metrics = {
        "k12_children_model": k12_model,
        "children_newly_free_model": float(p_weight[newly_free].sum()),
        "meal_value_change_model": weighted_sum(d_model, spm_weight),
        "meal_value_change_adjusted_low": adjusted["low"],
        "meal_value_change_adjusted_high": adjusted["high"],
        "state_cost_adjusted_low": adjusted["low"] + admin_per_year,
        "state_cost_adjusted_high": adjusted["high"] + admin_per_year,
        "state_cost_biennium_low": 2 * (adjusted["low"] + admin_per_year),
        "state_cost_biennium_high": 2 * (adjusted["high"] + admin_per_year),
        "participation_lunch": rates["low"][0],
        "participation_breakfast": rates["low"][1],
        "enrollment_scale": scale,
    }
    return {
        "change": hh_change,
        # The state pays each adjusted meal's value.
        "state_spending_delta": hh_change.copy(),
        "extra_state_spending": admin_per_year,
        "poverty_baseline": (resources < threshold)[p_spm],
        "poverty_reform": (resources_reform < threshold)[p_spm],
        "deep_poverty_baseline": (resources < deep_threshold)[p_spm],
        "deep_poverty_reform": (resources_reform < deep_threshold)[p_spm],
        "metrics": metrics,
        "diagnostics": {
            "participation_high_lunch": rates["high"][0],
            "participation_high_breakfast": rates["high"][1],
            "participation_central_lunch": rates["central"][0],
            "participation_central_breakfast": rates["central"][1],
            "meal_value_change_adjusted_central": adjusted["central"],
            "school_days": days,
        },
    }
