"""CSV builder (ballot_calc/outputs.py) on partials from synthetic passes."""

from __future__ import annotations

import pytest

from ballot_calc.measures import MEASURES, measure_years
from ballot_calc.metrics import metric_names
from ballot_calc.outputs import COLUMNS, CSV_FILES, build_csv_rows
from ballot_calc.states import STATES
from tests.conftest import reduce_synthetic


@pytest.fixture(scope="module")
def partials():
    return {
        (slug, year): reduce_synthetic(slug, year) for slug, year in measure_years()
    }


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


def test_districts_only_where_the_measure_shows_them(rows):
    counts = {}
    for row in rows["congressional_districts.csv"]:
        key = (row["measure"], row["year"])
        counts[key] = counts.get(key, 0) + 1
        assert row["state"] == MEASURES[row["measure"]].state
    expected = {
        (slug, year): len(STATES[MEASURES[slug].state].district_geoids)
        for slug, year in measure_years()
        if MEASURES[slug].show_districts
    }
    assert counts == expected
    # Colorado's two measures only: 8 districts each, three measure-years.
    assert expected == {
        ("co-amendment-87", 2027): 8,
        ("co-prop-nn", 2027): 8,
        ("co-prop-nn", 2028): 8,
    }


def test_winners_losers_rows_start_with_all(rows):
    for slug, year in measure_years():
        deciles = [
            r["decile"]
            for r in rows["winners_losers.csv"]
            if r["measure"] == slug and r["year"] == year
        ]
        assert deciles == ["All"] + [str(d) for d in range(1, 11)]


def test_missing_partials_are_skipped(partials):
    some = {k: v for k, v in partials.items() if k[0] == "co-prop-nn"}
    rows = build_csv_rows(some)
    assert {r["measure"] for r in rows["metrics.csv"]} == {"co-prop-nn"}
    assert len(rows["congressional_districts.csv"]) == 16


def test_unknown_measure_year_raises(partials):
    bogus = {("wa-i-645", 2031): partials[("wa-i-645", 2028)]}
    with pytest.raises(ValueError):
        build_csv_rows(bogus)
