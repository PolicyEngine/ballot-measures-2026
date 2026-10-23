"""Household calculator for the 2026 ballot measures dashboard.

One calculator serves every measure in ``ballot_calc.measures``. For a
household in the measure's state and one of its tax years it returns, for
current law (``baseline``) and for the measure passing (``reform``):

- ``sweep``: values along an employment-income sweep of the head's wages,
  from $0 to the measure's ``sweep_max`` (or the entered income, if
  higher), on a round-dollar grid of at most ``MAX_SWEEP_POINTS`` points;
- ``at_income``: the same values at the entered income.

Request (``POST /calculate`` on scripts/modal_household_api.py)::

    {"measure": "wa-i-645", "year": 2028, "age_head": 58, "married": true,
     "age_spouse": 56, "spouse_income": 0, "income": 5000000,
     "dependents": [{"age": 9}]}

``measure``, ``age_head`` and ``income`` are required. ``year`` defaults to
the measure's headline year and must be one of its ``years``. ``married``
defaults to whether ``age_spouse`` is given; a spouse's age defaults to the
head's, and ``age_spouse`` and ``spouse_income`` are ignored for a single
filer. ``dependents`` may also be a list of ages.

Response::

    {"measure", "year", "state", "kind", "pin", "income", "filing_status",
     "income_range": [...], "income_index": int | None,
     "sweep": {"baseline": {key: [...]}, "reform": {key: [...]}},
     "at_income": {"baseline": {key: value}, "reform": {key: value}}}

Each policy object has ``net_income`` (household_net_income), ``state_tax``
(the state's income tax after refundable credits), ``federal_tax``
(income_tax) and the measure kind's keys (``KIND_OUTPUTS``). Every value is
summed over the household. ``income_index`` is the entered income's
position in ``income_range``; when the income is off the grid it is
``None`` and ``at_income`` comes from a copy of the household at that
income, simulated alongside the sweep. ``filing_status`` is the
household's federal filing status at the entered income. Levels are
reported, not changes: impact = reform - baseline, as everywhere in this
repository.

The baseline and reform policies are the registry's ``baseline_policy`` and
``reform_policy``, so the household figures use the same overrides as the
statewide pipeline. Measures that share a policy share a tax-benefit
system: plain current law serves four measures' baselines.

This module imports policyengine only inside ``HouseholdCalculator``, so
the fast tests can exercise input validation, the sweep grid, the
situation builder and the response layout without the model installed.
"""

from __future__ import annotations

import contextlib
import gc
import hashlib
import json
import math
import re
import threading
import time
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Mapping, Optional, Tuple

import numpy as np

from .config import POLICYENGINE_US_PIN
from .measures import MEASURE_SLUGS, MEASURES, Measure

POLICIES = ("baseline", "reform")

# The state's income tax after refundable credits. North Dakota's and South
# Dakota's measures don't change income tax, so they use the all-state
# total (South Dakota has no income tax).
STATE_TAX_VARIABLES = {
    "CO": "co_income_tax",
    "CA": "ca_income_tax",
    "WA": "wa_income_tax",
    "ND": "state_income_tax",
    "SD": "state_income_tax",
}

# Response key -> PolicyEngine variable, for every measure. ``state_tax`` is
# filled from STATE_TAX_VARIABLES. household_net_income must stay first:
# it is computed before anything else (policyengine-us#9740).
CORE_OUTPUTS: Tuple[Tuple[str, Optional[str]], ...] = (
    ("net_income", "household_net_income"),
    ("state_tax", None),
    ("federal_tax", "income_tax"),
)

# Response key -> PolicyEngine variable, by measure kind.
KIND_OUTPUTS: Dict[str, Tuple[Tuple[str, str], ...]] = {
    "income_tax": (),
    # The six-tier TABOR sales tax refund (a refundable Colorado credit, so
    # it also lowers co_income_tax).
    "tabor_refund": (("refund", "co_sales_tax_refund"),),
    "school_meals": (
        # Value of free and reduced-price meals above the paid-meal subsidy.
        ("meal_value", "school_meal_net_subsidy"),
        # The parts of meal_value served free and at the reduced price.
        ("free_meals", "free_school_meals"),
        ("reduced_price_meals", "reduced_price_school_meals"),
    ),
    "medicaid": (
        # Medicaid's per-enrollee cost, the value household_net_income
        # counts when gov.simulation.include_health_benefits_in_net_income
        # is true (both of South Dakota's policies set it).
        ("medicaid", "medicaid"),
        # The premium tax credit counted in net income.
        ("ptc", "assigned_aca_ptc"),
        # People enrolled in Medicaid.
        ("medicaid_enrolled", "medicaid_enrolled"),
        # Marketplace premium after the credit, which net income subtracts
        # as a health cost when health benefits are counted. When only
        # adults' coverage changes, medicaid + ptc - marketplace_premium
        # accounts for the whole net income change.
        ("marketplace_premium", "marketplace_net_premium"),
    ),
}

