# Data contract: 2026 ballot measures dashboard

The files in `frontend/public/data/` that the frontend reads. The Modal
pipeline (`scripts/modal_pipeline.py`) writes the five CSVs, `measures.json`
and `manifest.json`; `make pipeline-fetch` downloads them after checking the
pin, the registry hash and completeness. `example_households.json` comes from
the household pipeline (`scripts/compute_example_households.py`) and is
documented there.

## Conventions

- **Direction.** Every change is (measure passes) − (current law), for one
  tax year. Current law includes each measure's `baseline_overrides` (for
  Proposition NN, the September 2026 forecast refund tiers); the passes
  policy merges `reform_overrides` over them (`ballot_calc/measures.py`).
- **Household side.** A positive net-income change means the household gains.
- **Budget side.** Signed from the government's side: a positive
  `*_budget_impact` means the government gains revenue or spends less.
  `*_revenue_impact` and `*_spending_impact` are the changes in collections and
  in spending (positive = up); `*_budget_impact` = revenue − spending.
- **Units.** Dollars are annual (tax-year) dollars of that year. `*_rate`
  values are percents (12.3 = 12.3%); `*_rate_change` values are percentage
  points; `*_percent_change` values are percents of the current-law rate;
  `*_share` and `relative_*` values are fractions (0.05 = 5%).
- **Weights.** Household counts are weighted households; person counts are
  weighted people; tax-unit counts are weighted tax units.
- **Winners and losers** (metrics, income brackets, districts): households
  whose net income changes by more than $1 either way.
- **Scope.** Each measure is simulated on its state's households only. The
  model scores tax-year liability and benefit values; official estimates are
  usually by state fiscal year (see `official_estimates` in `measures.json`).
- **Federal revenue.** The federal SALT deduction in policyengine-us 2.60.4
  reads an imputed `state_withheld_income_tax`, so federal income tax does not
  respond to state income tax changes; `federal_revenue_impact` is 0 for the
  income tax measures by construction.

Every CSV is long format with `measure` (registry slug) and `year` (tax year)
columns. Rows follow the registry order of measures and years.

| measure | years | kind | districts |
|---|---|---|---|
| `co-amendment-87` | 2027 | income_tax | 8 (CO-01 … CO-08) |
| `co-prop-nn` | 2027, 2028 | tabor_refund | 8 |
| `ca-prop-3` | 2031 | income_tax | 52 (CA-01 … CA-52) |
| `wa-i-645` | 2028, 2029 | income_tax | 10 (WA-01 … WA-10) |
| `nd-measure-2` | 2028 | school_meals | none (at large) |
| `sd-amendment-i` | 2028 | medicaid | none (at large) |

## `metrics.csv`

Columns: `measure,year,metric,value`. Every measure-year has every core
metric plus its kind's metrics, in the order below.

### Core metrics (every measure)

| metric | meaning |
|---|---|
| `households` | Weighted households in the state |
| `sample_households` | Survey household records in the state subset |
| `effective_sample_households` | Kish effective sample size of the household weights, (Σw)²/Σw² |
| `affected_sample_households` | Records whose net income changes by more than $1 |
| `effective_affected_sample_households` | Kish effective sample size of those records |
| `net_income_change_total` | Σ weighted change in household net income |
| `avg_household_net_income_change` | Per household, over all households |
| `winners`, `losers` | Weighted households gaining / losing more than $1 |
| `winners_rate`, `losers_rate` | Percent of households |
| `avg_gain`, `avg_loss` | Average change among winners (positive) / losers (negative) |
| `{poverty,child_poverty,deep_poverty,deep_child_poverty}_baseline_rate` | SPM poverty rate under current law, percent of people (children: under 18). Deep poverty: below half the SPM threshold |
| `…_reform_rate` | The same if the measure passes |
| `…_rate_change` | reform − baseline, percentage points (negative = poverty falls) |
| `…_percent_change` | rate change as a percent of the baseline rate |
| `people_lifted_out_of_poverty` | Weighted people in poverty under current law but not if the measure passes |
| `people_pushed_into_poverty` | The reverse |
| `children_lifted_out_of_poverty` | People under 18 lifted out |
| `state_revenue_impact` | Change in the measure's state revenue variables |
| `state_spending_impact` | Change in the measure's state spending (see kinds) |
| `state_budget_impact` | `state_revenue_impact − state_spending_impact` (headline for most measures) |
| `federal_revenue_impact`, `federal_spending_impact`, `federal_budget_impact` | The same for the federal government |
| `target_change` | Weighted change in the measure's `target_variable` (summed to households). The pipeline refuses to write results unless it moves in the direction of `target_sign` by more than 0.1% of its current-law total |

