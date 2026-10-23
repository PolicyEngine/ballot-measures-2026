"""Modal data pipeline for the 2026 ballot measures dashboard (detach-safe).

Every number on the dashboard's statewide, distributional and district
views comes from this file:

1. ``build_subsets`` (one 64 GB container) downloads the national Populace
   ACS local-area file once, writes a subset for each state with a measure
   (CO, CA, WA, ND, SD) and gives every SPM unit an adult. Subsets are
   cached on the results Volume under ``cache/``, keyed by dataset revision.
2. ``run_pass`` / ``run_pass_xl`` simulate one (measure, year, policy) each,
   baseline and reform in separate containers, and save numpy arrays to
   ``runs/<revision>/passes/<slug>/<year>/<policy>.npz``. A pass whose saved
   key (policy overrides, pin, schema) matches is skipped, so reruns resume.
3. ``reduce`` turns each baseline/reform pair into a partial result
   (``runs/<revision>/partials/<slug>__<year>.json``), refusing to write one
   if the measure's target variable does not move the expected way.
4. ``run_all`` orchestrates 1-3 and writes the CSVs, ``measures.json`` and
   ``manifest.json`` under ``runs/<revision>/``.

Everything is committed to the Volume as it is produced, so a dead local
driver loses nothing. On Windows, export PYTHONIOENCODING=utf-8 PYTHONUTF8=1
before any modal command.

    modal run scripts/modal_pipeline.py::preflight          # minutes
    modal run --detach scripts/modal_pipeline.py::kickoff   # spawn, exit
    modal run scripts/modal_pipeline.py::status             # progress
    modal run scripts/modal_pipeline.py::fetch              # verify, download

``kickoff --only co-prop-nn`` (or ``--only wa-i-645:2029``) recomputes the
named measure-years and rebuilds the CSVs from every partial on the Volume.
``--revision buildo-0923`` (an alias in ballot_calc.config, or a full
revision) picks another dataset build.

Direction and signs follow scripts/DATA_SCHEMA.md: impact = (measure
passes) - (current law); a positive budget impact means the government
gains.
"""

import json
import os
import sys
import time
from datetime import UTC
from pathlib import Path

import modal

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from ballot_calc.config import (
    DEFAULT_REVISION,
    PIPELINE_APP_NAME,
    POPULACE_FILENAME,
    POPULACE_REPO,
    RESULTS_VOLUME_NAME,
    resolve_revision,
)

# Exact policyengine-us pin, mirrored from ballot_calc/config.py (and
# pyproject.toml, scripts/modal_tests.py, scripts/modal_household_api.py);
# tests/test_registry.py keeps them equal.
POLICYENGINE_US_PIN = "policyengine-us==2.60.4"

RESULTS_DIR = "/results"
MANIFEST_NAME = "manifest.json"
MEASURES_JSON = "measures.json"
# States whose passes need the 128 GB container (California is the largest
# subset and its measure is scored for 2031, seven years past the data).
XL_STATES = ("CA",)

app = modal.App(PIPELINE_APP_NAME)
volume = modal.Volume.from_name(RESULTS_VOLUME_NAME, create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.13")
    .pip_install(POLICYENGINE_US_PIN, "numpy>=1.24.0", "huggingface_hub")
    .add_local_python_source("ballot_calc")
)


def _run_dir(revision: str) -> str:
    """Volume-relative directory for one dataset revision's outputs."""
    return f"runs/{resolve_revision(revision)}"


def _peak_rss_gb() -> float:
    import resource

    # ru_maxrss is in kilobytes on Linux.
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024**2


def _write_json(path: str, payload) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(payload, fh, indent=2)
    os.replace(tmp, path)


def _read_json(path: str):
    with open(path) as fh:
        return json.load(fh)


# ---------------------------------------------------------------------------
# 1. State subsets
# ---------------------------------------------------------------------------


