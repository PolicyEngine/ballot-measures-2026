"""Turn partial results into the CSV rows the frontend reads.

Pure functions (no policyengine import) so the data contract in
scripts/DATA_SCHEMA.md is unit-testable without a simulation. Every file is
long-format with ``measure`` and ``year`` columns; rows follow the
registry's order of measures and years.
"""

from __future__ import annotations

from .measures import MEASURES, measure_years
from .metrics import metric_names
from .metrics.core import INTRA_COLUMNS
from .states import STATES

CSV_FILES = (
    "metrics.csv",
    "distributional_impact.csv",
    "winners_losers.csv",
    "income_brackets.csv",
    "congressional_districts.csv",
)

COLUMNS = {
    "metrics.csv": ("measure", "year", "metric", "value"),
    "distributional_impact.csv": (
        "measure",
        "year",
        "decile",
        "average_change",
        "relative_change",
    ),
    "winners_losers.csv": ("measure", "year", "decile", *INTRA_COLUMNS[::-1]),
    "income_brackets.csv": (
        "measure",
        "year",
        "bracket",
        "households",
        "winners",
        "losers",
        "total_change",
        "average_change",
        "state_budget_impact",
    ),
    "congressional_districts.csv": (
        "measure",
        "year",
        "district",
        "state",
        "households",
        "average_household_income_change",
        "relative_household_income_change",
        "winners_share",
        "losers_share",
        "state_budget_impact",
    ),
}


def _r(value, digits: int = 2) -> float:
    return round(float(value), digits)


def build_csv_rows(partials: dict) -> dict[str, list[dict]]:
    """Build ``{filename: rows}`` from ``{(slug, year): partial}``.

    Measure-years without a partial are skipped (the pipeline's manifest
    records them as missing); unknown keys raise.
    """
    known = set(measure_years())
    unknown = [key for key in partials if tuple(key) not in known]
    if unknown:
        raise ValueError(f"Partials for unknown measure-years: {unknown}")

    rows: dict[str, list[dict]] = {name: [] for name in CSV_FILES}
    for slug, year in measure_years():
        partial = partials.get((slug, year))
        if partial is None:
            continue
        measure = MEASURES[slug]
        key = {"measure": slug, "year": year}
        metrics = partial["metrics"]
        for metric in metric_names(measure.kind):
            rows["metrics.csv"].append(
                {**key, "metric": metric, "value": _r(metrics[metric], 6)}
            )
        for decile in partial["deciles"]:
            rows["distributional_impact.csv"].append(
                {
                    **key,
                    "decile": decile["decile"],
                    "average_change": _r(decile["average_change"]),
                    "relative_change": _r(decile["relative_change"], 6),
                }
            )
        intra = partial["intra_decile"]
        rows["winners_losers.csv"].append(
            {
                **key,
                "decile": "All",
                **{col: _r(intra["all"][col], 6) for col in INTRA_COLUMNS[::-1]},
            }
        )
        for i in range(10):
            rows["winners_losers.csv"].append(
                {
                    **key,
                    "decile": str(i + 1),
                    **{
                        col: _r(intra["deciles"][col][i], 6)
                        for col in INTRA_COLUMNS[::-1]
                    },
                }
            )
        for band in partial["income_brackets"]:
            rows["income_brackets.csv"].append(
                {
                    **key,
                    "bracket": band["bracket"],
                    "households": _r(band["households"]),
                    "winners": _r(band["winners"]),
                    "losers": _r(band["losers"]),
                    "total_change": _r(band["total_change"]),
                    "average_change": _r(band["average_change"]),
                    "state_budget_impact": _r(band["state_budget_impact"]),
                }
            )
        if STATES[measure.state].has_districts:
            for district in sorted(partial["districts"], key=lambda d: d["district"]):
                rows["congressional_districts.csv"].append(
                    {
                        **key,
                        "district": district["district"],
                        "state": measure.state,
                        "households": _r(district["households"]),
                        "average_household_income_change": _r(
                            district["average_household_income_change"]
                        ),
                        "relative_household_income_change": _r(
                            district["relative_household_income_change"], 6
                        ),
                        "winners_share": _r(district["winners_share"], 6),
                        "losers_share": _r(district["losers_share"], 6),
                        "state_budget_impact": _r(district["state_budget_impact"]),
                    }
                )
    for name, file_rows in rows.items():
        for row in file_rows:
            if tuple(row) != COLUMNS[name]:
                raise RuntimeError(f"{name}: columns {tuple(row)} != {COLUMNS[name]}")
    return rows