Revenue and spending variables per measure are in `measures.json`
(`state_revenue_variables`, etc.).

### `income_tax` (CO Amendment 87, CA Proposition 3, WA I-645)

Over tax units, using the measure's state income tax (`target_variable`).
Tax changes are signed from the taxpayer's side (positive = pays more).

| metric | meaning |
|---|---|
| `tax_units_paying_more`, `tax_units_paying_less` | Weighted tax units whose state income tax changes by more than $1 |
| `avg_tax_change_paying_more`, `avg_tax_change_paying_less` | Average change among them |
| `revenue_share_agi_1m_plus` | Share of the total state tax change from tax units with current-law AGI ≥ $1M. Exceeds 1 when lower-income tax units pay less (CO Amendment 87) |
| `baseline_state_income_tax` | Current-law state income tax, all tax units |

### `tabor_refund` (CO Proposition NN)

| metric | meaning |
|---|---|
| `refund_total_baseline` | Current-law six-tier sales tax refund, all tax units |
| `refund_recipients_baseline` | Weighted tax units receiving one |
| `avg_refund_baseline` | Per recipient tax unit (joint returns get two per-person amounts) |

`co_income_tax` nets the refundable refund, so the state revenue impact of
keeping the surplus is the refund total.

### `school_meals` (ND Measure No. 2)

The model values meals as if every child aged 5-17 ate both meals on every
one of 180 school days. The participation adjustment
(`ballot_calc/metrics/school_meals.py`) scales each SPM unit's change:

    adjusted = s × 180 × K-12 children × (r_L × Δlunch + r_B × Δbreakfast)

`s` scales the model's K-12 children to public enrollment outside schools
that already serve every meal free (CEP); `r` is meals served per enrolled
student per school day. **Low** = current participation; **high** = current
plus the rise DPI assumed from states with universal meals (+9 points lunch,
+12 breakfast; `kind_params` in `measures.json` has every input and its
source). The **central** case (midpoint of low and high) drives the core
metrics, deciles, winners, income brackets and poverty (poverty is recomputed
as current-law SPM resources plus the adjusted change). The state pays each
adjusted meal's value, so `state_spending_impact` = central adjusted meal
value + administration ($300,000 per biennium, $150,000 a year).

| metric | meaning |
|---|---|
| `k12_children_model` | Weighted children aged 5-17 in the model |
| `children_newly_free_model` | Of them, those whose lunch becomes free (unadjusted) |
| `meal_value_change_model` | Unadjusted change in school meal value, 100% take-up |
| `meal_value_change_adjusted_low`, `_high` | Participation-adjusted meal value (= state meal cost) |
| `state_cost_adjusted_low`, `_high` | Adjusted meal cost + administration, per year |
| `state_cost_biennium_low`, `_high` | Twice the annual cost (compare with the official per-biennium range) |
| `participation_lunch`, `participation_breakfast` | Current participation rates (low case) |
| `enrollment_scale` | `s` |

### `medicaid` (SD Amendment I scenario)

Health benefits (Medicaid value and premium tax credits) count in household
net income in both simulations. Costs are changes, so negative = savings.