# Employment-income sweep: a uniform grid from $0 whose step is the
# smallest of SWEEP_STEPS that keeps it within MAX_SWEEP_POINTS points, so
# chart hover values are round.
MAX_SWEEP_POINTS = 131
SWEEP_STEPS = (
    250,
    500,
    1_000,
    2_000,
    2_500,
    5_000,
    10_000,
    20_000,
    25_000,
    50_000,
    100_000,
    200_000,
    250_000,
    500_000,
    1_000_000,
)

# Input limits for the web endpoint.
MIN_ADULT_AGE = 18
MAX_AGE = 110
MAX_DEPENDENTS = 8
MAX_INCOME = 100_000_000


class HouseholdInputError(ValueError):
    """A request the calculator can't run (the endpoint answers 422)."""


def output_variables(measure: Measure) -> List[Tuple[str, str]]:
    """``(response key, variable)`` pairs reported for ``measure``, with
    household_net_income first."""
    pairs = [
        (key, variable or STATE_TAX_VARIABLES[measure.state])
        for key, variable in CORE_OUTPUTS
    ]
    return pairs + list(KIND_OUTPUTS[measure.kind])


def output_keys(measure: Measure) -> List[str]:
    """Keys of each policy object in a response for ``measure``."""
    return [key for key, _ in output_variables(measure)]


# ---------------------------------------------------------------------------
# Input
# ---------------------------------------------------------------------------


def _number(data: Mapping[str, Any], name: str, default: Any = None) -> float:
    value = data.get(name, default)
    if value is None or value == "":
        if default is None:
            raise HouseholdInputError(f"{name} is required")
        value = default
    if isinstance(value, bool):
        raise HouseholdInputError(f"{name} must be a number")
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise HouseholdInputError(f"{name} must be a number") from None
    if not math.isfinite(number):
        raise HouseholdInputError(f"{name} must be finite")
    return number


def _whole_number(value: Any, name: str) -> int:
    if isinstance(value, bool):
        raise HouseholdInputError(f"{name} must be a whole number")
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise HouseholdInputError(f"{name} must be a whole number") from None
    if not math.isfinite(number) or not number.is_integer():
        raise HouseholdInputError(f"{name} must be a whole number")
    return int(number)


def _age(value: Any, name: str, low: int) -> int:
    age = _whole_number(value, name)
    if not low <= age <= MAX_AGE:
        raise HouseholdInputError(f"{name} must be between {low} and {MAX_AGE}")
    return age


def _flag(value: Any, name: str) -> bool:
    if isinstance(value, bool):
        return value
    if value in (0, 1):
        return bool(value)
    raise HouseholdInputError(f"{name} must be true or false")


