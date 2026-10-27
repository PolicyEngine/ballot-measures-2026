"""Tests for the household calculator (ballot_calc/household.py).

The fast tests cover input validation, the sweep grid, the situation
builder, the response layout and the policy-to-system mapping without
importing policyengine. The ``slow`` tests build the eight tax-benefit
systems and run one household per measure; they run on Modal
(scripts/modal_tests.py), not on a laptop.
"""

from __future__ import annotations

import math
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

from ballot_calc.config import POLICYENGINE_US_PIN
from ballot_calc.household import (
    COVERAGE_STATUSES,
    KIND_OUTPUTS,
    MAX_DEPENDENTS,
    MAX_INCOME,
    MAX_SWEEP_POINTS,
    NO_OPTION_REASONS,
    POLICIES,
    STATE_TAX_VARIABLES,
    SWEEP_STEPS,
    TEXT_OUTPUTS,
    HouseholdInput,
    HouseholdInputError,
    assemble_response,
    build_situation,
    decode_codes,
    example_id,
    example_payload,
    household_coverage,
    output_keys,
    output_variables,
    person_coverage,
    policy_key,
    sweep_grid,
)
from ballot_calc.measures import MEASURE_SLUGS, MEASURES

REPO_ROOT = Path(__file__).resolve().parent.parent

# The keys the frontend reads from every policy object, by measure kind.
EXPECTED_KEYS = {
    "income_tax": ["net_income", "state_tax", "federal_tax"],
    "tabor_refund": ["net_income", "state_tax", "federal_tax", "refund"],
    "school_meals": [
        "net_income",
        "state_tax",
        "federal_tax",
        "meal_value",
        "free_meals",
        "reduced_price_meals",
    ],
    "medicaid": [
        "net_income",
        "state_tax",
        "federal_tax",
        "medicaid",
        "ptc",
        "medicaid_enrolled",
        "marketplace_premium",
        "cash_net_income",
        "coverage_status",
        "no_option_reason",
    ],
}


def _payload(**overrides):
    payload = {"measure": "co-amendment-87", "age_head": 40, "income": 50_000}
    payload.update(overrides)
    return payload


EXAMPLES = [
    (measure, year, profile)
    for measure in MEASURES.values()
    for year in measure.years
    for profile in measure.example_profiles
]
EXAMPLE_IDS = [f"{m.slug}-{y}-{example_id(p['label'])}" for m, y, p in EXAMPLES]


# ---------------------------------------------------------------------------
# Input
# ---------------------------------------------------------------------------