@app.function(
    image=image,
    memory=65536,
    cpu=4,
    timeout=3 * 3600,
    volumes={RESULTS_DIR: volume},
)
def build_subsets(revision: str = DEFAULT_REVISION, states: list | None = None) -> dict:
    """Build (or reuse) every state's raw and SPM-cleaned subset.

    Loads the national tables once for all states that need a raw subset.
    Returns ``{state: {"path", "subset", "spm_cleaning", "peak_rss_gb"}}``.
    """
    import pandas as pd

    from ballot_calc.measures import states_used
    from ballot_calc.subset import (
        build_state_subsets,
        clean_filename,
        clean_spm_composition,
        is_valid_dataset,
        load_dataset_path,
        subset_filename,
    )

    volume.reload()
    revision = resolve_revision(revision)
    states = list(states or states_used())
    cache_dir = os.path.join(RESULTS_DIR, "cache")
    os.makedirs(cache_dir, exist_ok=True)
    raw = {st: os.path.join(cache_dir, subset_filename(st, revision)) for st in states}

    todo = {st: path for st, path in raw.items() if not is_valid_dataset(path)}
    if todo:
        print(f"Building raw subsets for {sorted(todo)} from {revision}...")
        national_path = load_dataset_path(revision)

        def _saved(state):
            volume.commit()
            print(f"Checkpointed {state} subset.")

        stats = build_state_subsets(national_path, todo, on_saved=_saved)
        for state, state_stats in stats.items():
            _write_json(raw[state] + ".stats.json", state_stats)
        volume.commit()
    else:
        print(f"Raw subset cache hit for {states}.")

    results = {}
    for state in states:
        stats_path = raw[state] + ".stats.json"
        if os.path.exists(stats_path):
            subset_stats = _read_json(stats_path)
        else:
            household = pd.read_hdf(raw[state], "household")
            subset_stats = {
                "households": len(household),
                "district_geoids": sorted(
                    int(g) for g in household["congressional_district_geoid"].unique()
                ),
                "weighted_households": float(household["household_weight"].sum()),
            }
            _write_json(stats_path, subset_stats)
        clean = os.path.join(cache_dir, clean_filename(state, revision))
        clean_stats_path = clean + ".stats.json"
        if is_valid_dataset(clean) and os.path.exists(clean_stats_path):
            print(f"Cleaned {state} subset cache hit: {clean}")
            cleaning = _read_json(clean_stats_path)
        else:
            cleaning = clean_spm_composition(raw[state], clean)
            _write_json(clean_stats_path, cleaning)
            volume.commit()
        results[state] = {
            "path": clean,
            "subset": subset_stats,
            "spm_cleaning": cleaning,
        }
    peak = _peak_rss_gb()
    for value in results.values():
        value["build_peak_rss_gb"] = peak
    print(f"Subsets ready (peak RSS {peak:.1f} GB): {json.dumps(results, indent=2)}")
    return results


# ---------------------------------------------------------------------------
# 2. Passes
# ---------------------------------------------------------------------------


def _pass_paths(run_dir: str, slug: str, year: int, policy: str) -> tuple[str, str]:
    base = os.path.join(RESULTS_DIR, run_dir, "passes", slug, str(year), policy)
    return base + ".npz", base + ".json"


def _run_pass(slug: str, year: int, policy: str, dataset_path: str, run_dir: str):
    import numpy as np

    from ballot_calc.measures import MEASURES
    from ballot_calc.passes import pass_key, run_pass

    volume.reload()
    measure = MEASURES[slug]
    key = pass_key(measure, year, policy)
    npz_path, meta_path = _pass_paths(run_dir, slug, year, policy)
    if os.path.exists(npz_path) and os.path.exists(meta_path):
        meta = _read_json(meta_path)
        if meta.get("key") == key:
            print(f"Pass {slug} {year} {policy} cached ({key}); skipping.")
            return {**meta, "skipped": True}
    print(f"Running pass {slug} {year} {policy} on {dataset_path}...")
    start = time.time()
    arrays = run_pass(measure, year, policy, dataset_path)
    seconds = time.time() - start
    peak = _peak_rss_gb()
    os.makedirs(os.path.dirname(npz_path), exist_ok=True)
    tmp = npz_path + ".tmp.npz"
    np.savez_compressed(tmp, **arrays)
    os.replace(tmp, npz_path)
    meta = {
        "slug": slug,
        "year": year,
        "policy": policy,
        "key": key,
        "pin": POLICYENGINE_US_PIN,
        "dataset_path": dataset_path,
        "households": len(arrays["hh_weight"]),
        "persons": len(arrays["p_weight"]),
        "seconds": round(seconds, 1),
        "peak_rss_gb": round(peak, 2),
    }
    _write_json(meta_path, meta)
    volume.commit()
    print(f"Pass {slug} {year} {policy}: {seconds:.0f}s, peak RSS {peak:.1f} GB")
    return {**meta, "skipped": False}


