"""One microsimulation pass per (measure, year, policy).

``run_pass`` builds a ``Microsimulation`` on a state subset under either
the measure's current-law policy (``baseline``) or its passes policy
(``reform``) and returns the numpy arrays the reducers in
``ballot_calc.metrics`` need. Baseline and reform run in separate
processes (separate Modal containers), so each pass holds one simulation.

Array names carry their entity as a prefix:

- ``hh_*``  household level, in household order (``hh__<variable>`` is a
  measure variable summed to households);
- ``p_*``   person level (``p_hh_index`` / ``p_spm_index`` / ``p_tu_index``
  index into the household / SPM-unit / tax-unit arrays);
- ``spm_*`` SPM-unit level; ``tu_*`` tax-unit level;
- ``scalar_*`` zero-dimensional values (e.g. school days per year).

``preflight_measure`` runs one household per measure through the same
policies, so a stale pin, a wrong parameter path or a mistimed override
fails in seconds rather than after an hour of microsimulation.
"""

from __future__ import annotations

import hashlib
import json

import numpy as np

from .config import POLICYENGINE_US_PIN
from .export import _json_safe
from .measures import Measure

# Bump when the set or meaning of the saved arrays changes, so cached passes
# are recomputed.
PASS_SCHEMA_VERSION = 2
POLICIES = ("baseline", "reform")

# Cash income that household net income counts but SPM resources leave out
# in policyengine-us 2.60.4: spm_unit_market_income sums the person-level
# market_income, whose component list omits these sources of
# gov.household.market_income_sources, while the taxes on them are
# subtracted in full. Census money income counts all three, so the
# reducers add them back to SPM resources (metrics/__init__.py). The fourth
# omitted source, debt_relief (cancelled debt), is not cash income and is
# not added back; it is not in the Populace data (always 0), so passes
# saved while this tuple still listed it hold the same sums.
SPM_OMITTED_SOURCES = (
    "partnership_s_corp_income",
    "farm_rent_income",
    "ak_permanent_fund_dividend",
)

SCHOOL_MEAL_TIER_CODES = {"FREE": 0, "REDUCED": 1, "PAID": 2}


def policy_overrides(measure: Measure, policy: str) -> dict:
    if policy == "baseline":
        return measure.baseline_policy
    if policy == "reform":
        return measure.reform_policy
    raise ValueError(f"policy must be one of {POLICIES}, got {policy!r}")