class TestHouseholdInput:
    def test_minimal_payload_defaults(self):
        household = HouseholdInput.from_dict(_payload())
        assert household.year == MEASURES["co-amendment-87"].headline_year
        assert household.married is False
        assert household.age_spouse is None
        assert household.spouse_income == 0
        assert household.dependents == ()

    def test_full_payload(self):
        household = HouseholdInput.from_dict(
            {
                "measure": "wa-i-645",
                "year": 2029,
                "age_head": 58,
                "married": True,
                "age_spouse": 56,
                "spouse_income": 40_000,
                "income": 5_000_000,
                "dependents": [{"age": 9}, {"age": 15}],
            }
        )
        assert (household.year, household.age_spouse, household.spouse_income) == (
            2029,
            56,
            40_000,
        )
        assert household.dependents == (9, 15)

    def test_married_spouse_defaults_to_head_age(self):
        household = HouseholdInput.from_dict(_payload(married=True))
        assert household.age_spouse == 40

    def test_spouse_age_alone_means_married(self):
        household = HouseholdInput.from_dict(_payload(age_spouse=38))
        assert household.married and household.age_spouse == 38

    def test_single_filer_ignores_spouse_fields(self):
        household = HouseholdInput.from_dict(
            _payload(married=False, age_spouse=38, spouse_income=20_000)
        )
        assert (household.married, household.age_spouse, household.spouse_income) == (
            False,
            None,
            0,
        )

    def test_dependents_may_be_ages(self):
        household = HouseholdInput.from_dict(_payload(dependents=[3, {"age": 7}]))
        assert household.dependents == (3, 7)

    def test_numeric_strings_and_whole_floats(self):
        household = HouseholdInput.from_dict(
            _payload(measure="wa-i-645", year="2029", age_head="45", income="250000.0")
        )
        assert (household.year, household.age_head, household.income) == (
            2029,
            45,
            250_000,
        )

    def test_payload_round_trips(self):
        household = HouseholdInput.from_dict(
            _payload(married=True, spouse_income=1_234.5, dependents=[{"age": 4}])
        )
        payload = household.to_payload()
        assert payload == {
            "measure": "co-amendment-87",
            "year": 2027,
            "age_head": 40,
            "married": True,
            "age_spouse": 40,
            "spouse_income": 1_234.5,
            "income": 50_000,
            "dependents": [{"age": 4}],
        }
        assert HouseholdInput.from_dict(payload) == household

    @pytest.mark.parametrize(
        "payload",
        [
            {"age_head": 40, "income": 0},
            _payload(measure="co-prop-137"),
            _payload(measure=["co-amendment-87"]),
            _payload(year=2026),
            _payload(measure="wa-i-645", year=2030),
            _payload(year=2027.5),
            _payload(year=True),
            {"measure": "co-amendment-87", "income": 0},
            _payload(age_head=17),
            _payload(age_head=111),
            _payload(age_head=30.5),
            _payload(age_head="thirty"),
            {"measure": "co-amendment-87", "age_head": 40},
            _payload(income=-1),
            _payload(income=MAX_INCOME + 1),
            _payload(income=float("nan")),
            _payload(income=float("inf")),
            _payload(income=True),
            _payload(income=[]),
            _payload(married="yes"),
            _payload(married=True, age_spouse=12),
            _payload(married=True, spouse_income=-5),
            _payload(dependents=[{"age": 5}] * (MAX_DEPENDENTS + 1)),
            _payload(dependents=[{"age": -1}]),
            _payload(dependents=[{"name": "kid"}]),
            _payload(dependents="2 kids"),
        ],
    )
    def test_rejects_invalid_payloads(self, payload):
        with pytest.raises(HouseholdInputError):
            HouseholdInput.from_dict(payload)

    @pytest.mark.parametrize("payload", [None, [], "measure=co-amendment-87"])
    def test_rejects_non_objects(self, payload):
        with pytest.raises(HouseholdInputError):
            HouseholdInput.from_dict(payload)

    def test_input_errors_are_value_errors(self):
        """The endpoint maps ValueError to a 422."""
        assert issubclass(HouseholdInputError, ValueError)

    @pytest.mark.parametrize("measure, year, profile", EXAMPLES, ids=EXAMPLE_IDS)
    def test_every_example_profile_is_a_valid_request(self, measure, year, profile):
        payload = example_payload(measure, profile, year)
        household = HouseholdInput.from_dict(payload)
        assert household.income == profile["income"]
        assert household.married == profile["married"]
        assert household.dependents == tuple(profile["dependents"])
        assert HouseholdInput.from_dict(household.to_payload()) == household

    def test_example_ids_are_unique_within_each_measure(self):
        for measure in MEASURES.values():
            ids = [example_id(p["label"]) for p in measure.example_profiles]
            assert len(set(ids)) == len(ids), measure.slug
            assert all(i and i == i.strip("-") for i in ids)


# ---------------------------------------------------------------------------
# Sweep grid and situation
# ---------------------------------------------------------------------------


class TestSweepGrid:
    @pytest.mark.parametrize("slug", MEASURE_SLUGS)
    def test_default_grid_is_round_and_bounded(self, slug):
        measure = MEASURES[slug]
        step, count, index = sweep_grid(0, measure.sweep_max)
        assert step in SWEEP_STEPS
        assert 60 <= count <= MAX_SWEEP_POINTS
        assert step * (count - 1) >= measure.sweep_max
        assert step * (count - 2) < measure.sweep_max
        assert index == 0

    @pytest.mark.parametrize(
        "income, sweep_max",
        [
            (0, 60_000),
            (14_000, 60_000),
            (14_250, 60_000),
            (45_000, 1_300_000),
            (1_200_000, 1_300_000),
            (2_000_000, 1_300_000),
            (5_000_000, 5_000_000),
            (12_345_678, 5_000_000),
            (MAX_INCOME, 3_000_000),
            (100.5, 150_000),
        ],
    )
    def test_grid_covers_income_and_finds_it(self, income, sweep_max):
        step, count, index = sweep_grid(income, sweep_max)
        top = max(income, sweep_max)
        assert count <= MAX_SWEEP_POINTS
        assert step * (count - 1) >= top
        if index is None:
            assert not (float(income).is_integer() and int(income) % step == 0)
        else:
            assert index * step == income
            assert 0 <= index < count

    def test_known_grids(self):
        assert sweep_grid(1_200_000, 1_300_000) == (10_000, 131, 120)
        assert sweep_grid(45_000, 1_300_000) == (10_000, 131, None)
        assert sweep_grid(40_000, 400_000) == (5_000, 81, 8)
        assert sweep_grid(20_000, 60_000) == (500, 121, 40)
        assert sweep_grid(5_000_000, 5_000_000) == (50_000, 101, 100)