@app.function(
    image=image,
    memory=32768,
    timeout=3 * 3600,
    retries=1,
    volumes={RESULTS_DIR: volume},
)
def run_pass(slug: str, year: int, policy: str, dataset_path: str, run_dir: str):
    return _run_pass(slug, year, policy, dataset_path, run_dir)


@app.function(
    image=image,
    memory=131072,
    timeout=5 * 3600,
    retries=1,
    volumes={RESULTS_DIR: volume},
)
def run_pass_xl(slug: str, year: int, policy: str, dataset_path: str, run_dir: str):
    return _run_pass(slug, year, policy, dataset_path, run_dir)


# ---------------------------------------------------------------------------
# 3. Reduce
# ---------------------------------------------------------------------------


@app.function(
    image=image,
    memory=16384,
    timeout=3600,
    volumes={RESULTS_DIR: volume},
)
def reduce(slug: str, year: int, run_dir: str, filers: dict | None = None) -> dict:
    """Reduce one baseline/reform pair to a partial result (metrics,
    deciles, winners and losers, income bands, districts). ``filers`` is
    the state's SOI filer tabulation (income tax measures)."""
    import numpy as np

    from ballot_calc.measures import MEASURES
    from ballot_calc.metrics import compute_measure_year

    volume.reload()
    arrays, pass_keys = {}, {}
    for policy in ("baseline", "reform"):
        npz_path, meta_path = _pass_paths(run_dir, slug, year, policy)
        with np.load(npz_path) as data:
            arrays[policy] = {name: data[name] for name in data.files}
        pass_keys[policy] = _read_json(meta_path)["key"]
    partial = compute_measure_year(
        MEASURES[slug], year, arrays["baseline"], arrays["reform"], filers=filers
    )
    partial["pass_keys"] = pass_keys
    path = os.path.join(RESULTS_DIR, run_dir, "partials", f"{slug}__{year}.json")
    _write_json(path, partial)
    volume.commit()
    metrics = partial["metrics"]
    print(
        f"{slug} {year}: state budget {metrics['state_budget_impact']:,.0f}; "
        f"target change {metrics['target_change']:,.1f}"
    )
    return partial


@app.function(
    image=image,
    memory=32768,
    timeout=3600,
    volumes={RESULTS_DIR: volume},
)
def filer_tail(state: str, revision: str, dataset_path: str) -> dict:
    """Tabulate a state's filers by AGI in the dataset's own year, for the
    IRS SOI comparison (ballot_calc/metrics/top_tail.py). Cached on the
    Volume per pin and revision."""
    import numpy as np
    from policyengine_us import Microsimulation

    from ballot_calc.metrics.top_tail import FILER_YEAR, tabulate

    volume.reload()
    path = os.path.join(
        RESULTS_DIR, _run_dir(revision), "diagnostics", f"filers_{state}.json"
    )
    if os.path.exists(path):
        cached = _read_json(path)
        if cached.get("pin") == POLICYENGINE_US_PIN:
            return cached["filers"]
    sim = Microsimulation(dataset=dataset_path, dataset_end_year=FILER_YEAR)
    agi = np.asarray(sim.calculate("adjusted_gross_income", FILER_YEAR))
    weight = np.asarray(sim.calculate("tax_unit_weight", FILER_YEAR))
    filer = np.asarray(sim.calculate("tax_unit_is_filer", FILER_YEAR)).astype(bool)
    filers = tabulate(agi[filer], weight[filer])
    record = {
        "pin": POLICYENGINE_US_PIN,
        "state": state,
        "year": FILER_YEAR,
        "filers": filers,
    }
    _write_json(path, record)
    volume.commit()
    return filers


def _saved_pass_key(run_dir: str, slug: str, year: int, policy: str):
    npz_path, meta_path = _pass_paths(run_dir, slug, year, policy)
    if not (os.path.exists(npz_path) and os.path.exists(meta_path)):
        return None
    return _read_json(meta_path).get("key")


# ---------------------------------------------------------------------------
# 4. Orchestration
# ---------------------------------------------------------------------------


