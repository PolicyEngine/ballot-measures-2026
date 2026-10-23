"""CSV builder (ballot_calc/outputs.py) on partials from synthetic passes."""

from __future__ import annotations

import pytest

from ballot_calc.measures import MEASURES, measure_years
from ballot_calc.metrics import compute_measure_year, metric_names
from ballot_calc.outputs import COLUMNS, CSV_FILES, build_csv_rows
from ballot_calc.states import STATES
from tests.conftest import synthetic_passes


@pytest.fixture(scope="module")
def partials():
    out = {}
    for slug, year in measure_years():
        base, reform = synthetic_passes(slug)
        out[(slug, year)] = compute_measure_year(MEASURES[slug], year, base, reform)
    return out


@pytest.fixture(scope="module")
def rows(partials):
    return build_csv_rows(partials)


def test_every_file_built_with_its_columns(rows):
    assert set(rows) == set(CSV_FILES)
    for name, file_rows in rows.items():
        assert file_rows, name
        for row in file_rows:
            assert tuple(row) == COLUMNS[name]


def test_row_counts(rows):
    pairs = measure_years()
    n_metrics = sum(len(metric_names(MEASURES[s].kind)) for s, _ in pairs)
    assert len(rows["metrics.csv"]) == n_metrics
    assert len(rows["distributional_impact.csv"]) == 10 * len(pairs)
    assert len(rows["winners_losers.csv"]) == 11 * len(pairs)
    assert len(rows["income_brackets.csv"]) == sum(
        len(MEASURES[s].income_bands) for s, _ in pairs
    )


def test_districts_only_for_co_ca_wa(rows):
    counts = {}
    for row in rows["congressional_districts.csv"]:
        counts[(row["measure"], row["year"])] = (
            counts.get((row["measure"], row["year"]), 0) + 1
        )
        assert row["state"] == MEASURES[row["measure"]].state
    expected = {
        (slug, year): len(STATES[MEASURES[slug].state].district_geoids)
        for slug, year in measure_years()
        if STATES[MEASURES[slug].state].has_districts
    }
    assert counts == expected
    assert set(expected.values()) == {8, 52, 10}


def test_winners_losers_rows_start_with_all(rows):
    for slug, year in measure_years():
        deciles = [
            r["decile"]
            for r in rows["winners_losers.csv"]
            if r["measure"] == slug and r["year"] == year
        ]
        assert deciles == ["All"] + [str(d) for d in range(1, 11)]


def test_missing_partials_are_skipped(partials):
    some = {k: v for k, v in partials.items() if k[0] == "wa-i-645"}
    rows = build_csv_rows(some)
    assert {r["measure"] for r in rows["metrics.csv"]} == {"wa-i-645"}
    assert rows["congressional_districts.csv"]


def test_unknown_measure_year_raises(partials):
    bogus = {("wa-i-645", 2031): partials[("wa-i-645", 2028)]}
    with pytest.raises(ValueError):
        build_csv_rows(bogus)
