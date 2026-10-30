"""The measure registry, geography, pins and the exported measures.json."""

from __future__ import annotations

import itertools
import json
import math
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

import pytest

from ballot_calc.config import (
    PIPELINE_APP_NAME,
    POLICYENGINE_US_PIN,
    RESULTS_VOLUME_NAME,
)
from ballot_calc.export import measures_json, registry_hash
from ballot_calc.measures import (
    CO_SALES_TAX_REFUND_TIERS,
    KINDS,
    MEASURE_SLUGS,
    MEASURES,
    measure_years,
)
from ballot_calc.metrics import metric_names
from ballot_calc.states import STATES

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = REPO_ROOT / "scripts"
PERIOD = re.compile(r"^(\d{4}-\d{2}-\d{2})\.(\d{4}-\d{2}-\d{2})$")

EXPECTED_SLUGS = (
    "co-amendment-87",
    "co-prop-nn",
    "ca-prop-3",
    "wa-i-645",
    "nd-measure-2",
    "sd-amendment-i",
)


def test_slugs():
    assert MEASURE_SLUGS == EXPECTED_SLUGS
    for slug, measure in MEASURES.items():
        assert measure.slug == slug
        assert re.fullmatch(r"[a-z]{2}-[a-z0-9-]+", slug)
        assert slug.startswith(measure.state.lower() + "-")


def test_measure_years():
    assert measure_years() == [
        ("co-amendment-87", 2027),
        ("co-prop-nn", 2027),
        ("co-prop-nn", 2028),
        ("ca-prop-3", 2031),
        ("wa-i-645", 2028),
        ("wa-i-645", 2029),
        ("nd-measure-2", 2028),
        ("sd-amendment-i", 2028),
    ]


def test_state_fips():
    assert {code: geo.fips for code, geo in STATES.items()} == {
        "CA": 6,
        "CO": 8,
        "ND": 38,
        "SD": 46,
        "WA": 53,
    }


