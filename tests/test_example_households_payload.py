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
    MAX_SWEEP_POINTS,
    POLICIES,
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


def _example(payload, slug, year, household_id):
    for household in payload["measures"][slug]["years"][str(year)]["households"]:
        if household["id"] == household_id:
            return household["response"]["at_income"]
    raise AssertionError(f"no example {household_id} for {slug} {year}")


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
                assert household["input"] == example_payload(measure, profile, int(year))


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
                assert len(series) == n, f"{name} {policy}.{key}"
                if index is not None:
                    assert series[index] == pytest.approx(
                        response["at_income"][policy][key], abs=0.01
                    ), f"{name} {policy}.{key}"


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
            expected = (
                _change(at, "medicaid")
                + _change(at, "ptc")
                - _change(at, "marketplace_premium")
            )
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
    "household_id, gets_ptc",
    [("single-adult-20k-wages", True), ("single-adult-14k-wages", False)],
)
def test_sd_amendment_i(payload, household_id, gets_ptc):
    at = _example(payload, "sd-amendment-i", 2028, household_id)
    assert at["baseline"]["medicaid_enrolled"] >= 1
    assert at["reform"]["medicaid_enrolled"] == 0
    assert (at["reform"]["ptc"] > at["baseline"]["ptc"]) is gets_ptc
    if not gets_ptc:
        assert at["reform"]["ptc"] == 0


def test_file_stays_small(payload):
    """The household tab fetches the whole file."""
    assert PATH.stat().st_size < 1_500_000