def _parse_only(only: str) -> list:
    from ballot_calc.measures import MEASURES, measure_years

    pairs = measure_years()
    if not only:
        return pairs
    selected = []
    for token in (t.strip() for t in only.split(",") if t.strip()):
        slug, _, year = token.partition(":")
        if slug not in MEASURES:
            raise ValueError(f"Unknown measure {slug!r}")
        selected += [
            p for p in pairs if p[0] == slug and (not year or p[1] == int(year))
        ]
    if not selected:
        raise ValueError(f"--only {only!r} selects nothing")
    return selected


@app.function(
    image=image,
    memory=8192,
    timeout=10 * 3600,
    volumes={RESULTS_DIR: volume},
)
def run_all(revision: str = DEFAULT_REVISION, only: str = "") -> dict:
    """Subsets, the selected passes in parallel, then reduce EVERY
    measure-year whose saved passes match the current registry, and write
    the CSVs, measures.json and manifest.json under runs/<revision>/.
    Measure-years with missing or stale passes are left out and listed in
    the manifest."""
    from datetime import datetime

    import pandas as pd

    from ballot_calc.export import measures_json, registry_hash
    from ballot_calc.measures import MEASURES, measure_years
    from ballot_calc.metrics import SPM_RESOURCES_ADJUSTMENT
    from ballot_calc.metrics.top_tail import state_summary
    from ballot_calc.outputs import COLUMNS, CSV_FILES, build_csv_rows
    from ballot_calc.passes import POLICIES, pass_key

    revision = resolve_revision(revision)
    run_dir = _run_dir(revision)
    out_dir = os.path.join(RESULTS_DIR, run_dir)
    selected = _parse_only(only)
    subsets = build_subsets.remote(revision)
    income_tax_states = sorted(
        {m.state for m in MEASURES.values() if m.kind == "income_tax"}
    )
    filer_calls = {
        state: filer_tail.spawn(state, revision, subsets[state]["path"])
        for state in income_tax_states
    }

    calls = {}
    for slug, year in selected:
        state = MEASURES[slug].state
        fn = run_pass_xl if state in XL_STATES else run_pass
        for policy in ("baseline", "reform"):
            calls[(slug, year, policy)] = fn.spawn(
                slug, year, policy, subsets[state]["path"], run_dir
            )
    passes, failures = {}, {}
    for (slug, year, policy), call in calls.items():
        try:
            passes[f"{slug}:{year}:{policy}"] = call.get()
        except Exception as err:  # noqa: BLE001 - report every failed pass
            failures[f"{slug}:{year}:{policy}"] = repr(err)
            print(f"PASS FAILED {slug} {year} {policy}: {err!r}")
    filers = {state: call.get() for state, call in filer_calls.items()}

    # Reduce every measure-year whose saved passes match the registry, so
    # all partials come from the current reducer.
    volume.reload()
    current, stale = [], []
    for slug, year in measure_years():
        measure = MEASURES[slug]
        failed = any(k.startswith(f"{slug}:{year}:") for k in failures)
        keys_match = all(
            _saved_pass_key(run_dir, slug, year, policy)
            == pass_key(measure, year, policy)
            for policy in POLICIES
        )
        (current if keys_match and not failed else stale).append((slug, year))
    for slug, year in stale:
        print(f"STALE or missing passes: {slug} {year}")
        path = os.path.join(out_dir, "partials", f"{slug}__{year}.json")
        if os.path.exists(path):
            os.remove(path)
    args = [
        (slug, year, run_dir, filers.get(MEASURES[slug].state))
        for slug, year in current
    ]
    partials = {}
    for (slug, year), partial in zip(
        current, reduce.starmap(args, return_exceptions=True)
    ):
        if isinstance(partial, BaseException):
            failures[f"{slug}:{year}:reduce"] = repr(partial)
            print(f"REDUCE FAILED {slug} {year}: {partial!r}")
            path = os.path.join(out_dir, "partials", f"{slug}__{year}.json")
            if os.path.exists(path):
                os.remove(path)
        else:
            partials[(slug, year)] = partial
            print(f"Reduced {slug} {year}")

    missing = [f"{s}:{y}" for s, y in measure_years() if (s, y) not in partials]
    volume.reload()
    csvs = build_csv_rows(partials)
    for filename, rows in csvs.items():
        frame = pd.DataFrame(rows, columns=list(COLUMNS[filename]))
        frame.to_csv(os.path.join(out_dir, filename), index=False)
        print(f"  Wrote {filename} ({len(rows)} rows)")
    _write_json(os.path.join(out_dir, MEASURES_JSON), measures_json())

    previous = {}
    manifest_path = os.path.join(out_dir, MANIFEST_NAME)
    if os.path.exists(manifest_path):
        previous = _read_json(manifest_path)
    top_tail = {state: state_summary(state, tab) for state, tab in filers.items()}
    pass_log = {**previous.get("passes", {}), **passes}
    manifest = {
        "generated_at_utc": datetime.now(UTC).isoformat(),
        "pin": POLICYENGINE_US_PIN,
        "dataset_repo": POPULACE_REPO,
        "dataset_revision": revision,
        "dataset_filename": POPULACE_FILENAME,
        "registry_hash": registry_hash(),
        # Income added to SPM resources for the poverty metrics, and why.
        "spm_resources_adjustment": SPM_RESOURCES_ADJUSTMENT,
        "measure_years": [f"{slug}:{year}" for slug, year in partials],
        "missing_measure_years": missing,
        "complete": not missing and not failures,
        "failures": failures,
        "files": list(CSV_FILES) + [MEASURES_JSON],
        "subsets": {**previous.get("subsets", {}), **subsets},
        "guards": {
            f"{slug}:{year}": partial["guard"]
            for (slug, year), partial in partials.items()
        },
        "headline": {
            f"{slug}:{year}": {
                key: partial["metrics"].get(key)
                for key in (
                    MEASURES[slug].headline_metric,
                    "state_budget_impact",
                    "target_change",
                    "effective_sample_households",
                )
            }
            for (slug, year), partial in partials.items()
        },
        "partial_keys": {
            f"{slug}:{year}": partial.get("pass_keys")
            for (slug, year), partial in partials.items()
        },
        "passes": pass_log,
        "peak_rss_gb": {key: meta.get("peak_rss_gb") for key, meta in pass_log.items()},
        "diagnostics": {
            f"{slug}:{year}": partial.get("diagnostics")
            for (slug, year), partial in partials.items()
        },
        # IRS SOI comparison per state; the per-measure coverage-scaled
        # revenue is in metrics.csv (revenue_coverage_scaled).
        "top_tail": top_tail,
    }
    _write_json(manifest_path, manifest)
    volume.commit()
    print(
        f"COMPLETE={manifest['complete']} ({revision}): {json.dumps(manifest['headline'])}"
    )
    if failures:
        raise RuntimeError(f"Failures: {failures}")
    return manifest


# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------


@app.function(
    image=image, memory=16384, cpu=2, timeout=3600, volumes={RESULTS_DIR: volume}
)
def preflight_check() -> list:
    """One household per measure through the pipeline's own policies."""
    from ballot_calc.measures import MEASURES, measure_years
    from ballot_calc.passes import preflight_measure

    records = []
    for slug, year in measure_years():
        try:
            records += preflight_measure(MEASURES[slug], year)
        except Exception as err:  # noqa: BLE001 - report every measure
            records.append(
                {
                    "measure": slug,
                    "year": year,
                    "variable": None,
                    "ok": False,
                    "error": repr(err),
                }
            )
    volume.reload()
    _write_json(
        os.path.join(RESULTS_DIR, "preflight", f"{POLICYENGINE_US_PIN}.json"), records
    )
    volume.commit()
    return records


# ---------------------------------------------------------------------------
# Local entrypoints
# ---------------------------------------------------------------------------


@app.local_entrypoint()
def preflight():
    """modal run scripts/modal_pipeline.py::preflight"""
    records = preflight_check.remote()
    bad = 0
    for r in records:
        status = "ok " if r["ok"] else "BAD"
        bad += not r["ok"]
        if r.get("error"):
            print(f"{status} {r['measure']} {r['year']}: {r['error']}")
            continue
        print(
            f"{status} {r['measure']} {r['year']} | {r['case']} | {r['variable']}: "
            f"{r['baseline']:,.2f} -> {r['reform']:,.2f}"
            + (
                f" (missing {r['missing_variables']})"
                if r.get("missing_variables")
                else ""
            )
        )
    if bad:
        raise SystemExit(f"{bad} preflight checks failed")
    print("Preflight passed.")


