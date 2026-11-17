<!--
Draft for PolicyEngine/policyengine-us. NOT FILED.

The bug is already open as PolicyEngine/policyengine-us#9919 ("SPM resources
leave out partnership/S-corp income (and other gross-income sources), while
SPM taxes include the tax on them", opened 2026-10-06, no comments as of
2026-10-23). Post the body below as a comment on #9919 rather than as a new
issue. It adds state-level evidence from the 2026 ballot measures dashboard:
reforms that flip the poverty status of high-income households, and the
size of the fix in five states. If a separate issue is preferred, use the
title below and keep the first line's reference to #9919.

Suggested title (only if filed separately):
SPM resources omit partnership/S-corp income and farm rent: high-AGI units count as poor and state tax reforms flip their poverty status
-->

Related to #9919: same root cause, with state-level evidence from scoring the 2026 state ballot measures. The figures use policyengine-us 2.60.4, the Populace ACS local-area build `populace-us-2024-buildo-acs-local-766b7c7-20261017T030317Z`, and state subsets of it. The code is unchanged on `main` as of 7b729556cb (2026-10-23).

## The inconsistency

- SPM resources: `policyengine_us/variables/household/income/spm_unit/spm_unit_net_income.py` adds `spm_unit_market_income` and `spm_unit_benefits`, and subtracts `spm_unit_taxes` and `spm_unit_spm_expenses`.
- `policyengine_us/variables/household/income/spm_unit/spm_unit_market_income.py` sums the person-level `market_income` (`adds = ["market_income"]`).
- `policyengine_us/variables/household/income/person/general/market_income.py` hardcodes 17 components in its formula.
- `household_market_income` (`policyengine_us/variables/household/income/household/household_market_income.py`) reads `gov.household.market_income_sources` instead. That is `policyengine_us/parameters/gov/household/market_income_sources.yaml`, which lists 21 sources.
- `spm_unit_taxes` subtracts federal income tax (`spm_unit_federal_tax`, via `sum_contained_tax_units("income_tax")`) and state income tax (`spm_unit_state_tax`). Both are computed on AGI, which includes these sources.

Every one of the 17 person-level components is in the parameter list. Four sources in the parameter list are missing from the person-level formula:

| In `gov.household.market_income_sources`, missing from `market_income` | Cash income in Census money income? |
|---|---|
| `partnership_s_corp_income` (= `partnership_income` + `s_corp_income`) | yes |
| `farm_rent_income` | yes |
| `ak_permanent_fund_dividend` | yes |
| `debt_relief` | no (cancelled debt) |

So `household_net_income` counts partnership/S-corp income and farm rent, but SPM resources do not, while still subtracting the tax on them.

## Effect

An SPM unit whose income is mostly partnership/S-corp income or farm rent gets SPM resources of (other income) − (taxes on all income). That can fall below the SPM threshold even with AGI in the millions.

- **High-AGI units count as poor.** People in households with AGI of $500k or more who are SPM-poor:
  - CA, TY2031: 74,191 on the model's resources; 10,909 with the omitted sources added back (`debt_relief` is 0 in this data). The omitted income totals $135.3B.
  - WA, TY2028: 7,526 → 0.
  - CO, TY2027: 8,159 → 0.
- **Reforms flip their poverty status.** Changing a top income tax rate moves these units across the line:
  - CA: keeping the 10.3%/11.3%/12.3% brackets after 2030 (California Proposition 3, TY2031) pushes 1,707 people into poverty. That is 18 SPM units, all with household AGI above $500k.
  - WA: repealing the 9.9% tax on income over $1M (Washington I-645, TY2028) lifts 414 people out of poverty. That is 3 SPM units, all above $500k.
  - CO: the Colorado Initiative 195 graduated income tax (`gov.contrib.states.co.progressive_income_tax`, TY2027) raises deep poverty by 0.38%. That is 7 SPM units, all above $500k.
  - With the omitted sources added back to SPM resources, none of these units cross the line under any of the three reforms.

## Example: California, TY2031

One SPM unit (one person, weight 133) under current law:

| | Amount |
|---|---|
| Household AGI | $2,972,666 |
| `partnership_s_corp_income`, omitted from SPM resources | $1,571,656 |
| `spm_unit_market_income` (no partnership income) | $1,401,704 |
| `spm_unit_taxes` (on all income) | $1,351,843 |
| `spm_unit_net_income` (SPM resources) | $34,361 |
| SPM threshold | $21,792 |

Under the Proposition 3 reform, the higher state income tax lowers SPM resources to −$36,719. The unit, with $3M of AGI, is counted as pushed into poverty. With the partnership income included, its resources are $1,606,017 under current law and $1,534,937 under the reform.

## Proposed fix

Have `market_income` read the same list as `household_market_income`, so the two cannot drift:

```python
class market_income(Variable):
    ...
    adds = "gov.household.market_income_sources"
```

That would also bring in `debt_relief`, which is not cash income. Alternatives:

- add `partnership_s_corp_income`, `farm_rent_income` and `ak_permanent_fund_dividend` to `COMPONENTS`, and decide on `debt_relief` separately (#9919 also lists `non_sch_d_capital_gains` and other gross-income sources for review); or
- add them in `spm_unit_market_income` only, if another consumer of `market_income` needs the narrower definition.

Other consumers of `market_income` to check:
- `variables/household/marginal_tax_rate.py` (line ~105)
- `variables/gov/states/mo/dss/ssp/mo_snc_countable_income.py`

Suggested test: a single adult whose only income is partnership income should have `spm_unit_net_income` equal to that income minus `spm_unit_taxes`. Today it is minus `spm_unit_taxes`.

## Expected effect on baseline SPM poverty

Adding `partnership_s_corp_income`, `farm_rent_income` and `ak_permanent_fund_dividend` to SPM resources changes the current-law SPM poverty rate (all people) as follows. Taxes are unchanged and the rest of the model is as above.

| State | Tax year | Now | With fix | Change |
|---|---|---|---|---|
| Colorado | 2027 | 9.72% | 9.14% | −0.58 pp |
| California | 2031 | 18.60% | 18.46% | −0.14 pp |
| Washington | 2028 | 10.25% | 9.83% | −0.42 pp |
| North Dakota | 2028 | 7.01% | 5.59% | −1.42 pp |
| South Dakota | 2028 | 6.81% | 5.05% | −1.76 pp |

- **Child poverty falls more in farm states:** ND 10.81% → 7.68% and SD 6.66% → 5.03%, where farm partnership/S-corp income and farm rent are common.
- **Deep poverty can rise slightly where partnership/S-corp losses are large:** CA 4.05% → 4.16%, because losses enter SPM resources as negative income, as Census does with business losses.
- **These are first-order figures.** They come from state subsets, add the omitted income to the existing SPM resources, and use thresholds unchanged.