class TestBuildSituation:
    def test_sweep_situation(self):
        household = HouseholdInput.from_dict(
            {
                "measure": "nd-measure-2",
                "age_head": 38,
                "married": True,
                "age_spouse": 36,
                "spouse_income": 10_000,
                "income": 55_000,
                "dependents": [7, 10],
            }
        )
        situation = build_situation(household, axis=(2_000, 76))
        y = "2028"
        people = situation["people"]
        assert list(people) == ["you", "your partner", "dependent_1", "dependent_2"]
        assert people["you"]["employment_income"] == {y: None}
        assert people["your partner"]["employment_income"] == {y: 10_000}
        assert people["you"]["is_tax_unit_head"] == {y: True}
        assert people["your partner"]["is_tax_unit_spouse"] == {y: True}
        assert people["dependent_1"]["is_tax_unit_dependent"] == {y: True}
        assert people["dependent_2"]["age"] == {y: 10}
        assert situation["households"]["your household"]["state_code"] == {y: "ND"}
        assert situation["marital_units"]["your marital unit"]["members"] == [
            "you",
            "your partner",
        ]
        assert situation["marital_units"]["dependent_1's marital unit"] == {
            "members": ["dependent_1"]
        }
        for unit in ("families", "spm_units", "tax_units", "households"):
            (group,) = situation[unit].values()
            assert group["members"] == list(people)
        (axis,) = situation["axes"][0]
        assert axis == {
            "name": "employment_income",
            "min": 0,
            "max": 150_000,
            "count": 76,
            "period": y,
            "target": "person",
        }

    def test_point_situation(self):
        household = HouseholdInput.from_dict(
            {"measure": "sd-amendment-i", "age_head": 30, "income": 14_250}
        )
        situation = build_situation(household)
        assert "axes" not in situation
        assert situation["people"]["you"]["employment_income"] == {"2028": 14_250}
        assert list(situation["people"]) == ["you"]
        assert situation["households"]["your household"]["state_code"] == {"2028": "SD"}

    def test_off_grid_income_rides_along_as_a_second_household(self):
        """The swept head must be the first person (the axis varies person 0
        of each copy); the point copy is a separate household with its own
        units, earning the entered income."""
        household = HouseholdInput.from_dict(
            {
                "measure": "co-amendment-87",
                "age_head": 40,
                "married": True,
                "spouse_income": 5_000,
                "income": 47_300,
                "dependents": [6],
            }
        )
        situation = build_situation(household, axis=(10_000, 131), with_point=True)
        people = situation["people"]
        assert list(people) == [
            "you",
            "your partner",
            "dependent_1",
            "point_you",
            "point_your partner",
            "point_dependent_1",
        ]
        assert people["you"]["employment_income"] == {"2027": None}
        assert people["point_you"]["employment_income"] == {"2027": 47_300}
        assert people["point_your partner"]["employment_income"] == {"2027": 5_000}
        for group in ("families", "spm_units", "tax_units", "households"):
            members = [unit["members"] for unit in situation[group].values()]
            assert members == [
                ["you", "your partner", "dependent_1"],
                ["point_you", "point_your partner", "point_dependent_1"],
            ]
        assert situation["households"]["point_your household"]["state_code"] == {
            "2027": "CO"
        }
        assert len(situation["marital_units"]) == 4
        assert situation["axes"][0][0]["count"] == 131

    def test_point_copy_needs_an_axis(self):
        household = HouseholdInput.from_dict(_payload())
        assert build_situation(household, with_point=True) == build_situation(household)

    @pytest.mark.parametrize("slug", MEASURE_SLUGS)
    def test_each_measure_uses_its_state_and_year(self, slug):
        measure = MEASURES[slug]
        household = HouseholdInput.from_dict(
            {"measure": slug, "age_head": 40, "income": 0}
        )
        situation = build_situation(household, axis=(1_000, 3))
        y = str(measure.headline_year)
        assert situation["households"]["your household"]["state_code"] == {
            y: measure.state
        }
        assert situation["axes"][0][0]["period"] == y


# ---------------------------------------------------------------------------
# Outputs, policies and response layout
# ---------------------------------------------------------------------------