@dataclass(frozen=True)
class HouseholdInput:
    measure: str
    year: int
    age_head: int
    income: float
    married: bool = False
    age_spouse: Optional[int] = None
    spouse_income: float = 0.0
    dependents: Tuple[int, ...] = ()

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "HouseholdInput":
        """Validate and coerce a request payload; raises HouseholdInputError."""
        if not isinstance(data, Mapping):
            raise HouseholdInputError("the request body must be a JSON object")

        slug = data.get("measure")
        if not isinstance(slug, str) or slug not in MEASURES:
            raise HouseholdInputError(
                f"measure must be one of {', '.join(MEASURE_SLUGS)}"
            )
        measure = MEASURES[slug]

        year_value = data.get("year")
        if year_value in (None, ""):
            year = measure.headline_year
        else:
            year = _whole_number(year_value, "year")
        if year not in measure.years:
            allowed = ", ".join(str(y) for y in measure.years)
            raise HouseholdInputError(f"year must be one of {allowed} for {slug}")

        if data.get("age_head") in (None, ""):
            raise HouseholdInputError("age_head is required")
        age_head = _age(data["age_head"], "age_head", MIN_ADULT_AGE)

        income = _number(data, "income")
        if not 0 <= income <= MAX_INCOME:
            raise HouseholdInputError(f"income must be between 0 and {MAX_INCOME:,}")

        age_spouse_value = data.get("age_spouse")
        has_spouse_age = age_spouse_value not in (None, "")
        married_value = data.get("married")
        married = has_spouse_age if married_value is None else _flag(married_value, "married")
        if married:
            age_spouse = (
                _age(age_spouse_value, "age_spouse", MIN_ADULT_AGE)
                if has_spouse_age
                else age_head
            )
            spouse_income = _number(data, "spouse_income", 0.0)
            if not 0 <= spouse_income <= MAX_INCOME:
                raise HouseholdInputError(
                    f"spouse_income must be between 0 and {MAX_INCOME:,}"
                )
        else:
            age_spouse, spouse_income = None, 0.0

        raw_dependents = data.get("dependents") or []
        if not isinstance(raw_dependents, (list, tuple)):
            raise HouseholdInputError("dependents must be a list")
        if len(raw_dependents) > MAX_DEPENDENTS:
            raise HouseholdInputError(f"at most {MAX_DEPENDENTS} dependents")
        dependents = []
        for i, dependent in enumerate(raw_dependents):
            if isinstance(dependent, Mapping):
                if dependent.get("age") in (None, ""):
                    raise HouseholdInputError(f"dependents[{i}].age is required")
                dependent = dependent["age"]
            dependents.append(_age(dependent, f"dependents[{i}].age", 0))

        return cls(
            measure=slug,
            year=year,
            age_head=age_head,
            income=income,
            married=married,
            age_spouse=age_spouse,
            spouse_income=spouse_income,
            dependents=tuple(dependents),
        )

    def to_payload(self) -> Dict[str, Any]:
        """The canonical request payload for this household."""
        return {
            "measure": self.measure,
            "year": self.year,
            "age_head": self.age_head,
            "married": self.married,
            "age_spouse": self.age_spouse,
            "spouse_income": _plain_number(self.spouse_income),
            "income": _plain_number(self.income),
            "dependents": [{"age": age} for age in self.dependents],
        }


def _plain_number(value: float):
    """Whole-dollar amounts as ints in JSON payloads."""
    return int(value) if float(value).is_integer() else value


def example_payload(measure: Measure, profile: Mapping[str, Any], year: int) -> Dict[str, Any]:
    """Request payload for one of a measure's ``example_profiles``.

    A married profile's spouse is the head's age; profiles put all wages
    on the head unless they give ``spouse_income``.
    """
    married = bool(profile.get("married", False))
    return HouseholdInput.from_dict(
        {
            "measure": measure.slug,
            "year": year,
            "age_head": profile["age_head"],
            "married": married,
            "age_spouse": profile.get("age_spouse", profile["age_head"]) if married else None,
            "spouse_income": profile.get("spouse_income", 0),
            "income": profile["income"],
            "dependents": list(profile.get("dependents", ())),
        }
    ).to_payload()


def example_id(label: str) -> str:
    """Stable id for an example profile, from its label."""
    return re.sub(r"[^a-z0-9]+", "-", label.lower().replace("$", "")).strip("-")


# ---------------------------------------------------------------------------
# Sweep grid and situation
# ---------------------------------------------------------------------------


def sweep_grid(income: float, sweep_max: float) -> Tuple[int, int, Optional[int]]:
    """``(step, count, index)`` of the employment-income grid.

    The grid runs from $0 to at least ``max(sweep_max, income)`` in a round
    step. ``index`` is the entered income's position when it sits on the
    grid, else ``None``.
    """
    top = max(float(sweep_max), float(income))
    step = next(
        (s for s in SWEEP_STEPS if math.ceil(top / s) + 1 <= MAX_SWEEP_POINTS),
        int(math.ceil(top / (MAX_SWEEP_POINTS - 1))),
    )
    count = int(math.ceil(top / step)) + 1
    on_grid = float(income).is_integer() and int(income) % step == 0
    index = int(income) // step if on_grid else None
    return step, count, index


