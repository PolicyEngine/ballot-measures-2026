"""The committed pipeline outputs in frontend/public/data/.

These describe one Modal run (scripts/modal_pipeline.py). They skip, rather
than fail, while the files are absent or were produced from a different
registry than the current ballot_calc/measures.py (manifest registry_hash);
rerun the pipeline and fetch to refresh them.
"""

from __future__ import annotations

import csv
import json
from collections import defaultdict

import pytest

from ballot_calc.config import POLICYENGINE_US_PIN
from ballot_calc.export import registry_hash
from ballot_calc.measures import MEASURES, measure_years
from ballot_calc.metrics import SPM_RESOURCES_ADJUSTMENT, metric_names
from ballot_calc.outputs import COLUMNS, CSV_FILES
from ballot_calc.states import STATES
from tests.conftest import DATA_DIR

# Expected sign of state_budget_impact (positive = the state gains).
BUDGET_SIGN = {
    "co-amendment-87": +1,
    "co-prop-nn": +1,
    "ca-prop-3": +1,
    "wa-i-645": -1,
    "nd-measure-2": -1,
    "sd-amendment-i": +1,
}


def _manifest() -> dict:
    path = DATA_DIR / "manifest.json"
    if not path.exists():
        pytest.skip("manifest.json not fetched yet")
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if manifest.get("registry_hash") != registry_hash():
        pytest.skip(
            "committed results predate the current registry; rerun the pipeline"
        )
    return manifest


def _rows(name: str) -> list[dict]:
    _manifest()
    path = DATA_DIR / name
    if not path.exists():
        pytest.skip(f"{name} not fetched yet")
    with open(path, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


@pytest.fixture(scope="module")
def metrics() -> dict:
    out = defaultdict(dict)
    for row in _rows("metrics.csv"):
        out[(row["measure"], int(row["year"]))][row["metric"]] = float(row["value"])
    return out


def test_manifest_matches_the_pin_and_is_complete():
    manifest = _manifest()
    assert manifest["pin"] == POLICYENGINE_US_PIN
    assert manifest["spm_resources_adjustment"] == SPM_RESOURCES_ADJUSTMENT
    assert manifest["complete"]
    assert set(manifest["measure_years"]) == {f"{s}:{y}" for s, y in measure_years()}


@pytest.mark.parametrize("name", CSV_FILES)
def test_columns(name):
    rows = _rows(name)
    assert rows
    assert tuple(rows[0]) == COLUMNS[name]


def test_every_measure_year_has_every_metric(metrics):
    for slug, year in measure_years():
        names = set(metric_names(MEASURES[slug].kind))
        assert names <= set(metrics[(slug, year)]), (slug, year)


def test_expected_signs(metrics):
    for slug, year in measure_years():
        m = metrics[(slug, year)]
        measure = MEASURES[slug]
        assert m["target_change"] * measure.target_sign > 0, (slug, year)
        assert m["state_budget_impact"] * BUDGET_SIGN[slug] > 0, (slug, year)
        assert m["effective_sample_households"] > 0


def test_deciles_complete():
    rows = _rows("distributional_impact.csv")
    for slug, year in measure_years():
        deciles = {
            r["decile"] for r in rows if r["measure"] == slug and int(r["year"]) == year
        }
        assert deciles == {str(d) for d in range(1, 11)}, (slug, year)


def test_winner_loser_shares_sum_to_one():
    rows = _rows("winners_losers.csv")
    shares = [
        c
        for c in COLUMNS["winners_losers.csv"]
        if c not in ("measure", "year", "decile")
    ]
    seen = defaultdict(set)
    for row in rows:
        seen[(row["measure"], int(row["year"]))].add(row["decile"])
        assert sum(float(row[c]) for c in shares) == pytest.approx(1.0, abs=1e-4)
    for slug, year in measure_years():
        assert seen[(slug, year)] == {"All", *(str(d) for d in range(1, 11))}


def test_income_brackets_match_the_registry():
    rows = _rows("income_brackets.csv")
    for slug, year in measure_years():
        labels = [
            r["bracket"]
            for r in rows
            if r["measure"] == slug and int(r["year"]) == year
        ]
        assert labels == [label for _, _, label in MEASURES[slug].income_bands]


def test_district_counts():
    rows = _rows("congressional_districts.csv")
    counts = defaultdict(int)
    for row in rows:
        counts[(row["measure"], int(row["year"]))] += 1
        assert 0 <= float(row["winners_share"]) <= 1
        assert 0 <= float(row["losers_share"]) <= 1
    for slug, year in measure_years():
        measure = MEASURES[slug]
        geo = STATES[measure.state]
        shown = measure.show_districts and geo.has_districts
        expected = len(geo.district_geoids) if shown else 0
        assert counts.get((slug, year), 0) == expected, (slug, year)
    assert set(counts.values()) == {8}


def test_sd_is_calibrated_to_admin_enrollment(metrics):
    m = metrics[("sd-amendment-i", 2028)]
    admin = MEASURES["sd-amendment-i"].kind_params["admin_expansion_enrollees"]
    factor = admin / m["baseline_expansion_enrollees"]
    assert m["admin_expansion_enrollees"] == admin
    assert m["enrollment_calibration_factor"] == pytest.approx(factor, rel=1e-4)
    for name in ("people_losing_medicaid", "state_budget_impact", "ptc_change"):
        assert m[name] == pytest.approx(m[f"{name}_model"] * factor, rel=1e-4)


def test_income_tax_soi_metrics(metrics):
    for slug, year in measure_years():
        if MEASURES[slug].kind != "income_tax":
            continue
        m = metrics[(slug, year)]
        assert m["revenue_coverage_scaled"] * MEASURES[slug].target_sign > 0
        assert m["soi_coverage_returns_1m_plus"] > 0
        assert m["soi_coverage_agi_above_1m"] > 0