class TestOutputs:
    @pytest.mark.parametrize("slug", MEASURE_SLUGS)
    def test_output_keys_match_the_frontend_contract(self, slug):
        measure = MEASURES[slug]
        assert output_keys(measure) == EXPECTED_KEYS[measure.kind]

    def test_net_income_is_computed_first(self):
        """household_net_income first, so every policy computes federal
        income tax on the same path (policyengine-us#9740)."""
        for measure in MEASURES.values():
            assert output_variables(measure)[0] == (
                "net_income",
                "household_net_income",
            )

    def test_state_tax_variables(self):
        variables = {
            slug: dict(output_variables(m))["state_tax"] for slug, m in MEASURES.items()
        }
        assert variables == {
            "co-amendment-87": "co_income_tax",
            "co-prop-nn": "co_income_tax",
            "ca-prop-3": "ca_income_tax",
            "wa-i-645": "wa_income_tax",
            "nd-measure-2": "state_income_tax",
            "sd-amendment-i": "state_income_tax",
        }
        assert set(STATE_TAX_VARIABLES) == {m.state for m in MEASURES.values()}

    def test_kind_variables(self):
        assert dict(KIND_OUTPUTS["tabor_refund"]) == {"refund": "co_sales_tax_refund"}
        assert dict(KIND_OUTPUTS["school_meals"]) == {
            "meal_value": "school_meal_net_subsidy",
            "free_meals": "free_school_meals",
            "reduced_price_meals": "reduced_price_school_meals",
        }
        assert dict(KIND_OUTPUTS["medicaid"]) == {
            "medicaid": "medicaid",
            "ptc": "assigned_aca_ptc",
            "medicaid_enrolled": "medicaid_enrolled",
            "marketplace_premium": "marketplace_net_premium",
        }


class TestPolicies:
    def _keys(self):
        return {
            (slug, policy): policy_key(
                m.baseline_policy if policy == "baseline" else m.reform_policy
            )
            for slug, m in MEASURES.items()
            for policy in POLICIES
        }

    def test_eight_distinct_systems(self):
        """Plain current law (five baselines, including Proposition NN's now
        that policyengine-us carries the forecast refund tiers), the South
        Dakota current-law variant, and six reforms."""
        keys = self._keys()
        assert len(set(keys.values())) == 8
        shared = {
            keys[(slug, "baseline")]
            for slug in (
                "co-amendment-87",
                "co-prop-nn",
                "ca-prop-3",
                "wa-i-645",
                "nd-measure-2",
            )
        }
        assert len(shared) == 1
        assert shared.isdisjoint({keys[("sd-amendment-i", "baseline")]})

    def test_reform_differs_from_baseline(self):
        keys = self._keys()
        for slug in MEASURE_SLUGS:
            assert keys[(slug, "baseline")] != keys[(slug, "reform")]

    def test_key_is_stable_and_handles_infinity(self):
        sd = MEASURES["sd-amendment-i"]
        assert any(
            isinstance(v, float) and math.isinf(v)
            for periods in sd.reform_policy.values()
            for v in periods.values()
        )
        assert policy_key(sd.reform_policy) == policy_key(
            dict(reversed(sd.reform_policy.items()))
        )
        assert policy_key({}) != policy_key(sd.baseline_policy)