def pass_key(measure: Measure, year: int, policy: str) -> str:
    """Hash of everything that determines a pass's arrays."""
    payload = {
        "schema": PASS_SCHEMA_VERSION,
        "pin": POLICYENGINE_US_PIN,
        "slug": measure.slug,
        "kind": measure.kind,
        "year": year,
        "policy": policy,
        "overrides": _json_safe(policy_overrides(measure, policy)),
        "variables": list(measure_variables(measure)),
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()[:16]


def build_reform(overrides: dict):
    """``Reform.from_dict`` for a non-empty override dict, else ``None``."""
    if not overrides:
        return None
    from policyengine_core.reforms import Reform

    return Reform.from_dict(overrides, country_id="us")


def measure_variables(measure: Measure) -> tuple[str, ...]:
    """The measure's target and budget variables, each saved summed to
    households."""
    names = (
        (measure.target_variable,)
        + measure.state_revenue_variables
        + measure.state_spending_variables
        + measure.federal_revenue_variables
        + measure.federal_spending_variables
    )
    return tuple(dict.fromkeys(names))


# Variables each kind reads beyond the core set; preflight checks they exist.
CORE_VARIABLES = (
    "household_net_income",
    "household_id",
    "household_weight",
    "household_count_people",
    "adjusted_gross_income",
    "state_fips",
    "congressional_district_geoid",
    "person_weight",
    "age",
    "spm_unit_id",
    "tax_unit_id",
    "in_poverty",
    "in_deep_poverty",
    "spm_unit_net_income",
    "spm_unit_spm_threshold",
    "deep_poverty_line",
    *SPM_OMITTED_SOURCES,
)
KIND_VARIABLES = {
    "income_tax": ("tax_unit_weight",),
    "tabor_refund": ("tax_unit_weight", "co_sales_tax_refund"),
    "school_meals": (
        "is_in_k12_school",
        "school_meal_net_subsidy",
        "school_meal_lunch_tier",
        "school_meal_breakfast_tier",
        "state_group_str",
    ),
    "medicaid": (
        "tax_unit_weight",
        "medicaid_enrolled",
        "medicaid_category",
        "medicaid_income_level",
        "medicaid",
        "medicaid_state_cost",
        "medicaid_federal_cost",
        "assigned_aca_ptc",
        "aca_ptc",
        "is_aca_ptc_eligible",
    ),
}


def required_variables(measure: Measure) -> tuple[str, ...]:
    return tuple(
        dict.fromkeys(
            CORE_VARIABLES + KIND_VARIABLES[measure.kind] + measure_variables(measure)
        )
    )


def index_of(ids: np.ndarray, member_ids: np.ndarray) -> np.ndarray:
    """Positions of ``member_ids`` in ``ids`` (every member id must occur)."""
    ids = np.asarray(ids)
    member_ids = np.asarray(member_ids)
    order = np.argsort(ids, kind="stable")
    pos = np.searchsorted(ids[order], member_ids)
    pos = np.clip(pos, 0, len(ids) - 1)
    index = order[pos]
    if not np.array_equal(ids[index], member_ids):
        raise RuntimeError("Entity linkage broken: a member id has no matching unit.")
    return index


def _school_meal_values(sim, year, spm_hh_index, lunch_tier, breakfast_tier):
    """Per-child, per-day lunch and breakfast values net of the paid rate,
    as ``school_meal_daily_subsidy`` computes them, kept separate so the
    reducer can apply separate participation rates."""
    p = sim.tax_benefit_system.parameters(f"{year}-01-01").gov.usda.school_meals
    group = np.asarray(sim.calculate("state_group_str", period=year)).astype(str)
    spm_group = group[spm_hh_index]
    lunch = np.zeros(len(spm_group))
    breakfast = np.zeros(len(spm_group))
    for g in np.unique(spm_group):
        in_group = spm_group == g
        # Plain-string attribute access: a numpy string key would be taken
        # as a vectorial (per-unit) lookup.
        nslp = getattr(p.amount.nslp, str(g))
        sbp = getattr(p.amount.sbp, str(g))
        for tier in SCHOOL_MEAL_TIER_CODES:
            lunch_mask = in_group & (lunch_tier == tier)
            breakfast_mask = in_group & (breakfast_tier == tier)
            lunch[lunch_mask] = float(getattr(nslp, tier)) - float(nslp.PAID)
            breakfast[breakfast_mask] = float(getattr(sbp, tier)) - float(sbp.PAID)
    return lunch, breakfast, float(p.school_days)


def run_pass(
    measure: Measure, year: int, policy: str, dataset_path: str
) -> dict[str, np.ndarray]:
    """Simulate ``measure``'s ``policy`` for ``year`` on a state subset."""
    from policyengine_us import Microsimulation

    reform = build_reform(policy_overrides(measure, policy))
    # dataset_end_year stops the automatic multi-year extension at the
    # scored year instead of the last forecast year, which cuts memory.
    sim = Microsimulation(dataset=dataset_path, reform=reform, dataset_end_year=year)

    def calc(variable, map_to=None, decode=False):
        kwargs = {"period": year}
        if map_to is not None:
            kwargs["map_to"] = map_to
        if decode:
            kwargs["decode_enums"] = True
        return np.asarray(sim.calculate(variable, **kwargs))

    out: dict[str, np.ndarray] = {}
    # Household net income FIRST (policyengine-us#9740): the no-SALT branch
    # behind ctc_limiting_tax_liability depends on what the simulation has
    # already computed, so both passes must take the same path.
    out["hh_net_income"] = calc("household_net_income").astype(float)
    out["hh_id"] = calc("household_id")
    out["hh_weight"] = calc("household_weight").astype(float)
    out["hh_people"] = calc("household_count_people").astype(float)
    out["hh_agi"] = calc("adjusted_gross_income", map_to="household").astype(float)
    out["hh_state_fips"] = calc("state_fips").astype(int)
    out["hh_cd_geoid"] = calc("congressional_district_geoid").astype(int)
    for variable in measure_variables(measure):
        out[f"hh__{variable}"] = calc(variable, map_to="household").astype(float)

    # Persons and SPM units (poverty).
    person_hh = calc("household_id", map_to="person")
    out["p_hh_index"] = index_of(out["hh_id"], person_hh)
    spm_ids = calc("spm_unit_id")
    out["p_spm_index"] = index_of(spm_ids, calc("spm_unit_id", map_to="person"))
    out["p_weight"] = calc("person_weight").astype(float)
    out["p_age"] = calc("age").astype(float)
    out["p_in_poverty"] = calc("in_poverty", map_to="person").astype(bool)
    out["p_in_deep_poverty"] = calc("in_deep_poverty", map_to="person").astype(bool)
    out["spm_net_income"] = calc("spm_unit_net_income").astype(float)
    out["spm_threshold"] = calc("spm_unit_spm_threshold").astype(float)
    out["spm_deep_threshold"] = calc("deep_poverty_line").astype(float)
    spm_hh_index = np.zeros(len(spm_ids), dtype=int)
    spm_hh_index[out["p_spm_index"]] = out["p_hh_index"]
    out["spm_hh_index"] = spm_hh_index
    out["spm_omitted_market_income"] = sum(
        calc(variable, map_to="spm_unit").astype(float)
        for variable in SPM_OMITTED_SOURCES
    )

    if measure.kind in ("income_tax", "tabor_refund", "medicaid"):
        tu_ids = calc("tax_unit_id")
        out["p_tu_index"] = index_of(tu_ids, calc("tax_unit_id", map_to="person"))
        out["tu_weight"] = calc("tax_unit_weight").astype(float)
        out["tu_agi"] = calc("adjusted_gross_income").astype(float)

    if measure.kind == "income_tax":
        out["tu_state_tax"] = calc(measure.target_variable).astype(float)
    elif measure.kind == "tabor_refund":
        out["tu_refund"] = calc("co_sales_tax_refund").astype(float)
    elif measure.kind == "school_meals":
        is_k12 = calc("is_in_k12_school").astype(bool)
        out["p_is_k12"] = is_k12
        out["spm_k12"] = np.bincount(
            out["p_spm_index"], weights=is_k12.astype(float), minlength=len(spm_ids)
        )
        lunch_tier = calc("school_meal_lunch_tier", decode=True).astype(str)
        breakfast_tier = calc("school_meal_breakfast_tier", decode=True).astype(str)
        unknown = set(np.unique(lunch_tier)) | set(np.unique(breakfast_tier))
        unknown -= set(SCHOOL_MEAL_TIER_CODES)
        if unknown:
            raise RuntimeError(f"Unexpected school meal tiers: {sorted(unknown)}")
        out["spm_lunch_tier"] = np.array(
            [SCHOOL_MEAL_TIER_CODES[t] for t in lunch_tier]
        )
        out["spm_breakfast_tier"] = np.array(
            [SCHOOL_MEAL_TIER_CODES[t] for t in breakfast_tier]
        )
        lunch, breakfast, days = _school_meal_values(
            sim, year, spm_hh_index, lunch_tier, breakfast_tier
        )
        out["spm_lunch_value"] = lunch
        out["spm_breakfast_value"] = breakfast
        out["scalar_school_days"] = np.array(days)
        out["spm_school_meal_net_subsidy"] = calc("school_meal_net_subsidy").astype(
            float
        )
    elif measure.kind == "medicaid":
        out["p_medicaid_enrolled"] = calc("medicaid_enrolled").astype(bool)
        category = calc("medicaid_category", decode=True).astype(str)
        out["p_is_expansion_adult"] = category == "ADULT"
        out["p_medicaid_income_level"] = calc("medicaid_income_level").astype(float)
        out["p_medicaid_cost"] = calc("medicaid").astype(float)
        out["p_medicaid_state_cost"] = calc("medicaid_state_cost").astype(float)
        out["p_medicaid_federal_cost"] = calc("medicaid_federal_cost").astype(float)
        out["p_is_aca_ptc_eligible"] = calc("is_aca_ptc_eligible").astype(bool)
        out["tu_assigned_aca_ptc"] = calc("assigned_aca_ptc").astype(float)
        out["tu_aca_ptc"] = calc("aca_ptc").astype(float)
    return out


# ---------------------------------------------------------------------------
# Preflight: one household per measure
# ---------------------------------------------------------------------------


def _situation(year: int, state: str, adults, children=()) -> dict:
    """A one-tax-unit household: ``adults`` is [(age, wages)], ``children``
    a list of ages (all claimed as dependents)."""
    y = str(year)
    people = {}
    for i, (age, wages) in enumerate(adults):
        people[f"adult{i + 1}"] = {"age": {y: age}, "employment_income": {y: wages}}
    for j, age in enumerate(children):
        people[f"child{j + 1}"] = {"age": {y: age}, "is_tax_unit_dependent": {y: True}}
    members = list(people)
    adult_ids = [f"adult{i + 1}" for i in range(len(adults))]
    marital_units = {"couple": {"members": adult_ids}}
    for j in range(len(children)):
        marital_units[f"child{j + 1}_unit"] = {"members": [f"child{j + 1}"]}
    return {
        "people": people,
        "tax_units": {"tax_unit": {"members": members}},
        "spm_units": {"spm_unit": {"members": members}},
        "families": {"family": {"members": members}},
        "marital_units": marital_units,
        "households": {"household": {"members": members, "state_code": {y: state}}},
    }


# (label, year-independent situation spec, variable checks). Each check is
# (variable, expected sign of reform - baseline, or "zero" / "positive"
# for a value that must hold in a given policy).
PREFLIGHT_CASES = {
    "co-amendment-87": [
        {
            "label": "Married couple, $1.2M wages, 2 kids",
            "state": "CO",
            "adults": [(50, 1_200_000), (48, 0)],
            "children": [13, 16],
            "checks": [("co_income_tax", +1)],
        }
    ],
    "co-prop-nn": [
        {
            "label": "Single filer, $40k wages",
            "state": "CO",
            "adults": [(30, 40_000)],
            "checks": [("co_sales_tax_refund", -1)],
            # The lowest tier per person from the forecast overrides.
            "baseline_values": {"co_sales_tax_refund": {2027: 43, 2028: 47}},
        }
    ],
    "ca-prop-3": [
        {
            "label": "Single filer, $1.5M wages",
            "state": "CA",
            "adults": [(50, 1_500_000)],
            "checks": [("ca_income_tax", +1)],
        }
    ],
    "wa-i-645": [
        {
            "label": "Single filer, $2M wages",
            "state": "WA",
            "adults": [(50, 2_000_000)],
            "checks": [("wa_income_tax", -1)],
        }
    ],
    "nd-measure-2": [
        {
            "label": "Married couple, 2 kids, about 300% FPL",
            "state": "ND",
            "adults": [(40, 100_000), (38, 0)],
            "children": [7, 10],
            "checks": [("school_meal_net_subsidy", +1)],
        }
    ],
    "sd-amendment-i": [
        {
            "label": "Single adult, about 120% FPL",
            "state": "SD",
            "adults": [(30, 20_000)],
            "checks": [("medicaid_enrolled", -1), ("assigned_aca_ptc", +1)],
        },
        {
            "label": "Single adult, about 80% FPL (coverage gap)",
            "state": "SD",
            "adults": [(30, 13_000)],
            "checks": [("medicaid_enrolled", -1), ("assigned_aca_ptc", 0)],
        },
    ],
}


def preflight_measure(measure: Measure, year: int) -> list[dict]:
    """Run the measure's preflight households for ``year``; return one
    record per check with ``ok`` set."""
    from policyengine_us import Simulation

    records = []
    for case in PREFLIGHT_CASES[measure.slug]:
        situation = _situation(
            year, case["state"], case["adults"], case.get("children", ())
        )
        sims = {}
        for policy in POLICIES:
            reform = build_reform(policy_overrides(measure, policy))
            sims[policy] = Simulation(situation=situation, reform=reform)
        missing = [
            v
            for v in required_variables(measure)
            if v not in sims["baseline"].tax_benefit_system.variables
        ]
        for variable, sign in case["checks"]:
            values = {
                policy: float(np.sum(sims[policy].calculate(variable, year)))
                for policy in POLICIES
            }
            delta = values["reform"] - values["baseline"]
            ok = (np.sign(delta) == sign) if sign else abs(delta) < 1e-6
            expected = case.get("baseline_values", {}).get(variable, {}).get(year)
            if expected is not None:
                ok = ok and abs(values["baseline"] - expected) < 0.5
            records.append(
                {
                    "measure": measure.slug,
                    "year": year,
                    "case": case["label"],
                    "variable": variable,
                    "baseline": values["baseline"],
                    "reform": values["reform"],
                    "expected_sign": sign,
                    "expected_baseline": expected,
                    "ok": bool(ok) and not missing,
                    "missing_variables": missing,
                }
            )
        net = {
            policy: float(np.sum(sims[policy].calculate("household_net_income", year)))
            for policy in POLICIES
        }
        records.append(
            {
                "measure": measure.slug,
                "year": year,
                "case": case["label"],
                "variable": "household_net_income",
                "baseline": net["baseline"],
                "reform": net["reform"],
                "expected_sign": None,
                "expected_baseline": None,
                "ok": True,
                "missing_variables": missing,
            }
        )
    return records