GROUPS = ("families", "spm_units", "tax_units", "households")
# Prefix for the second copy of the household that sits at the entered
# income when it is off the sweep grid (see build_situation).
POINT_PREFIX = "point_"


def _add_household(
    situation: Dict[str, Any],
    household: HouseholdInput,
    state: str,
    income: Optional[float],
    prefix: str = "",
) -> None:
    """Add one copy of ``household`` with its own entities. ``income`` is
    the head's wages, or ``None`` for the copy an axis sweeps."""
    y = str(household.year)

    def person(age: int, head: bool, spouse: bool, dependent: bool) -> Dict[str, Any]:
        return {
            "age": {y: age},
            "is_tax_unit_head": {y: head},
            "is_tax_unit_spouse": {y: spouse},
            "is_tax_unit_dependent": {y: dependent},
        }

    people = situation["people"]
    head = f"{prefix}you"
    people[head] = person(household.age_head, True, False, False)
    people[head]["employment_income"] = {y: income}
    members = [head]
    marital_units = situation["marital_units"]
    marital_units[f"{prefix}your marital unit"] = {"members": [head]}
    if household.married:
        spouse = f"{prefix}your partner"
        people[spouse] = person(household.age_spouse, False, True, False)
        people[spouse]["employment_income"] = {y: household.spouse_income}
        members.append(spouse)
        marital_units[f"{prefix}your marital unit"]["members"].append(spouse)
    for i, age in enumerate(household.dependents):
        pid = f"{prefix}dependent_{i + 1}"
        people[pid] = person(age, False, False, True)
        members.append(pid)
        marital_units[f"{pid}'s marital unit"] = {"members": [pid]}

    situation["families"][f"{prefix}your family"] = {"members": list(members)}
    situation["spm_units"][f"{prefix}your spm unit"] = {"members": list(members)}
    situation["tax_units"][f"{prefix}your tax unit"] = {"members": list(members)}
    situation["households"][f"{prefix}your household"] = {
        "members": list(members),
        "state_code": {y: state},
    }


def build_situation(
    household: HouseholdInput,
    axis: Optional[Tuple[int, int]] = None,
    with_point: bool = False,
) -> Dict[str, Any]:
    """PolicyEngine situation for ``household`` in its measure's state.

    With ``axis = (step, count)`` the head's employment income sweeps from $0
    in ``count`` steps of ``step``; otherwise it is the entered income. With
    ``with_point`` as well, a second, independent copy of the household
    earning the entered income rides along, so an income off the grid
    needs no second simulation: the axis replicates the situation ``count``
    times and varies only the first person's wages, so household-level
    results alternate sweep point, entered income, sweep point, ...

    Roles are explicit so an adult dependent never becomes a spouse.
    Children need no school or coverage inputs: the model puts ages 5-17 in
    K-12 school and nobody has employer coverage unless told otherwise.
    """
    measure = MEASURES[household.measure]
    y = str(household.year)
    situation: Dict[str, Any] = {"people": {}, "marital_units": {}}
    situation.update({group: {} for group in GROUPS})
    _add_household(situation, household, measure.state, None if axis else household.income)
    if axis and with_point:
        _add_household(situation, household, measure.state, household.income, POINT_PREFIX)
    if axis:
        step, count = axis
        situation["axes"] = [
            [
                {
                    "name": "employment_income",
                    "min": 0,
                    "max": step * (count - 1),
                    "count": count,
                    "period": y,
                    "target": "person",
                }
            ]
        ]
    return situation


# ---------------------------------------------------------------------------
# Response
# ---------------------------------------------------------------------------


def _round_list(values) -> List[float]:
    return [round(float(v), 2) for v in np.asarray(values, dtype=float)]


def assemble_response(
    household: HouseholdInput,
    grid: Tuple[int, int, Optional[int]],
    sweep_arrays: Mapping[str, Mapping[str, Any]],
    point_values: Mapping[str, Mapping[str, float]],
    filing_status: Optional[str],
) -> Dict[str, Any]:
    """Lay out a response from per-policy sweep arrays and point values."""
    measure = MEASURES[household.measure]
    step, count, index = grid
    keys = output_keys(measure)
    sweep = {}
    at_income = {}
    for policy in POLICIES:
        arrays = sweep_arrays[policy]
        sweep[policy] = {key: _round_list(arrays[key]) for key in keys}
        at_income[policy] = {
            key: round(float(point_values[policy][key]), 2) for key in keys
        }
    for policy, series in sweep.items():
        for key, values in series.items():
            if len(values) != count:
                raise RuntimeError(
                    f"{policy}.{key} has {len(values)} sweep points; expected {count}"
                )
    return {
        "measure": measure.slug,
        "year": household.year,
        "state": measure.state,
        "kind": measure.kind,
        "pin": POLICYENGINE_US_PIN,
        "income": _plain_number(household.income),
        "filing_status": filing_status,
        "income_range": [float(step * i) for i in range(count)],
        "income_index": index,
        "sweep": sweep,
        "at_income": at_income,
    }