class TestCoverage:
    """Coverage of the household's adults for the Medicaid measure."""

    def _person(self, **flags):
        names = (
            "medicaid",
            "medicare",
            "subsidized",
            "work_requirement",
            "below_poverty_line",
            "above_subsidy_limit",
        )
        status, reason = person_coverage(**{n: [flags.get(n, False)] for n in names})
        return (
            decode_codes(status, COVERAGE_STATUSES)[0],
            decode_codes(reason, NO_OPTION_REASONS)[0],
        )

    @pytest.mark.parametrize(
        "flags, expected",
        [
            ({"medicaid": True}, ("medicaid", None)),
            # Enrollment wins over everything else, including Medicare.
            ({"medicaid": True, "medicare": True}, ("medicaid", None)),
            ({"medicaid": True, "below_poverty_line": True}, ("medicaid", None)),
            ({"medicare": True, "below_poverty_line": True}, ("medicare", None)),
            ({"subsidized": True}, ("subsidized_marketplace", None)),
            # Current law below about $6,960 of wages: the work requirement
            # bars Medicaid and the credit, though income is also below the
            # poverty line.
            (
                {"work_requirement": True, "below_poverty_line": True},
                ("no_subsidized_option", "work_requirement"),
            ),
            # No expansion and income below the poverty line: the gap.
            (
                {"below_poverty_line": True},
                ("no_subsidized_option", "below_poverty_line"),
            ),
            (
                {"above_subsidy_limit": True},
                ("no_subsidized_option", "above_subsidy_limit"),
            ),
            ({}, ("no_subsidized_option", "other")),
        ],
    )
    def test_person_status_and_reason(self, flags, expected):
        assert self._person(**flags) == expected

    def test_household_follows_the_head(self):
        """Three households: single on Medicaid; a couple in the gap; a
        couple with a subsidized plan whose spouse is 65 or older."""
        status, reason = household_coverage(
            head_status=[1, 4, 3],
            head_reason=[0, 2, 0],
            head_medicare=[0, 0, 0],
            spouse_status=[0, 4, 2],
            spouse_reason=[0, 2, 0],
            spouse_medicare=[0, 0, 1],
        )
        assert decode_codes(status, COVERAGE_STATUSES).tolist() == [
            "medicaid",
            "no_subsidized_option",
            "subsidized_marketplace",
        ]
        assert decode_codes(reason, NO_OPTION_REASONS).tolist() == [
            None,
            "below_poverty_line",
            None,
        ]

    def test_household_follows_a_spouse_under_65_when_the_head_is_65_or_older(self):
        """Head on Medicare with a spouse in the gap; head on Medicaid
        through the aged group with a spouse on a subsidized plan; both 65
        or older; a single head on Medicare."""
        status, reason = household_coverage(
            head_status=[2, 1, 2, 2],
            head_reason=[0, 0, 0, 0],
            head_medicare=[1, 1, 1, 1],
            spouse_status=[4, 3, 2, 0],
            spouse_reason=[2, 0, 0, 0],
            spouse_medicare=[0, 0, 1, 0],
        )
        assert decode_codes(status, COVERAGE_STATUSES).tolist() == [
            "no_subsidized_option",
            "subsidized_marketplace",
            "medicare",
            "medicare",
        ]
        assert decode_codes(reason, NO_OPTION_REASONS).tolist() == [
            "below_poverty_line",
            None,
            None,
            None,
        ]

    def test_text_outputs(self):
        assert TEXT_OUTPUTS == {"coverage_status", "no_option_reason"}
        assert set(TEXT_OUTPUTS) <= set(EXPECTED_KEYS["medicaid"])


def _fake_arrays(measure, count, offset=0.0):
    arrays = {}
    for i, key in enumerate(output_keys(measure)):
        if key == "coverage_status":
            arrays[key] = np.array(
                ["medicaid", "no_subsidized_option"] * count, dtype=object
            )[:count]
        elif key == "no_option_reason":
            arrays[key] = np.array([None, "work_requirement"] * count, dtype=object)[
                :count
            ]
        else:
            arrays[key] = np.arange(count, dtype=float) * (i + 1) + offset + 0.004
    return arrays


class TestAssembleResponse:
    @pytest.mark.parametrize("slug", MEASURE_SLUGS)
    def test_layout(self, slug):
        measure = MEASURES[slug]
        household = HouseholdInput.from_dict(
            {"measure": slug, "age_head": 40, "income": 0}
        )
        grid = (1_000, 5, 0)
        sweep = {
            p: _fake_arrays(measure, 5, offset=o) for p, o in zip(POLICIES, (0, 10))
        }
        point = {p: {k: v[1] for k, v in sweep[p].items()} for p in POLICIES}
        response = assemble_response(household, grid, sweep, point, "SINGLE")
        assert set(response) == {
            "measure",
            "year",
            "state",
            "kind",
            "pin",
            "income",
            "filing_status",
            "income_range",
            "income_index",
            "sweep",
            "at_income",
        }
        assert response["measure"] == slug
        assert response["year"] == measure.headline_year
        assert response["state"] == measure.state
        assert response["kind"] == measure.kind
        assert response["pin"] == POLICYENGINE_US_PIN
        assert response["income_range"] == [0.0, 1_000.0, 2_000.0, 3_000.0, 4_000.0]
        assert response["income_index"] == 0
        for policy in POLICIES:
            assert list(response["sweep"][policy]) == output_keys(measure)
            assert list(response["at_income"][policy]) == output_keys(measure)
            for key, series in response["sweep"][policy].items():
                assert len(series) == 5
                if key in TEXT_OUTPUTS:
                    assert all(v is None or isinstance(v, str) for v in series)
                else:
                    assert all(
                        isinstance(v, float) and v == round(v, 2) for v in series
                    )
        assert response["at_income"]["reform"]["net_income"] == 11.0
        if measure.kind == "medicaid":
            assert response["sweep"]["baseline"]["coverage_status"] == [
                "medicaid",
                "no_subsidized_option",
            ] * 2 + ["medicaid"]
            assert response["sweep"]["baseline"]["no_option_reason"][:2] == [
                None,
                "work_requirement",
            ]
            point = response["at_income"]["reform"]
            assert point["coverage_status"] == "no_subsidized_option"
            assert point["no_option_reason"] == "work_requirement"
            assert isinstance(point["cash_net_income"], float)

    def test_rejects_misaligned_sweeps(self):
        measure = MEASURES["co-prop-nn"]
        household = HouseholdInput.from_dict(
            {"measure": "co-prop-nn", "age_head": 40, "income": 0}
        )
        sweep = {p: _fake_arrays(measure, 4) for p in POLICIES}
        point = {p: {k: 0.0 for k in output_keys(measure)} for p in POLICIES}
        with pytest.raises(RuntimeError):
            assemble_response(household, (1_000, 5, 0), sweep, point, None)