| metric | meaning |
|---|---|
| `people_losing_medicaid` | Weighted people enrolled under current law but not if expansion ends |
| `losing_below_100fpl` | Of them, Medicaid income below 100% of the poverty guideline (no marketplace subsidy: the coverage gap) |
| `losing_100_plus_fpl` | At or above 100% |
| `gaining_ptc` | People losing Medicaid whose tax unit's take-up-adjusted premium tax credit (`assigned_aca_ptc`) rises |
| `medicaid_cost_change` | Total Medicaid spending change |
| `medicaid_state_cost_change`, `medicaid_federal_cost_change` | Its state and federal shares |
| `ptc_change` | Change in `assigned_aca_ptc` |
| `baseline_expansion_enrollees` | People enrolled through the adult expansion group under current law (compare with the pamphlet's ~30,000) |

State spending is `medicaid_state_cost`; federal spending is
`medicaid_federal_cost` + `assigned_aca_ptc`.

## `distributional_impact.csv`

Columns: `measure,year,decile,average_change,relative_change`. Deciles 1-10
of current-law household net income within the state (household-weighted).
`average_change` is dollars per household; `relative_change` is the decile's
total change over its total current-law net income, counting negative
incomes as zero (a fraction).

## `winners_losers.csv`

Columns: `measure,year,decile,gain_more_5pct,gain_less_5pct,no_change,lose_less_5pct,lose_more_5pct`.
`decile` is `All` then `1`…`10`. Shares of people (household size × weight)
in each decile by relative change in household net income (change over
current-law net income floored at $1): more than 5%, 0.1%-5%, within 0.1%,
and the losses mirrored. Each row sums to 1; `All` averages the ten deciles.

## `income_brackets.csv`

Columns: `measure,year,bracket,households,winners,losers,total_change,average_change,state_budget_impact`.
Bands of household AGI under current law; labels and edges are each
measure's `income_bands` in `measures.json` (lower edge inclusive).
`total_change` and `average_change` are household net income;
`state_budget_impact` is the state budget effect attributed to the band's
households (ND: adjusted meal cost, without administration).

## `congressional_districts.csv`

Columns: `measure,year,district,state,households,average_household_income_change,relative_household_income_change,winners_share,losers_share,state_budget_impact`.
CO, CA and WA only (8, 52 and 10 districts per measure-year); `district` is
`CO-01` style (119th Congress, from the dataset's PUMA-based assignment).
`relative_household_income_change` = average change / average current-law
net income. No district poverty: district samples are too thin.

## `measures.json`

The registry (`python -m ballot_calc.export`): election date, pin,
`registry_hash`, and per measure every `Measure` field plus `state_name`,
`state_fips`, `has_districts`, `district_count`. Infinite band edges and the
SD `-inf` income limit are the strings `"Infinity"` / `"-Infinity"`.

## `manifest.json`

| key | meaning |
|---|---|
| `generated_at_utc` | When `run_all` wrote the files |
| `pin` | policyengine-us pin used |
| `dataset_repo`, `dataset_revision`, `dataset_filename` | Populace source file |
| `registry_hash` | Hash of the registry's computational fields; must equal `measures.json`'s |
| `measure_years`, `missing_measure_years`, `complete`, `failures` | Coverage of the run |
| `files` | Files written |
| `subsets` | Per state: subset path, household/person counts, district geoids, SPM cleaning counts, NaN inputs filled |
| `guards` | Per measure-year: target variable, expected sign, change and current-law total |
| `headline` | Per measure-year: headline metric, state budget impact, target change, effective sample |
| `passes`, `peak_rss_gb` | Per pass: key, seconds, households, persons, peak memory |
| `diagnostics` | Per measure-year reducer checks (poverty-flag agreement, unadjusted change, ND participation rates) |
| `top_tail` | IRS SOI Historic Table 2 comparison for CO, CA and WA (`scripts/diagnostics/tail_analysis.py`), or null |

## Dataset

Populace ACS local-area national file (`policyengine/populace-us`,
`populace_us_2024_acs_local.h5`), default revision
`populace-us-2024-buildo-acs-local-766b7c7-20261017T030317Z`. State subsets
keep each state's households with all their people and group units and
their weights. Two cleaning steps: model input columns with NaN (only
`parent_1_id`/`parent_2_id`, NaN for CPS-donor people) take the variable's
default (0 = parent unknown), and any SPM unit without an adult is fixed or
dropped (none in this build).
