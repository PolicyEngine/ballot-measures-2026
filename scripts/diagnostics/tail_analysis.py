"""Print the IRS SOI top-income comparison for CO, CA and WA.

The pipeline (scripts/modal_pipeline.py) tabulates each income tax state's
filers in the dataset's own year and compares them with IRS SOI Historic
Table 2 (ballot_calc/metrics/top_tail.py). It writes the comparison to
manifest.json (``top_tail``) and the coverage-scaled revenue change to
metrics.csv (``revenue_coverage_scaled``, with the band split in each
partial's diagnostics). This script reads those from the results Volume,
prints the table and writes scripts/diagnostics/top_tail.json:

    PYTHONIOENCODING=utf-8 PYTHONUTF8=1 \
        python scripts/diagnostics/tail_analysis.py [--revision buildo-1017]

The headline figures on the dashboard are the model's own; the scaled
figures are for the methodology tab.
"""

import argparse
import json
import sys
from pathlib import Path

import modal

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from ballot_calc.config import DEFAULT_REVISION, RESULTS_VOLUME_NAME, resolve_revision
from ballot_calc.measures import MEASURES

OUTPUT = REPO_ROOT / "scripts" / "diagnostics" / "top_tail.json"


def main(revision: str) -> dict:
    revision = resolve_revision(revision)
    volume = modal.Volume.from_name(RESULTS_VOLUME_NAME)

    def read(path: str):
        return json.loads(b"".join(volume.read_file(f"runs/{revision}/{path}")))

    manifest = read("manifest.json")
    measures = {}
    for slug, measure in MEASURES.items():
        if measure.kind != "income_tax":
            continue
        for year in measure.years:
            partial = read(f"partials/{slug}__{year}.json")
            metrics, diagnostics = partial["metrics"], partial["diagnostics"]
            measures[f"{slug}:{year}"] = {
                "state": measure.state,
                "revenue_change": metrics["state_revenue_impact"],
                "revenue_coverage_scaled": metrics["revenue_coverage_scaled"],
                "by_agi_band": diagnostics["revenue_change_by_agi_band"],
                "1m_plus_above_threshold": diagnostics[
                    "revenue_change_1m_plus_above_threshold"
                ],
                "1m_plus_at_threshold": diagnostics[
                    "revenue_change_1m_plus_at_threshold"
                ],
            }
    payload = {
        "dataset_revision": revision,
        "pin": manifest["pin"],
        "generated_at_utc": manifest["generated_at_utc"],
        "states": manifest["top_tail"],
        "measures": measures,
    }
    OUTPUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    for state, summary in manifest["top_tail"].items():
        model, soi, ratio = summary["model_filers"], summary["soi"], summary["coverage"]
        print(
            f"\n{state}: model filers TY{summary['filer_year']} vs IRS SOI "
            f"TY{summary['soi_year']}"
        )
        for key in (
            "returns_500k_1m",
            "agi_500k_1m",
            "returns_1m_plus",
            "agi_1m_plus",
            "agi_above_1m",
        ):
            print(
                f"  {key:16s} model {model[key]:>18,.0f}  SOI {soi[key]:>18,.0f}"
                f"  ratio {ratio[key]:.2f}"
            )
        for key, value in measures.items():
            if value["state"] != state:
                continue
            print(
                f"  {key}: model {value['revenue_change'] / 1e9:,.3f}B; "
                f"coverage-scaled {value['revenue_coverage_scaled'] / 1e9:,.3f}B"
            )
    print(f"\nWrote {OUTPUT}")
    return payload


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--revision", default=DEFAULT_REVISION)
    main(parser.parse_args().revision)