def test_districts_only_in_co_ca_wa():
    with_districts = {code for code, geo in STATES.items() if geo.has_districts}
    assert with_districts == {"CO", "CA", "WA"}
    assert len(STATES["CO"].district_geoids) == 8
    assert len(STATES["CA"].district_geoids) == 52
    assert len(STATES["WA"].district_geoids) == 10
    for code, geo in STATES.items():
        if geo.has_districts:
            assert all(g // 100 == geo.fips for g in geo.district_geoids)
            assert geo.district_label(geo.district_geoids[0]) == f"{code}-01"
    # At-large states: one geoid, fips x 100 (confirmed in the 2026-10-17
    # Populace build: ND 3800, SD 4600).
    assert STATES["ND"].district_geoids == (3800,)
    assert STATES["SD"].district_geoids == (4600,)
    assert STATES["ND"].district_label(3800) == "ND-AL"


@pytest.mark.parametrize("slug", EXPECTED_SLUGS)
def test_measure_fields(slug):
    m = MEASURES[slug]
    assert m.state in STATES
    assert m.kind in KINDS
    assert m.target_sign in (-1, +1)
    assert m.headline_year in m.years
    assert list(m.years) == sorted(m.years)
    assert m.headline_metric in metric_names(m.kind)
    assert m.reform_overrides, "a measure must change something"
    bands = m.income_bands
    assert bands[0][0] == -math.inf and bands[-1][1] == math.inf
    for (_, high, _), (low, _, _) in itertools.pairwise(bands):
        assert high == low


@pytest.mark.parametrize("slug", EXPECTED_SLUGS)
def test_override_periods_parse(slug):
    m = MEASURES[slug]
    for overrides in (m.baseline_overrides, m.reform_overrides):
        for path, periods in overrides.items():
            assert path.startswith("gov."), path
            for period, value in periods.items():
                match = PERIOD.match(period)
                assert match, f"{path}: bad period {period!r}"
                start, end = (date.fromisoformat(d) for d in match.groups())
                assert start <= end
                assert isinstance(value, (bool, int, float))


@pytest.mark.parametrize("slug", EXPECTED_SLUGS)
def test_official_estimates_point_at_metrics(slug):
    m = MEASURES[slug]
    names = set(metric_names(m.kind))
    for estimate in m.official_estimates:
        assert estimate.model_year in m.years
        assert estimate.low <= estimate.high
        resolves = (
            estimate.metric in names
            or {
                f"{estimate.metric}_low",
                f"{estimate.metric}_high",
            }
            <= names
        )
        assert resolves, f"{slug}: {estimate.metric} is not a metric"


def test_reform_policy_merges_over_baseline():
    m = MEASURES["sd-amendment-i"]
    policy = m.reform_policy
    assert set(policy) == set(m.baseline_overrides) | set(m.reform_overrides)
    for path, periods in m.reform_overrides.items():
        assert policy[path] == periods
    # Copies, not the registry's own dicts.
    policy[next(iter(policy))]["2099-01-01.2099-12-31"] = 0
    assert "2099-01-01.2099-12-31" not in m.reform_policy[next(iter(policy))]


def test_sd_expansion_ends_july_2027_with_minus_infinity():
    m = MEASURES["sd-amendment-i"]
    limit = m.reform_overrides[
        "gov.hhs.medicaid.eligibility.categories.adult.income_limit.SD"
    ]
    assert limit == {"2027-07-01.2100-12-31": -math.inf}
    assert m.baseline_overrides["gov.simulation.include_health_benefits_in_net_income"]
    assert m.headline_year == 2028  # first full year after July 1, 2027


def test_prop_nn_refund_off_only_2027_and_2028():
    m = MEASURES["co-prop-nn"]
    assert m.reform_overrides == {
        "gov.states.co.tax.income.credits.sales_tax_refund.in_effect": {
            "2027-01-01.2028-12-31": False
        }
    }
    assert m.years == (2027, 2028)


def test_prop_nn_uses_the_released_forecast_tiers():
    # policyengine-us#10407 encodes the September 2026 forecast tiers as
    # current law, so Proposition NN carries no baseline overrides.
    assert MEASURES["co-prop-nn"].baseline_overrides == {}
    # Sept. 2026 LCS Table 9: $43-$137 (TY2027) and $47-$147 (TY2028).
    assert [a for _, a in CO_SALES_TAX_REFUND_TIERS[2027]] == [43, 58, 67, 79, 85, 137]
    assert [a for _, a in CO_SALES_TAX_REFUND_TIERS[2028]] == [47, 62, 71, 85, 91, 147]
    for tiers in CO_SALES_TAX_REFUND_TIERS.values():
        thresholds = [t for t, _ in tiers[1:]]
        assert thresholds == sorted(thresholds)


def test_show_districts_only_for_colorado():
    showing = {slug for slug, m in MEASURES.items() if m.show_districts}
    assert showing == {"co-amendment-87", "co-prop-nn"}
    for m in MEASURES.values():
        if m.show_districts:
            assert STATES[m.state].has_districts
    exported = {r["slug"]: r for r in measures_json()["measures"]}
    assert {s for s, r in exported.items() if r["show_districts"]} == showing
    # has_districts stays the state's geography.
    assert exported["ca-prop-3"]["has_districts"] is True
    assert exported["ca-prop-3"]["show_districts"] is False


def test_income_tax_measures_carry_the_top_rate_change():
    expected = {"co-amendment-87": 0.04, "ca-prop-3": 0.03, "wa-i-645": -0.099}
    for slug, change in expected.items():
        assert MEASURES[slug].kind_params["top_rate_change"] == change
        assert MEASURES[slug].target_sign == (1 if change > 0 else -1)


def test_sd_admin_enrollment_is_cited():
    m = MEASURES["sd-amendment-i"]
    params = m.kind_params
    assert params["admin_expansion_enrollees"] == 29_055
    assert params["admin_expansion_enrollees_url"].startswith("https://dss.sd.gov/")
    assert params["admin_expansion_enrollees_date"] == "2026-01"
    estimates = [
        e for e in m.official_estimates if e.metric == "admin_expansion_enrollees"
    ]
    assert len(estimates) == 1
    assert estimates[0].unit == "people"
    assert estimates[0].low == estimates[0].high == 29_055
    assert estimates[0].url == params["admin_expansion_enrollees_url"]


def test_copy_fixes():
    nn = MEASURES["co-prop-nn"]
    assert nn.short_title == "Raise the state revenue limit and keep the surplus"
    assert nn.kind_params == {"permanent_change": True, "scored_through": 2028}
    assert nn.kind_params["scored_through"] == max(nn.years)
    wa_count = next(
        e for e in MEASURES["wa-i-645"].official_estimates if e.unit == "people"
    )
    assert "assumption" in wa_count.note
    assert "Department of Revenue" in wa_count.note


def test_nd_cep_students_are_dpi_public_schools():
    params = MEASURES["nd-measure-2"].kind_params
    # DPI 2026 CEP annual notification: 10,742 students at 47 CEP schools,
    # less 1,546 at 8 Bureau of Indian Education, tribal and Catholic
    # schools (codes -900, -409, -410), which NCES public enrollment omits.
    assert params["cep_students"] == 10_742 - 1_546 == 9_196
    assert params["public_enrollment"] == 116_762
    assert 0 < params["cep_students"] < params["public_enrollment"]


def test_school_meals_start_july_2027():
    m = MEASURES["nd-measure-2"]
    assert m.reform_overrides == {
        "gov.usda.school_meals.state_universal_free_meals.ND": {
            "2027-07-01.2100-12-31": True
        }
    }
    assert m.years == (2028,)


def _pin_in(path: Path) -> list[str]:
    return re.findall(r"policyengine-us==[0-9.]+", path.read_text(encoding="utf-8"))


def test_pin_is_exact_and_consistent():
    assert re.fullmatch(r"policyengine-us==\d+\.\d+\.\d+", POLICYENGINE_US_PIN)
    files = [
        REPO_ROOT / "pyproject.toml",
        SCRIPTS / "modal_pipeline.py",
        SCRIPTS / "modal_tests.py",
        SCRIPTS / "modal_household_api.py",
        SCRIPTS / "diagnostics" / "poverty_flips.py",
    ]
    for path in files:
        if not path.exists():
            continue
        pins = set(_pin_in(path))
        assert pins == {POLICYENGINE_US_PIN}, f"{path.name}: {pins}"
    pipeline = (SCRIPTS / "modal_pipeline.py").read_text(encoding="utf-8")
    assert f'POLICYENGINE_US_PIN = "{POLICYENGINE_US_PIN}"' in pipeline


def test_no_spm_calculator_0_3_1():
    for path in [REPO_ROOT / "pyproject.toml", *SCRIPTS.glob("*.py")]:
        assert "spm-calculator==0.3.1" not in path.read_text(encoding="utf-8"), (
            path.name
        )


def test_modal_names():
    assert PIPELINE_APP_NAME == "ballot-measures-2026-pipeline"
    assert RESULTS_VOLUME_NAME == "ballot-measures-2026-results"


def test_pipeline_scripts_are_ascii():
    """Windows consoles crash on non-ASCII prints from the Modal driver."""
    for path in [SCRIPTS / "modal_pipeline.py", SCRIPTS / "modal_tests.py"]:
        if path.exists():
            text = path.read_text(encoding="utf-8")
            assert all(ord(c) < 128 for c in text), path.name


def test_measures_json_is_current():
    path = REPO_ROOT / "frontend" / "public" / "data" / "measures.json"
    committed = json.loads(path.read_text(encoding="utf-8"))
    assert committed == json.loads(json.dumps(measures_json())), (
        "measures.json is stale: run `python -m ballot_calc.export`"
    )
    assert committed["registry_hash"] == registry_hash()


def test_fast_modules_do_not_import_policyengine():
    code = (
        "import sys\n"
        "import ballot_calc.export, ballot_calc.measures, ballot_calc.metrics\n"
        "import ballot_calc.outputs, ballot_calc.passes, ballot_calc.subset\n"
        "bad = [m for m in sys.modules if m.startswith('policyengine')]\n"
        "assert not bad, bad\n"
    )
    subprocess.run([sys.executable, "-c", code], check=True, cwd=REPO_ROOT)


def test_amendment_87_compares_with_the_individual_taxpayer_table():
    # The model scores individual income tax only. The Blue Book's Table 3
    # (individual taxpayers, tax year 2023 incomes) nets to +$635.7M; its
    # revenue estimate ($1.972B, FY 2027-28) also counts C corporations, so
    # it is shown without a ratio.
    table3, total = MEASURES["co-amendment-87"].official_estimates
    assert table3.source.endswith("Table 3") and table3.compare
    assert table3.low == table3.high == 635_700_000
    assert "2023" in table3.period and table3.url.endswith("#page=6")
    assert total.low == total.high == 1_972_000_000 and not total.compare
    assert "C corporations" in total.period


def test_sources_that_measure_something_else_are_not_compared():
    nn = MEASURES["co-prop-nn"].official_estimates
    assert [e.compare for e in nn if "June forecast" in e.source] == [False, False]
    assert all(e.compare for e in nn if "September 2026 forecast" in e.source)
    wa = [
        e
        for e in MEASURES["wa-i-645"].official_estimates
        if e.metric == "state_budget_impact"
    ]
    assert wa and not any(e.compare for e in wa)


def test_no_link_uses_the_sd_pamphlets_dead_path():
    # The Secretary of State serves the pamphlet without "2026 Election
    # Information/" in the path; with it, the link returns 404.
    for m in MEASURES.values():
        for e in m.official_estimates:
            assert "2026%20Election%20Information" not in e.url, (m.slug, e.url)


def test_top_income_measures_end_in_one_band_from_5_million():
    # California and Washington have no surveyed household with AGI above
    # $10 million, so their bands end in one $5M+ band
    for slug in ("ca-prop-3", "wa-i-645"):
        bands = MEASURES[slug].income_bands
        assert (
            bands[-1][0] == 5_000_000
            and math.isinf(bands[-1][1])
            and bands[-1][2] == "$5M+"
        )
        assert bands[-2][1] == 5_000_000
    assert not any(b[2] == "$10M+" for m in MEASURES.values() for b in m.income_bands)
