"""Reduce one measure-year's baseline and reform passes to its results.

``compute_measure_year`` takes the arrays ``ballot_calc.passes.run_pass``
saved for current law (``base``) and for the measure passing (``reform``)
and returns a JSON-ready partial result: metrics, deciles, intra-decile
winners and losers, AGI bands and districts. Everything here is pure numpy
so the fast tests run it on synthetic arrays.
"""

from __future__ import annotations

import numpy as np

from ..measures import Measure
from ..states import STATES
from . import income_tax, medicaid, school_meals, tabor_refund
from .core import (
    CORE_METRICS,
    GuardError,
    HouseholdArrays,
    PersonArrays,
    check_target,
    core_results,
    weighted_sum,
)

KIND_METRICS: dict[str, tuple[str, ...]] = {
    "income_tax": income_tax.METRICS,
    "tabor_refund": tabor_refund.METRICS,
    "school_meals": school_meals.METRICS,
    "medicaid": medicaid.METRICS,
}

__all__ = [
    "CORE_METRICS",
    "KIND_METRICS",
    "GuardError",
    "compute_measure_year",
    "metric_names",
]


def metric_names(kind: str) -> tuple[str, ...]:
    """Every metrics.csv key for a measure of ``kind``, in output order."""
    return CORE_METRICS + KIND_METRICS[kind]


def _delta(variables, base: dict, reform: dict, n: int) -> np.ndarray:
    """Per-household reform - baseline change summed over ``variables``."""
    total = np.zeros(n)
    for variable in variables:
        key = f"hh__{variable}"
        total += np.asarray(reform[key], dtype=float) - np.asarray(
            base[key], dtype=float
        )
    return total


def _jsonable(value):
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, np.ndarray):
        return value.tolist()
    return value


def compute_measure_year(measure: Measure, year: int, base: dict, reform: dict) -> dict:
    geo = STATES[measure.state]
    label = f"{measure.slug} {year}"
    if not np.array_equal(base["hh_id"], reform["hh_id"]):
        raise RuntimeError(
            f"{label}: baseline and reform passes hold different households."
        )
    fips = np.unique(np.asarray(base["hh_state_fips"]))
    if fips.tolist() != [geo.fips]:
        raise RuntimeError(
            f"{label}: state_fips {fips.tolist()}, expected [{geo.fips}]."
        )
    geoids = set(np.unique(np.asarray(base["hh_cd_geoid"])).tolist())
    if not geoids <= set(geo.district_geoids):
        raise RuntimeError(
            f"{label}: district geoids {sorted(geoids)} outside {geo.district_geoids}."
        )

    weight = np.asarray(base["hh_weight"], dtype=float)
    n = len(weight)
    target_key = f"hh__{measure.target_variable}"
    target_baseline_total = weighted_sum(base[target_key], weight)
    target_change = weighted_sum(
        np.asarray(reform[target_key], dtype=float)
        - np.asarray(base[target_key], dtype=float),
        weight,
    )
    check_target(
        target_change,
        target_baseline_total,
        measure.target_sign,
        f"{label} {measure.target_variable}",
    )

    hh = HouseholdArrays(
        weight=weight,
        baseline_net_income=np.asarray(base["hh_net_income"], dtype=float),
        change=np.asarray(reform["hh_net_income"], dtype=float)
        - np.asarray(base["hh_net_income"], dtype=float),
        people=np.asarray(base["hh_people"], dtype=float),
        agi=np.asarray(base["hh_agi"], dtype=float),
        geoid=np.asarray(base["hh_cd_geoid"]),
        state_revenue_delta=_delta(measure.state_revenue_variables, base, reform, n),
        state_spending_delta=_delta(measure.state_spending_variables, base, reform, n),
        federal_revenue_delta=_delta(
            measure.federal_revenue_variables, base, reform, n
        ),
        federal_spending_delta=_delta(
            measure.federal_spending_variables, base, reform, n
        ),
    )
    persons = PersonArrays(
        weight=np.asarray(base["p_weight"], dtype=float),
        age=np.asarray(base["p_age"], dtype=float),
        poverty_baseline=np.asarray(base["p_in_poverty"], dtype=bool),
        poverty_reform=np.asarray(reform["p_in_poverty"], dtype=bool),
        deep_poverty_baseline=np.asarray(base["p_in_deep_poverty"], dtype=bool),
        deep_poverty_reform=np.asarray(reform["p_in_deep_poverty"], dtype=bool),
    )
    # The SPM arrays reproduce the model's own poverty flags.
    p_spm = np.asarray(base["p_spm_index"])
    recomputed = (
        np.asarray(base["spm_net_income"]) < np.asarray(base["spm_threshold"])
    )[p_spm]
    diagnostics = {
        "poverty_flag_mismatches": int((recomputed != persons.poverty_baseline).sum()),
        "model_net_income_change_total": weighted_sum(hh.change, weight),
    }

    extra_state_spending = 0.0
    kind_metrics: dict = {}
    if measure.kind == "school_meals":
        adjusted = school_meals.adjust(measure, base, reform)
        hh.change = adjusted["change"]
        hh.state_spending_delta = adjusted["state_spending_delta"]
        persons.poverty_baseline = adjusted["poverty_baseline"]
        persons.poverty_reform = adjusted["poverty_reform"]
        persons.deep_poverty_baseline = adjusted["deep_poverty_baseline"]
        persons.deep_poverty_reform = adjusted["deep_poverty_reform"]
        extra_state_spending = adjusted["extra_state_spending"]
        kind_metrics = adjusted["metrics"]
        diagnostics.update(adjusted["diagnostics"])
    elif measure.kind == "income_tax":
        kind_metrics = income_tax.income_tax_metrics(base, reform)
    elif measure.kind == "tabor_refund":
        kind_metrics = tabor_refund.tabor_refund_metrics(base, reform)
    elif measure.kind == "medicaid":
        kind_metrics = medicaid.medicaid_metrics(base, reform)

    results = core_results(
        hh,
        persons,
        bands=measure.income_bands,
        geo=geo,
        extra_state_spending=extra_state_spending,
    )
    results["metrics"]["target_change"] = target_change
    results["metrics"].update(kind_metrics)
    missing = [m for m in metric_names(measure.kind) if m not in results["metrics"]]
    if missing:
        raise RuntimeError(f"{label}: metrics missing {missing}")
    results["metrics"] = {m: results["metrics"][m] for m in metric_names(measure.kind)}
    results.update(
        {
            "measure": measure.slug,
            "year": year,
            "state": measure.state,
            "guard": {
                "target_variable": measure.target_variable,
                "target_sign": measure.target_sign,
                "target_change": target_change,
                "target_baseline_total": target_baseline_total,
            },
            "diagnostics": diagnostics,
        }
    )
    return _jsonable(results)