# ---------------------------------------------------------------------------
# Calculator
# ---------------------------------------------------------------------------


def _canonical(value):
    """JSON-serializable form of an override value (infinities as text)."""
    if isinstance(value, float) and not math.isfinite(value):
        return "Infinity" if value > 0 else "-Infinity"
    if isinstance(value, Mapping):
        return {str(k): _canonical(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_canonical(v) for v in value]
    return value


def policy_key(policy: Mapping[str, Mapping[str, Any]]) -> str:
    """Short hash identifying a policy (a set of parameter overrides)."""
    canonical = json.dumps(_canonical(policy), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()[:12]


def build_reform(policy: Mapping[str, Mapping[str, Any]]):
    """A policyengine Reform applying ``policy``'s overrides.

    ``Reform.from_dict`` also lets contributed structural reforms (California
    Proposition 3) activate from their ``in_effect`` parameters when a
    tax-benefit system is built with the reform.
    """
    from policyengine_core.reforms import Reform

    return Reform.from_dict(
        {path: dict(periods) for path, periods in policy.items()}, country_id="us"
    )


@contextlib.contextmanager
def _prebuilt_structural_reforms():
    """Skip ``Simulation``'s redundant structural-reform pass.

    ``policyengine_us.Simulation.__init__`` re-derives the contributed
    structural reforms from the system's parameters and applies them again.
    The systems built in ``HouseholdCalculator.__init__`` already carry
    them, so the second pass changes nothing; for California Proposition 3,
    which edits the rate schedule, it also makes every simulation take a
    private copy of the whole parameter tree (seconds per simulation, and
    cold parameter caches). Results are identical with and without the pass
    (tests/test_household.py checks this). Not thread-safe: the calculator
    holds a lock, and the web endpoint serves one request per container at
    a time.
    """
    import policyengine_us.system as us_system

    original = us_system.create_structural_reforms_from_parameters
    us_system.create_structural_reforms_from_parameters = lambda *args, **kwargs: None
    try:
        yield
    finally:
        us_system.create_structural_reforms_from_parameters = original


def _installed_pin() -> str:
    from importlib.metadata import version

    return f"policyengine-us=={version('policyengine-us')}"


class HouseholdCalculator:
    """Runs household calculations against pre-built tax-benefit systems.

    Building a reformed ``CountryTaxBenefitSystem`` takes seconds, so one
    system per distinct policy (plain current law, the Proposition NN and
    South Dakota current-law variants, and the six measures passing) is
    built once and shared across requests. Each request runs one
    simulation per policy: the income sweep, plus a copy of the household
    at the entered income when that income is off the sweep grid.
    """

    def __init__(self, measures: Optional[Iterable[Measure]] = None, check_pin: bool = True):
        from policyengine_us import CountryTaxBenefitSystem
        from policyengine_us.system import system as current_law

        if check_pin and _installed_pin() != POLICYENGINE_US_PIN:
            raise RuntimeError(
                f"Installed {_installed_pin()} does not match the dashboard pin "
                f"{POLICYENGINE_US_PIN}"
            )
        self.measures: Dict[str, Measure] = (
            dict(MEASURES) if measures is None else {m.slug: m for m in measures}
        )
        self.systems: Dict[str, Any] = {}
        self.policy_keys: Dict[Tuple[str, str], str] = {}
        for measure in self.measures.values():
            for policy, overrides in (
                ("baseline", measure.baseline_policy),
                ("reform", measure.reform_policy),
            ):
                key = policy_key(overrides)
                self.policy_keys[(measure.slug, policy)] = key
                if key not in self.systems:
                    self.systems[key] = (
                        current_law
                        if not overrides
                        else CountryTaxBenefitSystem(reform=build_reform(overrides))
                    )
        self._lock = threading.Lock()
        # Wall-clock, CPU and garbage-collection seconds of the last request.
        self.last_timings: Dict[str, float] = {}
        self.freeze()

    @staticmethod
    def freeze() -> None:
        """Exempt everything alive now (the systems and their warm caches)
        from Python's cyclic garbage collector.

        Each request's simulations are reference cycles, so only a full
        collection frees them; with millions of long-lived parameter
        objects in the heap, Python runs one only after the heap grows by
        a quarter, so memory climbs by gigabytes and the eventual
        collection stalls a request for seconds. Frozen objects are never
        scanned, which makes the full collection after each request cheap.
        Call again after warming the caches.
        """
        gc.collect()
        gc.freeze()

    def system(self, slug: str, policy: str):
        return self.systems[self.policy_keys[(slug, policy)]]

    def simulation(self, slug: str, policy: str, situation: Dict[str, Any]):
        from policyengine_us import Simulation

        with _prebuilt_structural_reforms():
            return Simulation(
                tax_benefit_system=self.system(slug, policy), situation=situation
            )

    @staticmethod
    def _arrays(sim, measure: Measure, year: int) -> Dict[str, np.ndarray]:
        """Every output for ``measure``, summed to the household.

        household_net_income comes first so every policy computes federal
        income tax on the same path (policyengine-us#9740).
        """
        return {
            key: np.asarray(sim.calculate(variable, year, map_to="household"), dtype=float)
            for key, variable in output_variables(measure)
        }

    @staticmethod
    def _filing_status(sim, year: int, i: int) -> str:
        status = sim.calculate("filing_status", year)
        if hasattr(status, "decode_to_str"):
            status = status.decode_to_str()
        return str(status[i])

    def calculate(self, household: HouseholdInput) -> Dict[str, Any]:
        measure = self.measures.get(household.measure)
        if measure is None:
            raise HouseholdInputError(f"{household.measure} is not served here")
        with self._lock:
            wall, cpu = time.perf_counter(), time.process_time()
            try:
                return self._calculate(household, measure)
            finally:
                simulated = time.perf_counter()
                # Free this request's simulations now (see freeze).
                gc.collect()
                self.last_timings = {
                    "seconds": round(time.perf_counter() - wall, 3),
                    "cpu_seconds": round(time.process_time() - cpu, 3),
                    "gc_seconds": round(time.perf_counter() - simulated, 3),
                }

    def _calculate(self, household: HouseholdInput, measure: Measure) -> Dict[str, Any]:
        year = household.year
        grid = sweep_grid(household.income, measure.sweep_max)
        step, count, index = grid
        # Off the grid, a copy of the household at the entered income rides
        # in the same simulation: household (and tax unit) results then
        # alternate sweep point, entered income.
        with_point = index is None
        situation = build_situation(household, axis=(step, count), with_point=with_point)
        stride = 2 if with_point else 1

        sweep_arrays: Dict[str, Dict[str, np.ndarray]] = {}
        point_values: Dict[str, Dict[str, float]] = {}
        filing_status = None
        for policy in POLICIES:
            sim = self.simulation(measure.slug, policy, situation)
            arrays = self._arrays(sim, measure, year)
            sweep_arrays[policy] = {k: v[::stride] for k, v in arrays.items()}
            point = 1 if with_point else index
            point_values[policy] = {k: float(v[point]) for k, v in arrays.items()}
            if policy == "baseline":
                wages = np.asarray(
                    sim.calculate("employment_income", year, map_to="household"),
                    dtype=float,
                ) - household.spouse_income
                if wages.shape != (count * stride,) or not (
                    np.allclose(wages[::stride], step * np.arange(count), atol=0.5)
                    and abs(wages[point] - household.income) < 0.5
                ):
                    raise RuntimeError("The sweep did not vary the head's wages as expected")
                filing_status = self._filing_status(sim, year, point)
        return assemble_response(household, grid, sweep_arrays, point_values, filing_status)


_calculator: Optional[HouseholdCalculator] = None


def calculate_household_impact(payload: Mapping[str, Any]) -> Dict[str, Any]:
    """Validate ``payload`` and run it through a shared calculator."""
    global _calculator
    household = HouseholdInput.from_dict(payload)
    if _calculator is None:
        _calculator = HouseholdCalculator()
    return _calculator.calculate(household)