def test_fast_paths_do_not_import_policyengine():
    """Input validation, the grid and the situation builder must not load
    the model (the endpoint validates before touching it, and the fast
    tests run without it)."""
    code = (
        "import sys\n"
        "from ballot_calc.household import HouseholdInput, build_situation, sweep_grid\n"
        "h = HouseholdInput.from_dict({'measure': 'ca-prop-3', 'age_head': 40, 'income': 1})\n"
        "build_situation(h, axis=sweep_grid(1, 3_000_000)[:2])\n"
        "loaded = [m for m in sys.modules if m.startswith('policyengine')]\n"
        "assert not loaded, loaded\n"
    )
    subprocess.run([sys.executable, "-c", code], cwd=REPO_ROOT, check=True)


# ---------------------------------------------------------------------------
# Slow: one household per measure, run on Modal
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def household_calculator():
    from ballot_calc.household import HouseholdCalculator

    return HouseholdCalculator()


def _run(calculator, **payload):
    return calculator.calculate(HouseholdInput.from_dict(payload))


def _change(response, key):
    at = response["at_income"]
    return at["reform"][key] - at["baseline"][key]


def _assert_tax_only(response):
    """Nothing but income taxes moves: net income changes by minus the
    change in state and federal income tax."""
    assert _change(response, "net_income") == pytest.approx(
        -(_change(response, "state_tax") + _change(response, "federal_tax")), abs=1
    )


@pytest.mark.slow
def test_co_amendment_87_top_earners_pay_more(household_calculator):
    """Married couple, $1.2M of wages, two children: the 7.4%-8.4% brackets
    above $500,000 exceed the 4.4% flat rate."""
    response = _run(
        household_calculator,
        measure="co-amendment-87",
        year=2027,
        age_head=50,
        married=True,
        income=1_200_000,
        dependents=[13, 16],
    )
    assert response["filing_status"] == "JOINT"
    assert _change(response, "state_tax") > 10_000
    _assert_tax_only(response)


@pytest.mark.slow
@pytest.mark.parametrize("year, refund", [(2027, 43), (2028, 47)])
def test_co_prop_nn_single_filer_loses_the_refund(household_calculator, year, refund):
    """Single filer, $40,000: the LCS September 2026 first-tier refund."""
    response = _run(
        household_calculator,
        measure="co-prop-nn",
        year=year,
        age_head=30,
        income=40_000,
    )
    at = response["at_income"]
    assert at["baseline"]["refund"] == refund
    assert at["reform"]["refund"] == 0
    assert _change(response, "state_tax") == pytest.approx(refund, abs=0.01)
    assert _change(response, "net_income") == pytest.approx(-refund, abs=0.01)


@pytest.mark.slow
def test_ca_prop_3_keeps_the_top_rates_in_2031(household_calculator):
    """Married couple, $1.5M of wages: above the 10.3%, 11.3% and 12.3%
    joint thresholds, which current law ends after 2030."""
    response = _run(
        household_calculator,
        measure="ca-prop-3",
        year=2031,
        age_head=50,
        married=True,
        income=1_500_000,
    )
    assert _change(response, "state_tax") > 10_000
    _assert_tax_only(response)


@pytest.mark.slow
def test_wa_i_645_repeals_the_millionaires_tax(household_calculator):
    """Married couple, $2M of wages: 9.9% of income above the $1M deduction."""
    response = _run(
        household_calculator,
        measure="wa-i-645",
        year=2028,
        age_head=55,
        married=True,
        income=2_000_000,
    )
    assert _change(response, "state_tax") == pytest.approx(-0.099 * 1_000_000, abs=1)
    _assert_tax_only(response)


