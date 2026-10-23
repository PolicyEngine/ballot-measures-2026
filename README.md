# 2026 ballot measures dashboard

PolicyEngine's dashboard of state ballot measures on the November 3, 2026
ballot that change household taxes or benefits, served at
`policyengine.org/us/ballot-measures-2026`. For each measure it shows what
happens to households and the state budget if the measure passes, compared
with current law, next to the official estimates.

| Measure | What passing it does | Tax years | Kind |
|---|---|---|---|
| Colorado Amendment 87 | Six graduated income tax rates (3.7%-8.4%) replace the 4.4% flat rate | 2027 | income tax |
| Colorado Proposition NN | The state keeps the TABOR surplus, so no six-tier sales tax refund | 2027, 2028 | TABOR refund |
| California Proposition 3 | The 10.3%, 11.3% and 12.3% rates continue after 2030 | 2031 | income tax |
| Washington Initiative 645 | Repeals the 9.9% tax on income over $1 million | 2028, 2029 | income tax |
| North Dakota Measure No. 2 | Free breakfast and lunch at every public school | 2028 | school meals |
| South Dakota Amendment I | Scenario: Medicaid expansion ends if the federal share falls below 90% | 2028 | Medicaid |

`ballot_calc/measures.py` is the single source of truth for each measure:
the parameter overrides that define current law and the measure passing,
the years scored, the variables that carry the budget effect, the official
estimates and the North Dakota participation inputs. Impact everywhere is
(measure passes) − (current law).

## Layout

- `ballot_calc/` — registry (`measures.py`, `states.py`, `config.py`),
  state subsets (`subset.py`), one simulation pass per measure-year-policy
  (`passes.py`), pure-numpy reducers (`metrics/`), CSV rows (`outputs.py`),
  the `measures.json` export (`export.py`) and the household calculator
  (`household.py`).
- `scripts/modal_pipeline.py` — the Modal pipeline behind every statewide,
  distributional and district figure; `scripts/DATA_SCHEMA.md` is the data
  contract the frontend codes against.
- `scripts/modal_household_api.py`, `scripts/compute_example_households.py`
  — the household calculator endpoint and the precomputed examples.
- `scripts/diagnostics/` — `tail_analysis.py` prints the IRS SOI top-income
  comparison the pipeline computes for CO, CA and WA (`top_tail.json`);
  `poverty_flips.py` breaks down who crosses the poverty line in the
  top-income measures (`poverty_flips.json`).
- `frontend/` — Next.js dashboard (landing page plus one route per measure).

## How the numbers are made

- **Model**: `policyengine-us==2.60.4` (pinned in `pyproject.toml`,
  `ballot_calc/config.py` and the Modal scripts; a test keeps them equal).
- **Data**: the Populace ACS local-area national file
  (`policyengine/populace-us`, `populace_us_2024_acs_local.h5`, revision
  `populace-us-2024-buildo-acs-local-766b7c7-20261017T030317Z`).
- **Subsets**: one 64 GB Modal container loads the national tables once and
  writes each state's households (with their people, tax units, SPM units,
  families and marital units, weights unchanged). Model inputs that are NaN
  in the national file (`parent_1_id`/`parent_2_id` for CPS-donor records)
  take their defaults, and SPM units without an adult are fixed.
- **Passes**: each (measure, year) runs a current-law and a passes
  simulation in separate containers (`dataset_end_year` = the scored year;
  peak memory 1.5-15 GB). Household net income is computed first
  (policyengine-us#9740). Passes are cached on the Volume by a key of their
  overrides, pin and array schema.
- **Guard**: a measure-year's results are written only if its target
  variable moves the expected way by more than 0.1% of its current-law total.
- **Poverty**: SPM resources get back the partnership and S corporation
  income, farm rent and Alaska dividend that policyengine-us 2.60.4 leaves
  out of them while taxing (policyengine-us#9919); see
  `scripts/DATA_SCHEMA.md`.
- **South Dakota**: the model has about twice the administrative expansion
  enrollment, so coverage and budget figures are scaled to DSS's 29,055
  (unscaled values keep a `_model` suffix).
- **Top incomes**: headlines are the model's own numbers; the IRS
  SOI-coverage-scaled revenue (`revenue_coverage_scaled`) is for the
  methodology tab. District breakdowns are shown only for the two Colorado
  measures (`show_districts`).
- **North Dakota**: the model values meals at 100% take-up for every child
  aged 5-17; the dashboard's figures are participation-adjusted (current
  participation for the low case, plus the rise seen in universal-meal
  states for the high case; see `scripts/DATA_SCHEMA.md`).

## Running it

Heavy compute runs on Modal (profile `policyengine`); never run
microsimulations locally. On Windows, the Make targets set
`PYTHONIOENCODING=utf-8 PYTHONUTF8=1`, which the Modal CLI needs.

```bash
# One-time setup
uv venv --python 3.13 .venv
uv pip install -p .venv/Scripts/python.exe -e ".[dev]"

make test-python      # fast tests, no policyengine import (seconds)
make export           # rewrite frontend/public/data/measures.json
make preflight        # one household per measure through the pipeline's policies
make pipeline         # spawn the full run (subsets, 16 passes, reduce); detach-safe
make pipeline-status  # passes and partials on the Volume
make pipeline-fetch   # verify pin, registry hash, completeness; download the files
make top-tail         # print the IRS SOI top-income comparison (CO, CA, WA)
make poverty-flips    # who crosses the poverty line in the top-income measures
make test-slow        # slow household tests on Modal
```

Rerun part of the pipeline with
`modal run --detach scripts/modal_pipeline.py::kickoff --only co-prop-nn`
(or `--only wa-i-645:2029`); cached passes are skipped and the CSVs are
rebuilt from every partial on the Volume. `--revision buildo-0923` selects
the earlier dataset build.

After changing a computational field in `ballot_calc/measures.py`, rerun the
pipeline and fetch: `make pipeline-fetch` refuses results whose registry
hash differs from the local registry, and `tests/test_csv_data.py` skips
until they match.

## Frontend

```bash
cd frontend
npm install
npm run dev    # local dev
npm test       # vitest
npm run build  # production build (basePath /us/ballot-measures-2026)
```

## Deploy

Branch + pull request + Vercel preview; production deploys (Vercel and the
Modal household endpoint) only after the dashboard PR is approved.
