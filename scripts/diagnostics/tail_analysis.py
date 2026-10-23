"""Top-income tail of the state subsets vs IRS SOI Historic Table 2.

The CO, CA and WA measures turn on incomes above $500k and $1M, where
survey-based microdata are thin. For each of those states this compares
the subset's filers (tax year 2024, the dataset's own year, no uprating
beyond it) with IRS SOI Historic Table 2 for tax year 2023, the latest
published: returns and AGI at $500k-$1M and $1M+, and AGI above the $1M
threshold. It then re-weights each income-tax measure's revenue change by
AGI band with those coverage ratios ("coverage-scaled" estimate), as the
Colorado validation tab did on the earlier build. The $1M+ change is split
into what each return pays at the $1M threshold (scaled by the returns
ratio) and the top-rate change on income above $1M (scaled by the
above-threshold income ratio), because the build has too many $1M+ filers
with too little income each.

Runs on Modal (no local microsimulation); reads the cleaned subsets and
the pipeline's saved passes from the results Volume:

    modal run scripts/diagnostics/tail_analysis.py [--revision buildo-1017]

Writes runs/<revision>/diagnostics/top_tail.json on the Volume (the
pipeline copies it into manifest.json) and scripts/diagnostics/top_tail.json
locally.
"""

import json
import os
import sys
from pathlib import Path

import modal