@pytest.mark.slow
def test_nd_measure_2_makes_meals_free(household_calculator):
    """Married couple, $100,000 (about 300% of the poverty guideline for
    four), children 7 and 10: paid meals under current law, free meals
    for both children if the measure passes."""
    response = _run(
        household_calculator,
        measure="nd-measure-2",
        year=2028,
        age_head=38,
        married=True,
        income=100_000,
        dependents=[7, 10],
    )
    at = response["at_income"]
    assert at["baseline"]["meal_value"] == 0
    assert at["reform"]["free_meals"] == pytest.approx(at["reform"]["meal_value"])
    assert at["reform"]["meal_value"] > 1_000
    assert _change(response, "net_income") == pytest.approx(
        _change(response, "meal_value"), abs=1
    )


@pytest.mark.slow
@pytest.mark.parametrize(
    "income, gets_ptc",
    # About 125% and 85% of the poverty guideline for one.
    [(20_000, True), (14_000, False)],
)
def test_sd_amendment_i_ends_expansion_coverage(household_calculator, income, gets_ptc):
    """A single adult loses expansion Medicaid. Above the poverty line the
    premium tax credit replaces part of it; below it there is no credit
    (the coverage gap)."""
    response = _run(
        household_calculator,
        measure="sd-amendment-i",
        year=2028,
        age_head=40,
        income=income,
    )
    at = response["at_income"]
    assert at["baseline"]["medicaid_enrolled"] == 1
    assert at["baseline"]["medicaid"] > 0
    assert at["reform"]["medicaid_enrolled"] == 0
    assert at["reform"]["medicaid"] == 0
    assert (at["reform"]["ptc"] > 0) is gets_ptc
    # Health benefits count in net income in both policies.
    assert _change(response, "net_income") == pytest.approx(
        _change(response, "medicaid")
        + _change(response, "ptc")
        - _change(response, "marketplace_premium"),
        abs=1,
    )
    # Coverage, and the cash change: only the premium the adult pays.
    assert at["baseline"]["coverage_status"] == "medicaid"
    assert at["baseline"]["no_option_reason"] is None
    if gets_ptc:
        assert at["reform"]["coverage_status"] == "subsidized_marketplace"
        assert at["reform"]["no_option_reason"] is None
        assert at["reform"]["marketplace_premium"] > 0
    else:
        assert at["reform"]["coverage_status"] == "no_subsidized_option"
        assert at["reform"]["no_option_reason"] == "below_poverty_line"
        assert at["reform"]["marketplace_premium"] == 0
    assert _change(response, "cash_net_income") == pytest.approx(
        -_change(response, "marketplace_premium"), abs=0.02
    )
    for policy in POLICIES:
        point = at[policy]
        assert point["cash_net_income"] == pytest.approx(
            point["net_income"] - point["medicaid"] - point["ptc"], abs=0.02
        )


@pytest.mark.slow
def test_sd_amendment_i_coverage_along_the_sweep(household_calculator):
    """Single adult, 40. Current law: below about $6,960 of wages the adult
    fails Medicaid's work requirement, which also bars the credit; then
    expansion Medicaid to 138% of the poverty guideline; then the credit.
    In the scenario: the coverage gap below 100%, then the credit."""
    response = _run(
        household_calculator,
        measure="sd-amendment-i",
        year=2028,
        age_head=40,
        income=5_000,
    )
    incomes = response["income_range"]
    sweep = response["sweep"]

    def status_at(policy, income):
        i = incomes.index(income)
        return sweep[policy]["coverage_status"][i], sweep[policy]["no_option_reason"][i]

    assert status_at("baseline", 0) == ("no_subsidized_option", "work_requirement")
    assert status_at("baseline", 6_500) == ("no_subsidized_option", "work_requirement")
    assert status_at("baseline", 7_500) == ("medicaid", None)
    assert status_at("baseline", 20_000) == ("medicaid", None)
    assert status_at("baseline", 40_000) == ("subsidized_marketplace", None)
    assert status_at("reform", 0) == ("no_subsidized_option", "below_poverty_line")
    assert status_at("reform", 7_500) == ("no_subsidized_option", "below_poverty_line")
    assert status_at("reform", 20_000) == ("subsidized_marketplace", None)
    assert status_at("reform", 40_000) == ("subsidized_marketplace", None)
    # The entered $5,000 is on the grid, below the work requirement.
    assert (
        response["at_income"]["baseline"]["coverage_status"] == "no_subsidized_option"
    )
    assert response["at_income"]["baseline"]["no_option_reason"] == "work_requirement"
    assert set(sweep["baseline"]["coverage_status"]) <= set(COVERAGE_STATUSES)
    assert set(sweep["reform"]["no_option_reason"]) <= {None, *NO_OPTION_REASONS}


