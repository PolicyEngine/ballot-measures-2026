"""Who moves across the SPM poverty line in the top-income measures?

For each measure-year, finds the people whose poverty or deep-poverty flag
differs between the pipeline's saved current-law and passes arrays, then
re-simulates current law on the same state subset to break their SPM
units' resources into parts: market income as the SPM counts it, the
cash income sources it leaves out (``partnership_s_corp_income``,
``farm_rent_income``, ``ak_permanent_fund_dividend``; see
``ballot_calc.passes.SPM_OMITTED_SOURCES``), which household net income
does count, benefits, taxes and expenses. It also recomputes poverty with
those sources added back to resources. The pipeline's poverty metrics now
add them back; this script shows what the model's own resources give.

    modal run scripts/diagnostics/poverty_flips.py \
        [--measures ca-prop-3:2031,wa-i-645:2028,co-amendment-87:2027]

Writes scripts/diagnostics/poverty_flips.json.
"""

import json
import os
import sys
from pathlib import Path

import modal

_PARENTS = Path(__file__).resolve().parents
REPO_ROOT = _PARENTS[2] if len(_PARENTS) > 2 else _PARENTS[-1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from ballot_calc.config import (
    DEFAULT_REVISION,
    PIPELINE_APP_NAME,
    RESULTS_VOLUME_NAME,
    resolve_revision,
)

POLICYENGINE_US_PIN = "policyengine-us==2.72.4"
RESULTS_DIR = "/results"
from ballot_calc.passes import SPM_OMITTED_SOURCES as OMITTED

PARTS = (
    "spm_unit_net_income",
    "spm_unit_market_income",
    "spm_unit_benefits",
    "spm_unit_taxes",
    "spm_unit_federal_tax",
    "spm_unit_state_tax",
    "spm_unit_spm_expenses",
    "spm_unit_medical_out_of_pocket_expenses",
    "spm_unit_spm_threshold",
)
PERSON_SOURCES = (
    *OMITTED,
    "employment_income",
    "self_employment_income",
    "capital_gains",
    "dividend_income",
    "interest_income",
    "rental_income",
    "adjusted_gross_income_person",
)

app = modal.App(f"{PIPELINE_APP_NAME}-poverty")
volume = modal.Volume.from_name(RESULTS_VOLUME_NAME)
image = (
    modal.Image.debian_slim(python_version="3.13")
    .pip_install(
        POLICYENGINE_US_PIN, "numpy>=1.24.0", index_url="https://pypi.org/simple"
    )
    .add_local_python_source("ballot_calc")
)


@app.function(image=image, memory=65536, timeout=3600, volumes={RESULTS_DIR: volume})
def flips(slug: str, year: int, revision: str) -> dict:
    import numpy as np
    from policyengine_us import Microsimulation

    from ballot_calc.measures import MEASURES
    from ballot_calc.passes import build_reform, policy_overrides
    from ballot_calc.subset import clean_filename

    revision = resolve_revision(revision)
    measure = MEASURES[slug]
    run_dir = os.path.join(RESULTS_DIR, "runs", revision, "passes", slug, str(year))
    arrays = {}
    for policy in ("baseline", "reform"):
        with np.load(os.path.join(run_dir, f"{policy}.npz")) as data:
            arrays[policy] = {k: data[k] for k in data.files}
    base, reform = arrays["baseline"], arrays["reform"]

    path = os.path.join(RESULTS_DIR, "cache", clean_filename(measure.state, revision))
    sim = Microsimulation(
        dataset=path,
        reform=build_reform(policy_overrides(measure, "baseline")),
        dataset_end_year=year,
    )
    sim.calculate("household_net_income", year)
    parts = {v: np.asarray(sim.calculate(v, year)) for v in PARTS}
    if not np.allclose(parts["spm_unit_net_income"], base["spm_net_income"], atol=1):
        raise RuntimeError("SPM unit order differs from the saved pass.")
    for v in PERSON_SOURCES:
        if v in sim.tax_benefit_system.variables:
            parts[v] = np.asarray(sim.calculate(v, year, map_to="spm_unit"))
    omitted = sum(parts[v] for v in OMITTED if v in parts)

    p_spm = base["p_spm_index"]
    pw = base["p_weight"]
    child = base["p_age"] < 18
    hh_agi = base["hh_agi"][base["spm_hh_index"]]
    spm_w = base["hh_weight"][base["spm_hh_index"]]

    def flags(resources, threshold):
        return (resources < threshold)[p_spm]

    out = {"measure": slug, "year": year}
    thresholds = {
        "poverty": base["spm_threshold"],
        "deep_poverty": base["spm_deep_threshold"],
    }
    for name, threshold in thresholds.items():
        for label, extra in (("model", 0.0), ("with_omitted_income", omitted)):
            b = flags(base["spm_net_income"] + extra, threshold)
            r = flags(reform["spm_net_income"] + extra, threshold)
            out[f"{name}_{label}"] = {
                "baseline_rate": float(100 * pw[b].sum() / pw.sum()),
                "reform_rate": float(100 * pw[r].sum() / pw.sum()),
                "lifted": float(pw[b & ~r].sum()),
                "pushed": float(pw[~b & r].sum()),
                "children_lifted": float(pw[b & ~r & child].sum()),
                "children_pushed": float(pw[~b & r & child].sum()),
            }
        # Records behind the model's flips.
        b = flags(base["spm_net_income"], threshold)
        r = flags(reform["spm_net_income"], threshold)
        moved = np.unique(p_spm[b != r])
        rows = []
        for i in moved[np.argsort(-spm_w[moved])][:15]:
            rows.append(
                {
                    "spm_weight": float(spm_w[i]),
                    "people": int((p_spm == i).sum()),
                    "household_agi": float(hh_agi[i]),
                    "threshold": float(threshold[i]),
                    "resources_baseline": float(base["spm_net_income"][i]),
                    "resources_reform": float(reform["spm_net_income"][i]),
                    "omitted_income": float(omitted[i]),
                    **{
                        k: float(v[i])
                        for k, v in parts.items()
                        if k != "spm_unit_spm_threshold"
                    },
                }
            )
        moved_people = b != r
        out[f"{name}_flipped_records"] = rows
        out[f"{name}_flipped_summary"] = {
            "spm_units": len(moved),
            "people_weighted": float(pw[moved_people].sum()),
            "share_with_omitted_income_over_threshold": float(
                pw[moved_people & (omitted[p_spm] > threshold[p_spm])].sum()
                / max(pw[moved_people].sum(), 1e-9)
            ),
            "share_household_agi_500k_plus": float(
                pw[moved_people & (hh_agi[p_spm] >= 5e5)].sum()
                / max(pw[moved_people].sum(), 1e-9)
            ),
        }
    # Baseline poverty among people in households with AGI >= $500k.
    rich = hh_agi[p_spm] >= 5e5
    b = flags(base["spm_net_income"], base["spm_threshold"])
    bc = flags(base["spm_net_income"] + omitted, base["spm_threshold"])
    out["agi_500k_plus_people"] = float(pw[rich].sum())
    out["agi_500k_plus_in_poverty_model"] = float(pw[rich & b].sum())
    out["agi_500k_plus_in_poverty_with_omitted"] = float(pw[rich & bc].sum())
    out["omitted_income_total"] = float((omitted * spm_w).sum())
    return out


@app.local_entrypoint()
def main(
    measures: str = "ca-prop-3:2031,wa-i-645:2028,co-amendment-87:2027",
    revision: str = DEFAULT_REVISION,
):
    pairs = [(m.split(":")[0], int(m.split(":")[1])) for m in measures.split(",")]
    results = list(flips.starmap([(s, y, revision) for s, y in pairs]))
    out = REPO_ROOT / "scripts" / "diagnostics" / "poverty_flips.json"
    out.write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    for r in results:
        print(f"\n== {r['measure']} {r['year']}")
        for key in ("poverty", "deep_poverty"):
            for label in ("model", "with_omitted_income"):
                v = r[f"{key}_{label}"]
                print(
                    f"  {key:13s} {label:20s} base {v['baseline_rate']:.3f}% "
                    f"reform {v['reform_rate']:.3f}% lifted {v['lifted']:,.0f} "
                    f"pushed {v['pushed']:,.0f}"
                )
            print(f"  {key} flips: {r[f'{key}_flipped_summary']}")
        print(
            f"  AGI>=$500k people {r['agi_500k_plus_people']:,.0f}; in poverty "
            f"(model) {r['agi_500k_plus_in_poverty_model']:,.0f}, (with omitted "
            f"income) {r['agi_500k_plus_in_poverty_with_omitted']:,.0f}; omitted "
            f"income total ${r['omitted_income_total'] / 1e9:,.2f}B"
        )
    print(f"\nWrote {out}")