_PARENTS = Path(__file__).resolve().parents
# scripts/diagnostics/ -> repo root locally; the file sits at /root/ in Modal.
REPO_ROOT = _PARENTS[2] if len(_PARENTS) > 2 else _PARENTS[-1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from ballot_calc.config import (
    DEFAULT_REVISION,
    PIPELINE_APP_NAME,
    RESULTS_VOLUME_NAME,
    resolve_revision,
)

POLICYENGINE_US_PIN = "policyengine-us==2.60.4"
RESULTS_DIR = "/results"
DATA_YEAR = 2024

# IRS SOI Historic Table 2, tax year 2023 (released August 2026), "All
# returns" column; AGI in dollars. Files: https://www.irs.gov/pub/irs-soi/
# 23in06co.xlsx, 23in05ca.xlsx, 23in48wa.xlsx (rows "Number of returns" and
# "Adjusted gross income (AGI)", columns "$500,000 under $1,000,000" and
# "$1,000,000 or more").
SOI_YEAR = 2023
SOI = {
    "CO": {
        "returns": 3_086_830,
        "agi": 314_115_675_000,
        "returns_500k_1m": 38_030,
        "agi_500k_1m": 25_370_899_000,
        "returns_1m_plus": 15_610,
        "agi_1m_plus": 47_266_883_000,
    },
    "CA": {
        "returns": 18_482_300,
        "agi": 2_050_805_047_000,
        "returns_500k_1m": 317_160,
        "agi_500k_1m": 213_715_326_000,
        "returns_1m_plus": 132_720,
        "agi_1m_plus": 400_221_114_000,
    },
    "WA": {
        "returns": 3_781_890,
        "agi": 434_342_159_000,
        "returns_500k_1m": 67_020,
        "agi_500k_1m": 44_630_153_000,
        "returns_1m_plus": 23_370,
        "agi_1m_plus": 60_595_722_000,
    },
}
for figures in SOI.values():
    figures["agi_above_1m"] = (
        figures["agi_1m_plus"] - 1_000_000 * figures["returns_1m_plus"]
    )

# Change in the top marginal rate on income above $1M when each measure
# passes (CO: 8.4% vs 4.4%; CA: 12.3% vs 9.3%; WA: the 9.9% tax repealed).
TOP_RATE_CHANGE = {"co-amendment-87": 0.04, "ca-prop-3": 0.03, "wa-i-645": -0.099}

BANDS = (
    ("under_500k", -float("inf"), 5e5),
    ("500k_1m", 5e5, 1e6),
    ("1m_plus", 1e6, float("inf")),
)

app = modal.App(f"{PIPELINE_APP_NAME}-diagnostics")
volume = modal.Volume.from_name(RESULTS_VOLUME_NAME)
image = (
    modal.Image.debian_slim(python_version="3.13")
    .pip_install(POLICYENGINE_US_PIN, "numpy>=1.24.0")
    .add_local_python_source("ballot_calc")
)


def _tabulate(agi, weight) -> dict:
    import numpy as np

    agi = np.asarray(agi, dtype=float)
    weight = np.asarray(weight, dtype=float)
    out = {"returns": float(weight.sum()), "agi": float((weight * agi).sum())}
    for name, low, high in BANDS[1:]:
        band = (agi >= low) & (agi < high)
        out[f"returns_{name}"] = float(weight[band].sum())
        out[f"agi_{name}"] = float((weight * agi)[band].sum())
        out[f"records_{name}"] = int(band.sum())
    top = agi >= 1e6
    out["agi_above_1m"] = float((weight * (agi - 1e6))[top].sum())
    return out


@app.function(image=image, memory=32768, timeout=3600, volumes={RESULTS_DIR: volume})
def tail_stats(state: str, revision: str) -> dict:
    import numpy as np
    from policyengine_us import Microsimulation

    from ballot_calc.measures import MEASURES
    from ballot_calc.subset import clean_filename

    revision = resolve_revision(revision)
    path = os.path.join(RESULTS_DIR, "cache", clean_filename(state, revision))
    sim = Microsimulation(dataset=path, dataset_end_year=DATA_YEAR)
    agi = np.asarray(sim.calculate("adjusted_gross_income", DATA_YEAR))
    weight = np.asarray(sim.calculate("tax_unit_weight", DATA_YEAR))
    filer = np.asarray(sim.calculate("tax_unit_is_filer", DATA_YEAR)).astype(bool)
    model = _tabulate(agi[filer], weight[filer])
    soi = SOI[state]
    coverage = {
        key: model[key] / soi[key]
        for key in (
            "returns",
            "agi",
            "returns_500k_1m",
            "agi_500k_1m",
            "returns_1m_plus",
            "agi_1m_plus",
            "agi_above_1m",
        )
    }
    # Scale factors: $500k-$1M revenue by the AGI ratio; $1M+ revenue in two
    # parts, the part every $1M+ return pays at the threshold by the returns
    # ratio and the part on income above $1M by the above-threshold ratio.
    scale = {
        "under_500k": 1.0,
        "500k_1m": soi["agi_500k_1m"] / model["agi_500k_1m"],
        "1m_plus_returns": soi["returns_1m_plus"] / model["returns_1m_plus"],
        "1m_plus_above": soi["agi_above_1m"] / model["agi_above_1m"],
    }

    measures = {}
    run_dir = os.path.join(RESULTS_DIR, "runs", revision, "passes")
    for slug, measure in MEASURES.items():
        if measure.state != state or measure.kind != "income_tax":
            continue
        for year in measure.years:
            arrays = {}
            for policy in ("baseline", "reform"):
                with np.load(
                    os.path.join(run_dir, slug, str(year), f"{policy}.npz")
                ) as data:
                    arrays[policy] = {
                        k: data[k] for k in ("tu_weight", "tu_agi", "tu_state_tax")
                    }
            w = arrays["baseline"]["tu_weight"]
            band_agi = arrays["baseline"]["tu_agi"]
            delta = (
                arrays["reform"]["tu_state_tax"] - arrays["baseline"]["tu_state_tax"]
            )
            by_band = {}
            for name, low, high in BANDS:
                mask = (band_agi >= low) & (band_agi < high)
                by_band[name] = float((w * delta)[mask].sum())
            # Split the $1M+ change: the top-rate change times income above
            # $1M, and the rest (what each return pays at the threshold).
            top = band_agi >= 1e6
            above = float((w * TOP_RATE_CHANGE[slug] * (band_agi - 1e6))[top].sum())
            at_threshold = by_band["1m_plus"] - above
            scaled = (
                by_band["under_500k"]
                + by_band["500k_1m"] * scale["500k_1m"]
                + at_threshold * scale["1m_plus_returns"]
                + above * scale["1m_plus_above"]
            )
            measures[f"{slug}:{year}"] = {
                "revenue_change": float((w * delta).sum()),
                "revenue_change_by_agi_band": by_band,
                "revenue_change_1m_plus_above_threshold": above,
                "revenue_change_1m_plus_at_threshold": at_threshold,
                "coverage_scaled_revenue_change": scaled,
                "model_top_tail_scored_year": _tabulate(band_agi, w),
            }
    return {
        "state": state,
        "model_year": DATA_YEAR,
        "soi_year": SOI_YEAR,
        "model_filers": model,
        "soi": soi,
        "coverage": coverage,
        "band_scale": scale,
        "measures": measures,
    }


@app.local_entrypoint()
def main(revision: str = DEFAULT_REVISION, states: str = "CO,CA,WA"):
    revision = resolve_revision(revision)
    results = {
        r["state"]: r
        for r in tail_stats.map(states.split(","), kwargs={"revision": revision})
    }
    payload = {
        "dataset_revision": revision,
        "pin": POLICYENGINE_US_PIN,
        "states": results,
    }
    text = json.dumps(payload, indent=2)
    with volume.batch_upload(force=True) as batch:
        local = REPO_ROOT / "scripts" / "diagnostics" / "top_tail.json"
        local.write_text(text + "\n", encoding="utf-8")
        batch.put_file(str(local), f"runs/{revision}/diagnostics/top_tail.json")
    for state, r in results.items():
        m, s, c = r["model_filers"], r["soi"], r["coverage"]
        print(f"\n{state}: model filers TY{r['model_year']} vs SOI TY{r['soi_year']}")
        for key in (
            "returns_500k_1m",
            "agi_500k_1m",
            "returns_1m_plus",
            "agi_1m_plus",
            "agi_above_1m",
        ):
            print(
                f"  {key:16s} model {m[key]:>18,.0f}  SOI {s[key]:>18,.0f}  ratio {c[key]:.2f}"
            )
        for key, value in r["measures"].items():
            print(
                f"  {key}: model {value['revenue_change'] / 1e9:,.3f}B; coverage-scaled "
                f"{value['coverage_scaled_revenue_change'] / 1e9:,.3f}B; by band "
                + ", ".join(
                    f"{k} {v / 1e9:,.3f}B"
                    for k, v in value["revenue_change_by_agi_band"].items()
                )
                + f" (1m_plus at threshold "
                f"{value['revenue_change_1m_plus_at_threshold'] / 1e9:,.3f}B, above "
                f"{value['revenue_change_1m_plus_above_threshold'] / 1e9:,.3f}B)"
            )
    print("\nWrote scripts/diagnostics/top_tail.json and the Volume copy.")