@pytest.mark.slow
def test_sd_amendment_i_couple_with_a_spouse_on_medicare(household_calculator):
    """Head 67 (Medicare), spouse 60, $18,000 of wages (about 80% of the
    poverty guideline for two): the household's status is the spouse's,
    Medicaid under current law and the coverage gap in the scenario."""
    response = _run(
        household_calculator,
        measure="sd-amendment-i",
        year=2028,
        age_head=67,
        married=True,
        age_spouse=60,
        income=18_000,
    )
    at = response["at_income"]
    assert at["baseline"]["coverage_status"] == "medicaid"
    assert at["reform"]["coverage_status"] == "no_subsidized_option"
    assert at["reform"]["no_option_reason"] == "below_poverty_line"
    # An older single adult keeps Medicare either way.
    older = _run(
        household_calculator,
        measure="sd-amendment-i",
        year=2028,
        age_head=70,
        income=30_000,
    )
    for policy in POLICIES:
        assert older["at_income"][policy]["coverage_status"] == "medicare"


@pytest.mark.slow
def test_sweep_matches_the_point_values(household_calculator):
    """On the grid, at_income is the sweep at income_index. Off the grid it
    comes from a copy of the household riding in the sweep simulation; it
    must equal a standalone simulation at that income and leave the sweep
    unchanged."""
    on = _run(
        household_calculator,
        measure="co-prop-nn",
        year=2027,
        age_head=30,
        income=95_000,
    )
    assert on["income_range"][on["income_index"]] == 95_000
    for policy in POLICIES:
        for key, value in on["at_income"][policy].items():
            assert on["sweep"][policy][key][on["income_index"]] == pytest.approx(
                value, abs=0.01
            )

    payload = dict(
        measure="co-prop-nn", year=2027, age_head=30, married=True, income=95_500
    )
    off = _run(household_calculator, dependents=[4], **payload)
    on_grid = _run(
        household_calculator, dependents=[4], **{**payload, "income": 95_000}
    )
    assert off["income_index"] is None
    assert off["sweep"] == on_grid["sweep"]
    household = HouseholdInput.from_dict({**payload, "dependents": [4]})
    measure = MEASURES["co-prop-nn"]
    for policy in POLICIES:
        alone = household_calculator.simulation(
            measure.slug, policy, build_situation(household)
        )
        for key, variable in output_variables(measure):
            expected = float(alone.calculate(variable, 2027, map_to="household")[0])
            assert off["at_income"][policy][key] == pytest.approx(expected, abs=0.01), (
                key
            )
    assert off["filing_status"] == "JOINT"


@pytest.mark.slow
@pytest.mark.parametrize(
    "payload",
    [
        {
            "measure": "ca-prop-3",
            "year": 2031,
            "age_head": 55,
            "married": True,
            "income": 3_000_000,
        },
        {"measure": "co-amendment-87", "year": 2027, "age_head": 50, "income": 700_000},
        {"measure": "sd-amendment-i", "year": 2028, "age_head": 45, "income": 20_000},
    ],
    ids=lambda p: p["measure"],
)
def test_skipping_the_structural_pass_matches_the_standard_path(
    household_calculator, payload
):
    """The calculator skips Simulation's structural-reform pass because its
    prebuilt systems already include it (California Proposition 3 is a
    structural contributed reform). Results must equal the standard
    ``Simulation(situation, reform=...)`` path."""
    from policyengine_us import Simulation

    from ballot_calc.household import build_reform

    household = HouseholdInput.from_dict(payload)
    measure = MEASURES[household.measure]
    step, count, _ = sweep_grid(household.income, measure.sweep_max)
    situation = build_situation(household, axis=(step, count))
    fast = household_calculator.simulation(measure.slug, "reform", situation)
    standard = Simulation(
        situation=situation, reform=build_reform(measure.reform_policy)
    )
    for _, variable in output_variables(measure):
        np.testing.assert_allclose(
            fast.calculate(variable, household.year, map_to="household"),
            standard.calculate(variable, household.year, map_to="household"),
            atol=0.01,
            err_msg=variable,
        )
