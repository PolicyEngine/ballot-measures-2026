"""Checks on frontend/public/data/example_households.json.

The household tab reads this file for its example cards (and falls back
to it when the API is unreachable), so these tests pin its shape to the
household API's response, its examples to the registry, and each
measure's examples to the direction the measure must move them. Pure JSON
checks: nothing here runs PolicyEngine. The file comes from
scripts/compute_example_households.py.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import pytest

from ballot_calc.config import POLICYENGINE_US_PIN
from ballot_calc.household import (
    COVERAGE_STATUSES,
    MAX_SWEEP_POINTS,
    NO_OPTION_REASONS,
    POLICIES,
    TEXT_OUTPUTS,
    example_id,
    example_payload,
    output_keys,
)
from ballot_calc.measures import MEASURES

PATH = (
    Path(__file__).resolve().parent.parent
    / "frontend"
    / "public"
    / "data"
    / "example_households.json"
)


@pytest.fixture(scope="module")
def payload() -> dict:
    if not PATH.exists():
        pytest.skip("example_households.json not generated yet")
    return json.loads(PATH.read_text(encoding="utf-8"))


def _households(payload):
    for slug, entry in payload["measures"].items():
        for year, block in entry["years"].items():
            for household in block["households"]:
                yield MEASURES[slug], int(year), household


def _example_response(payload, slug, year, household_id):
    for household in payload["measures"][slug]["years"][str(year)]["households"]:
        if household["id"] == household_id:
            return household["response"]
    raise AssertionError(f"no example {household_id} for {slug} {year}")


def _example(payload, slug, year, household_id):
    return _example_response(payload, slug, year, household_id)["at_income"]


def _change(at, key):
    return at["reform"][key] - at["baseline"][key]


def test_header(payload):
    assert set(payload) == {"pin", "generated_at_utc", "measures"}
    assert payload["pin"] == POLICYENGINE_US_PIN
    assert payload["generated_at_utc"].endswith("Z")
    datetime.fromisoformat(payload["generated_at_utc"].replace("Z", "+00:00"))


def test_every_measure_and_year_is_covered(payload):
    assert set(payload["measures"]) == set(MEASURES)
    for slug, entry in payload["measures"].items():
        assert set(entry) == {"years"}
        assert set(entry["years"]) == {str(y) for y in MEASURES[slug].years}


def test_examples_match_the_registry(payload):
    """Every example profile, in registry order, with the request the
    registry implies today (a stale file fails here)."""
    for slug, entry in payload["measures"].items():
        measure = MEASURES[slug]
        for year, block in entry["years"].items():
            households = block["households"]
            assert [h["id"] for h in households] == [
                example_id(p["label"]) for p in measure.example_profiles
            ]
            for household, profile in zip(households, measure.example_profiles):
                assert set(household) == {"id", "label", "input", "response"}
                assert household["label"] == profile["label"]
                assert household["input"] == example_payload(
                    measure, profile, int(year)
                )


def test_responses_have_the_api_shape(payload):
    for measure, year, household in _households(payload):
        response = household["response"]
        name = f"{measure.slug} {year} {household['id']}"
        assert response["measure"] == measure.slug, name
        assert response["year"] == year, name
        assert response["state"] == measure.state, name
        assert response["kind"] == measure.kind, name
        assert response["pin"] == POLICYENGINE_US_PIN, name
        assert response["income"] == household["input"]["income"], name
        assert isinstance(response["filing_status"], str), name

        incomes = response["income_range"]
        n = len(incomes)
        assert 2 <= n <= MAX_SWEEP_POINTS, name
        step = incomes[1] - incomes[0]
        assert incomes[0] == 0 and step > 0, name
        assert all(b - a == step for a, b in zip(incomes, incomes[1:])), name
        assert incomes[-1] >= max(measure.sweep_max, response["income"]), name

        index = response["income_index"]
        if index is None:
            assert response["income"] not in incomes, name
        else:
            assert incomes[index] == response["income"], name

        keys = output_keys(measure)
        assert set(response["sweep"]) == set(POLICIES), name
        assert set(response["at_income"]) == set(POLICIES), name
        for policy in POLICIES:
            assert list(response["sweep"][policy]) == keys, name
            assert list(response["at_income"][policy]) == keys, name
            for key, series in response["sweep"][policy].items():
                label = f"{name} {policy}.{key}"
                assert len(series) == n, label
                point = response["at_income"][policy][key]
                if key in TEXT_OUTPUTS:
                    allowed = (
                        set(COVERAGE_STATUSES)
                        if key == "coverage_status"
                        else {None, *NO_OPTION_REASONS}
                    )
                    assert set(series) <= allowed and point in allowed, label
                    if index is not None:
                        assert series[index] == point, label
                else:
                    assert all(isinstance(v, (int, float)) for v in series), label
                    if index is not None:
                        assert series[index] == pytest.approx(point, abs=0.01), label


def test_no_option_reason_goes_with_no_subsidized_option(payload):
    for measure, year, household in _households(payload):
        if measure.kind != "medicaid":
            continue
        response = household["response"]
        for policy in POLICIES:
            points = list(
                zip(
                    response["sweep"][policy]["coverage_status"],
                    response["sweep"][policy]["no_option_reason"],
                )
            )
            at = response["at_income"][policy]
            points.append((at["coverage_status"], at["no_option_reason"]))
            for status, reason in points:
                assert (reason is not None) == (status == "no_subsidized_option"), (
                    measure.slug,
                    household["id"],
                    policy,
                )


def test_changes_add_up(payload):
    """Net income moves by exactly what the measure changes: income taxes
    for the tax measures (and the refund, a refundable state credit), meal
    value for North Dakota, and health benefits less marketplace premiums
    for South Dakota."""
    for measure, year, household in _households(payload):
        at = household["response"]["at_income"]
        name = f"{measure.slug} {year} {household['id']}"
        if measure.kind in ("income_tax", "tabor_refund"):
            expected = -(_change(at, "state_tax") + _change(at, "federal_tax"))
        elif measure.kind == "school_meals":
            expected = _change(at, "meal_value")
            assert _change(at, "state_tax") == pytest.approx(0, abs=0.01), name
        else:
            # Health benefits count in net income: the value of Medicaid and
            # the credit, less the premium the household pays.
            expected = (
                _change(at, "medicaid")
                + _change(at, "ptc")
                - _change(at, "marketplace_premium")
            )
            # The cash change is the premium alone: taxes don't move.
            assert _change(at, "state_tax") == pytest.approx(0, abs=0.01), name
            assert _change(at, "federal_tax") == pytest.approx(0, abs=0.01), name
            assert _change(at, "cash_net_income") == pytest.approx(
                -_change(at, "marketplace_premium"), abs=0.02
            ), name
            assert _change(at, "cash_net_income") == pytest.approx(
                _change(at, "net_income")
                - _change(at, "medicaid")
                - _change(at, "ptc"),
                abs=0.02,
            ), name
        assert _change(at, "net_income") == pytest.approx(expected, abs=1), name


# The direction each measure must move its examples.


def test_co_amendment_87(payload):
    top = _example(payload, "co-amendment-87", 2027, "married-couple-1-2m-wages-2-kids")
    assert _change(top, "state_tax") > 0 and _change(top, "net_income") < 0
    single = _example(payload, "co-amendment-87", 2027, "single-filer-45k-wages")
    assert _change(single, "state_tax") < 0 and _change(single, "net_income") > 0


@pytest.mark.parametrize("year, refund", [(2027, 43), (2028, 47)])
def test_co_prop_nn_single_filer_loses_the_first_tier_refund(payload, year, refund):
    at = _example(payload, "co-prop-nn", year, "single-filer-40k-wages")
    assert at["baseline"]["refund"] == refund
    assert at["reform"]["refund"] == 0
    assert _change(at, "net_income") == pytest.approx(-refund, abs=0.01)


def test_co_prop_nn_joint_filers_lose_twice_the_amount(payload):
    """Joint filers get the per-person refund twice: $400,000 is in the top
    TY2027 tier ($137 a person)."""
    at = _example(payload, "co-prop-nn", 2027, "married-couple-400k-wages")
    assert at["baseline"]["refund"] == 2 * 137
    assert at["reform"]["refund"] == 0


def test_ca_prop_3(payload):
    top = _example(payload, "ca-prop-3", 2031, "married-couple-3m-wages")
    assert _change(top, "state_tax") > 0 and _change(top, "net_income") < 0
    single = _example(payload, "ca-prop-3", 2031, "single-filer-150k-wages")
    assert _change(single, "state_tax") == 0 and _change(single, "net_income") == 0


@pytest.mark.parametrize("year", [2028, 2029])
def test_wa_i_645(payload, year):
    top = _example(payload, "wa-i-645", year, "married-couple-5m-wages")
    assert _change(top, "state_tax") < 0 and _change(top, "net_income") > 0
    middle = _example(payload, "wa-i-645", year, "married-couple-250k-wages-2-kids")
    assert _change(middle, "state_tax") == 0 and _change(middle, "net_income") == 0


def test_wa_i_645_repeals_9_9_percent_above_1m(payload):
    top = _example(payload, "wa-i-645", 2028, "married-couple-5m-wages")
    assert _change(top, "state_tax") == pytest.approx(-0.099 * 4_000_000, abs=1)


def test_nd_measure_2(payload):
    at = _example(payload, "nd-measure-2", 2028, "married-couple-110k-3-kids")
    assert at["baseline"]["meal_value"] == 0
    assert _change(at, "free_meals") > 0
    assert _change(at, "net_income") > 0


@pytest.mark.parametrize(
    "household_id, reform_status, reform_reason",
    [
        # About 120% of the poverty guideline: a subsidized marketplace plan.
        ("single-adult-20k-wages", "subsidized_marketplace", None),
        ("married-couple-28k-no-children", "subsidized_marketplace", None),
        # About 85%: the coverage gap.
        ("single-adult-14k-wages", "no_subsidized_option", "below_poverty_line"),
    ],
)
def test_sd_amendment_i(payload, household_id, reform_status, reform_reason):
    """Every example adult has expansion Medicaid under current law and
    loses it in the scenario. Their cash changes only by the marketplace
    premium they then pay (none in the coverage gap)."""
    at = _example(payload, "sd-amendment-i", 2028, household_id)
    base, reform = at["baseline"], at["reform"]
    assert (base["coverage_status"], base["no_option_reason"]) == ("medicaid", None)
    assert (reform["coverage_status"], reform["no_option_reason"]) == (
        reform_status,
        reform_reason,
    )
    assert base["medicaid_enrolled"] >= 1 and base["medicaid"] > 0
    assert reform["medicaid_enrolled"] == 0 and reform["medicaid"] == 0
    if reform_status == "subsidized_marketplace":
        assert reform["ptc"] > 0
        assert reform["marketplace_premium"] > 0
        assert _change(at, "cash_net_income") == pytest.approx(
            -reform["marketplace_premium"], abs=0.02
        )
        assert _change(at, "cash_net_income") < 0
    else:
        assert reform["ptc"] == 0 and reform["marketplace_premium"] == 0
        assert _change(at, "cash_net_income") == pytest.approx(0, abs=0.02)


def test_sd_amendment_i_sweep_shows_the_work_requirement(payload):
    """Under current law, wages below about $6,960 fail Medicaid's work
    requirement, which also bars the credit; in the scenario the same
    adults are in the coverage gap."""
    response = _example_response(
        payload, "sd-amendment-i", 2028, "single-adult-14k-wages"
    )
    incomes = response["income_range"]
    sweep = response["sweep"]
    for income in (0, 6_500):
        i = incomes.index(income)
        assert sweep["baseline"]["coverage_status"][i] == "no_subsidized_option"
        assert sweep["baseline"]["no_option_reason"][i] == "work_requirement"
        assert sweep["reform"]["no_option_reason"][i] == "below_poverty_line"
    i = incomes.index(7_500)
    assert sweep["baseline"]["coverage_status"][i] == "medicaid"


def test_file_stays_small(payload):
    """The household tab fetches the whole file."""
    assert PATH.stat().st_size < 1_500_000