@app.local_entrypoint()
def build(revision: str = DEFAULT_REVISION, states: str = ""):
    """Spawn the subset build alone:
    modal run --detach scripts/modal_pipeline.py::build [--states ND,SD]"""
    call = build_subsets.spawn(revision, [s for s in states.split(",") if s] or None)
    print(f"Spawned build_subsets: {call.object_id}")


@app.local_entrypoint()
def kickoff(revision: str = DEFAULT_REVISION, only: str = ""):
    """Fire-and-forget:
    modal run --detach scripts/modal_pipeline.py::kickoff [--only slug[:year],...]"""
    print(
        f"Kicking off the ballot measures pipeline ({POLICYENGINE_US_PIN}, {revision})"
    )
    call = run_all.spawn(revision, only)
    print(f"Spawned run_all: {call.object_id}")
    print(
        f"Results go to volume '{RESULTS_VOLUME_NAME}' under {_run_dir(revision)}/. "
        f"Fetch with: modal run scripts/modal_pipeline.py::fetch --revision {revision}"
    )


@app.local_entrypoint()
def status(revision: str = DEFAULT_REVISION):
    """List the passes and partials on the Volume for a revision."""
    run_dir = _run_dir(revision)
    for sub in ("passes", "partials"):
        try:
            entries = volume.listdir(f"{run_dir}/{sub}", recursive=True)
        except Exception as err:  # noqa: BLE001
            print(f"{sub}: none ({err})")
            continue
        for entry in sorted(entries, key=lambda e: e.path):
            if entry.path.endswith((".json", ".npz")):
                print(f"{entry.path}  {entry.size / 1e6:,.1f} MB")


@app.local_entrypoint()
def fetch(
    revision: str = DEFAULT_REVISION,
    output_dir: str = "",
    allow_incomplete: bool = False,
):
    """Verify a run's manifest (pin, registry hash, completeness), then
    download its CSVs, measures.json and manifest.json (default into
    frontend/public/data/)."""
    from ballot_calc.export import registry_hash
    from ballot_calc.measures import measure_years
    from ballot_calc.metrics import SPM_RESOURCES_ADJUSTMENT
    from ballot_calc.outputs import CSV_FILES

    output_dir = output_dir or str(REPO_ROOT / "frontend" / "public" / "data")
    os.makedirs(output_dir, exist_ok=True)
    run_dir = _run_dir(revision)

    def read(name: str) -> bytes:
        return b"".join(volume.read_file(f"{run_dir}/{name}"))

    try:
        manifest = json.loads(read(MANIFEST_NAME))
    except Exception as err:  # noqa: BLE001
        raise SystemExit(
            f"No readable {run_dir}/{MANIFEST_NAME} in volume '{RESULTS_VOLUME_NAME}' "
            f"({err}). The job may still be running -- check `modal app list`."
        )
    print(f"Manifest generated {manifest['generated_at_utc']}")
    print(f"  pin {manifest['pin']}; dataset {manifest['dataset_revision']}")
    problems = []
    if manifest["pin"] != POLICYENGINE_US_PIN:
        problems.append(f"pin {manifest['pin']} != local {POLICYENGINE_US_PIN}")
    if manifest["registry_hash"] != registry_hash():
        problems.append(
            f"registry hash {manifest['registry_hash']} != local {registry_hash()} "
            "(ballot_calc/measures.py changed since the run)"
        )
    if manifest.get("spm_resources_adjustment") != SPM_RESOURCES_ADJUSTMENT:
        problems.append(
            "the run's SPM resources adjustment differs from the local reducer "
            "(ballot_calc/metrics/__init__.py)"
        )
    expected = {f"{slug}:{year}" for slug, year in measure_years()}
    missing = expected - set(manifest["measure_years"])
    if missing or not manifest.get("complete"):
        problems.append(
            f"incomplete run: missing {sorted(missing)}; failures {manifest.get('failures')}"
        )
    if problems and not allow_incomplete:
        raise SystemExit("Refusing to fetch: " + "; ".join(problems))
    for problem in problems:
        print(f"WARNING: {problem}")
    for filename in list(CSV_FILES) + [MEASURES_JSON, MANIFEST_NAME]:
        with open(os.path.join(output_dir, filename), "wb") as fh:
            fh.write(read(filename))
        print(f"Saved {filename}")
    for key, value in manifest["headline"].items():
        print(f"  {key}: {value}")
    print(f"Done: {output_dir}")
