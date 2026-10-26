"""Registry of the ballot measures the dashboard models.

Each ``Measure`` holds everything the pipeline, the household API and the
frontend need to know about one measure: the parameter overrides that
define "current law" and "the measure passes", the tax years to score,
the variables that carry its budget effect, and the official estimates
it is validated against.

Conventions used everywhere in this repository:

- Impact = (measure passes) - (current law), for each scored tax year.
- ``baseline_overrides`` apply to BOTH simulations (they describe current
  law where the released model needs an assumption, e.g. forecast TABOR
  refund tiers). ``reform_overrides`` are merged over them; an entry for
  the same parameter path replaces the baseline entry.
- Override values use ``Reform.from_dict`` syntax: parameter path ->
  ``{"YYYY-MM-DD.YYYY-MM-DD": value}``. Scale brackets use ``scale[i]``.
- Budget quantities are signed from the government's side: positive
  ``state_budget_impact`` means the state gains revenue or spends less.

This module must not import policyengine; the fast tests and the frontend
export read it without the model installed.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Literal

Kind = Literal["income_tax", "tabor_refund", "school_meals", "medicaid"]
KINDS: tuple[str, ...] = ("income_tax", "tabor_refund", "school_meals", "medicaid")
Overrides = dict[str, dict[str, Any]]
Band = tuple[float, float, str]

INF = math.inf
ELECTION_DATE = "2026-11-03"


@dataclass(frozen=True)
class OfficialEstimate:
    """An official (or sponsor) estimate to show beside the model's."""

    source: str
    url: str
    # Period as the source states it, e.g. "FY 2027-28".
    period: str
    # Model tax year the estimate is compared with.
    model_year: int
    # Model metric (metrics.csv key) it is compared with.
    metric: str
    low: float
    high: float
    unit: Literal["usd", "people"] = "usd"
    # How the source's concept differs from the model's, in a sentence.
    note: str = ""


@dataclass(frozen=True)
class Measure:
    slug: str
    state: str
    designation: str
    short_title: str
    kind: Kind
    years: tuple[int, ...]
    headline_year: int
    headline_metric: str
    baseline_overrides: Overrides
    reform_overrides: Overrides
    # The variable the reform must move, and the expected sign of the
    # weighted reform-minus-baseline change (+1 up, -1 down). The pipeline
    # refuses to write results if it doesn't move that way.
    target_variable: str
    target_sign: int
    state_revenue_variables: tuple[str, ...]
    state_spending_variables: tuple[str, ...]
    federal_revenue_variables: tuple[str, ...]
    federal_spending_variables: tuple[str, ...]
    # Household AGI bands for income_brackets.csv: (low, high, label).
    income_bands: tuple[Band, ...]
    # Upper end of the household calculator's earnings sweep.
    sweep_max: int
    # Example households: label, income (head's wages), age_head, married,
    # spouse_income, dependents (list of ages).
    example_profiles: tuple[dict, ...]
    official_estimates: tuple[OfficialEstimate, ...]
    kind_params: dict = field(default_factory=dict)
    # Whether the dashboard shows a congressional district breakdown. Only
    # for states with districts, and only where the measure reaches enough
    # sample households for district figures to be stable.
    show_districts: bool = False

    @property
    def reform_policy(self) -> Overrides:
        """Baseline overrides with the reform overrides merged over them."""
        merged = {
            path: dict(periods) for path, periods in self.baseline_overrides.items()
        }
        for path, periods in self.reform_overrides.items():
            merged[path] = dict(periods)
        return merged

    @property
    def baseline_policy(self) -> Overrides:
        return {
            path: dict(periods) for path, periods in self.baseline_overrides.items()
        }


def _profile(label, income, age_head, married=False, spouse_income=0, dependents=()):
    return {
        "label": label,
        "income": income,
        "age_head": age_head,
        "married": married,
        "spouse_income": spouse_income,
        "dependents": list(dependents),
    }


# ---------------------------------------------------------------------------
# Shared income bands
# ---------------------------------------------------------------------------

LOW_INCOME_BANDS: tuple[Band, ...] = (
    (-INF, 25_000, "Under $25k"),
    (25_000, 50_000, "$25k - $50k"),
    (50_000, 75_000, "$50k - $75k"),
    (75_000, 100_000, "$75k - $100k"),
    (100_000, 150_000, "$100k - $150k"),
    (150_000, 200_000, "$150k - $200k"),
    (200_000, INF, "$200k+"),
)

TOP_INCOME_BANDS: tuple[Band, ...] = (
    (-INF, 100_000, "Under $100k"),
    (100_000, 250_000, "$100k - $250k"),
    (250_000, 500_000, "$250k - $500k"),
    (500_000, 1_000_000, "$500k - $1M"),
    (1_000_000, 2_000_000, "$1M - $2M"),
    (2_000_000, 5_000_000, "$2M - $5M"),
    (5_000_000, 10_000_000, "$5M - $10M"),
    (10_000_000, INF, "$10M+"),
)


# ---------------------------------------------------------------------------
# Colorado Proposition NN: forecast TABOR refund tiers (current law)
# ---------------------------------------------------------------------------

# Colorado Legislative Council Staff, September 2026 Economic and Revenue
# Forecast, Table 9: projected six-tier sales tax refund per eligible
# taxpayer (joint returns get twice the amount; policyengine-us counts
# eligible heads and spouses). No temporary income tax rate cut is
# projected for tax year 2027 or 2028.
# https://content.leg.colorado.gov/sites/default/files/2026-09/sept2026-forecast-with-cover-for-remediation-and-posting-accessible.pdf
# Released policyengine-us still carries the tax year 2025 tiers as
# placeholders for 2027 on; these overrides replace them until a release
# with the forecast tiers is pinned.
CO_SALES_TAX_REFUND_TIERS = {
    # year: [(lower AGI bound, amount per person), ...]; the first bound is
    # the scale's -inf bracket and is left unchanged.
    2027: [
        (None, 43),
        (57_001, 58),
        (117_001, 67),
        (187_001, 79),
        (265_001, 85),
        (349_001, 137),
    ],
    2028: [
        (None, 47),
        (59_001, 62),
        (120_001, 71),
        (192_001, 85),
        (272_001, 91),
        (358_001, 147),
    ],
}
CO_SALES_TAX_REFUND_SCALE = (
    "gov.states.co.tax.income.credits.sales_tax_refund.amount.scale"
)


def _co_refund_tier_overrides() -> Overrides:
    overrides: Overrides = {}
    for year, tiers in CO_SALES_TAX_REFUND_TIERS.items():
        period = f"{year}-01-01.{year}-12-31"
        for i, (threshold, amount) in enumerate(tiers):
            overrides.setdefault(f"{CO_SALES_TAX_REFUND_SCALE}[{i}].amount", {})[
                period
            ] = amount
            if threshold is not None:
                overrides.setdefault(f"{CO_SALES_TAX_REFUND_SCALE}[{i}].threshold", {})[
                    period
                ] = threshold
    return overrides


# ---------------------------------------------------------------------------
# The measures
# ---------------------------------------------------------------------------

CO_AMENDMENT_87 = Measure(
    slug="co-amendment-87",
    state="CO",
    designation="Amendment 87",
    short_title="Graduated income tax",
    kind="income_tax",
    years=(2027,),
    headline_year=2027,
    headline_metric="state_budget_impact",
    baseline_overrides={},
    reform_overrides={
        # policyengine-us#9431: six brackets (3.7% to 8.4%) on Colorado
        # taxable income replace the 4.4% flat rate.
        "gov.contrib.states.co.progressive_income_tax.in_effect": {
            "2027-01-01.2100-12-31": True,
        },
    },
    target_variable="co_income_tax",
    target_sign=+1,
    state_revenue_variables=("co_income_tax",),
    state_spending_variables=(),
    federal_revenue_variables=("income_tax",),
    federal_spending_variables=(),
    income_bands=(
        (-INF, 25_000, "Under $25k"),
        (25_000, 50_000, "$25k - $50k"),
        (50_000, 75_000, "$50k - $75k"),
        (75_000, 100_000, "$75k - $100k"),
        (100_000, 200_000, "$100k - $200k"),
        (200_000, 500_000, "$200k - $500k"),
        (500_000, 750_000, "$500k - $750k"),
        (750_000, 1_000_000, "$750k - $1M"),
        (1_000_000, INF, "$1M+"),
    ),
    sweep_max=1_300_000,
    example_profiles=(
        _profile("Single filer, $45k wages", 45_000, 28),
        _profile(
            "Married couple, $95k, 2 kids", 95_000, 40, married=True, dependents=(6, 9)
        ),
        _profile(
            "Married couple, $1.2M wages, 2 kids",
            1_200_000,
            50,
            married=True,
            dependents=(13, 16),
        ),
    ),
    show_districts=True,
    # Change in the top marginal rate on income above $1 million (8.4% vs
    # 4.4%), for the IRS SOI coverage scaling in metrics/top_tail.py.
    kind_params={"top_rate_change": 0.04},
    official_estimates=(
        OfficialEstimate(
            source="Colorado Legislative Council Staff, 2026 Blue Book",
            url="https://leg.colorado.gov/ballots/graduated-income-tax-2/files/blue-book",
            period="FY 2027-28, incl. C corporations",
            model_year=2027,
            metric="state_budget_impact",
            low=1_972_000_000,
            high=1_972_000_000,
            note=(
                "Fiscal-year revenue that also includes C corporations; the "
                "model scores individual income tax liability for tax year 2027."
            ),
        ),
    ),
)

CO_PROP_NN = Measure(
    slug="co-prop-nn",
    state="CO",
    designation="Proposition NN",
    short_title="Raise the state revenue limit and keep the surplus",
    kind="tabor_refund",
    years=(2027, 2028),
    headline_year=2027,
    headline_metric="state_budget_impact",
    show_districts=True,
    # The measure raises the TABOR revenue limit permanently. The dashboard
    # scores tax years 2027 and 2028, the forecast years the Blue Book
    # quantifies; whether refunds would be paid in later years depends on
    # future revenue.
    kind_params={"permanent_change": True, "scored_through": 2028},
    baseline_overrides=_co_refund_tier_overrides(),
    reform_overrides={
        # The state keeps the FY 2026-27 and FY 2027-28 surpluses, so the
        # six-tier sales tax refund is not paid for tax years 2027 and 2028.
        "gov.states.co.tax.income.credits.sales_tax_refund.in_effect": {
            "2027-01-01.2028-12-31": False,
        },
    },
    target_variable="co_sales_tax_refund",
    target_sign=-1,
    state_revenue_variables=("co_income_tax",),
    state_spending_variables=(),
    federal_revenue_variables=("income_tax",),
    federal_spending_variables=(),
    income_bands=(
        (-INF, 25_000, "Under $25k"),
        (25_000, 50_000, "$25k - $50k"),
        (50_000, 75_000, "$50k - $75k"),
        (75_000, 100_000, "$75k - $100k"),
        (100_000, 150_000, "$100k - $150k"),
        (150_000, 200_000, "$150k - $200k"),
        (200_000, 300_000, "$200k - $300k"),
        (300_000, 500_000, "$300k - $500k"),
        (500_000, INF, "$500k+"),
    ),
    sweep_max=400_000,
    example_profiles=(
        _profile("Single filer, $40k wages", 40_000, 30),
        _profile(
            "Married couple, $95k, 2 kids", 95_000, 40, married=True, dependents=(6, 9)
        ),
        _profile("Married couple, $400k wages", 400_000, 52, married=True),
    ),
    official_estimates=(
        OfficialEstimate(
            source="Colorado Legislative Council Staff, September 2026 forecast",
            url="https://content.leg.colorado.gov/sites/default/files/2026-09/sept2026-forecast-with-cover-for-remediation-and-posting-accessible.pdf",
            period="FY 2026-27 surplus (tax year 2027 refunds)",
            model_year=2027,
            metric="state_budget_impact",
            low=259_800_000,
            high=259_800_000,
            note="Six-tier sales tax refunds only.",
        ),
        OfficialEstimate(
            source="Colorado Legislative Council Staff, September 2026 forecast",
            url="https://content.leg.colorado.gov/sites/default/files/2026-09/sept2026-forecast-with-cover-for-remediation-and-posting-accessible.pdf",
            period="FY 2027-28 surplus (tax year 2028 refunds)",
            model_year=2028,
            metric="state_budget_impact",
            low=281_100_000,
            high=281_100_000,
            note="Six-tier sales tax refunds only.",
        ),
        OfficialEstimate(
            source="Colorado Legislative Council Staff, 2026 Blue Book (June forecast)",
            url="https://leg.colorado.gov/ballots/keep-and-spend-money-for-education-and-other-purposes/files/blue-book",
            period="FY 2026-27",
            model_year=2027,
            metric="state_budget_impact",
            low=329_900_000,
            high=329_900_000,
            note=(
                "All TABOR refunds, including property tax exemption "
                "reimbursements paid to local governments, on the June forecast."
            ),
        ),
        OfficialEstimate(
            source="Colorado Legislative Council Staff, 2026 Blue Book (June forecast)",
            url="https://leg.colorado.gov/ballots/keep-and-spend-money-for-education-and-other-purposes/files/blue-book",
            period="FY 2027-28",
            model_year=2028,
            metric="state_budget_impact",
            low=521_000_000,
            high=521_000_000,
            note=(
                "All TABOR refunds on the June forecast, including property tax "
                "reimbursements and a temporary 4.36% income tax rate the "
                "September forecast no longer projects."
            ),
        ),
    ),
)

CA_PROP_3 = Measure(
    slug="ca-prop-3",
    state="CA",
    designation="Proposition 3",
    short_title="Make the top income tax rates permanent",
    kind="income_tax",
    years=(2031,),
    headline_year=2031,
    headline_metric="state_budget_impact",
    # 12.3% vs 9.3% on income above $1 million (both before the 1% mental
    # health services tax), for the SOI coverage scaling.
    kind_params={"top_rate_change": 0.03},
    baseline_overrides={},
    reform_overrides={
        # policyengine-us#9601: keeps the 10.3%, 11.3% and 12.3% brackets
        # that current law ends after tax year 2030.
        "gov.contrib.states.ca.prop3.in_effect": {
            "2031-01-01.2100-12-31": True,
        },
    },
    target_variable="ca_income_tax",
    target_sign=+1,
    state_revenue_variables=("ca_income_tax",),
    state_spending_variables=(),
    federal_revenue_variables=("income_tax",),
    federal_spending_variables=(),
    income_bands=TOP_INCOME_BANDS,
    sweep_max=3_000_000,
    example_profiles=(
        _profile("Single filer, $150k wages", 150_000, 35),
        _profile(
            "Married couple, $900k wages, 2 kids",
            900_000,
            48,
            married=True,
            dependents=(10, 14),
        ),
        _profile("Married couple, $3M wages", 3_000_000, 55, married=True),
    ),
    official_estimates=(
        OfficialEstimate(
            source="California Legislative Analyst's Office",
            url="https://lao.ca.gov/BallotAnalysis/Proposition?number=3&year=2026",
            period="Annually from 2031",
            model_year=2031,
            metric="state_budget_impact",
            low=5_000_000_000,
            high=15_000_000_000,
            note="A range reflecting how volatile high incomes are.",
        ),
    ),
)

WA_I_645 = Measure(
    slug="wa-i-645",
    state="WA",
    designation="Initiative 645",
    short_title="Repeal the tax on income over $1 million and bar income taxes by statute",
    kind="income_tax",
    years=(2028, 2029),
    headline_year=2028,
    headline_metric="state_budget_impact",
    # The 9.9% rate on income above $1 million ends, for the SOI coverage
    # scaling (the tax base excludes long-term gains, which WA taxes
    # separately; the scaling treats AGI above $1 million as the base).
    kind_params={"top_rate_change": -0.099},
    baseline_overrides={},
    reform_overrides={
        # Repeals ESSB 6346's 9.9% tax on Washington taxable income above
        # the $1 million standard deduction, which starts in 2028.
        "gov.states.wa.tax.income.millionaires_tax.in_effect": {
            "2028-01-01.2100-12-31": False,
        },
    },
    target_variable="wa_income_tax",
    target_sign=-1,
    state_revenue_variables=("wa_income_tax",),
    state_spending_variables=(),
    federal_revenue_variables=("income_tax",),
    federal_spending_variables=(),
    income_bands=TOP_INCOME_BANDS,
    sweep_max=5_000_000,
    example_profiles=(
        _profile(
            "Married couple, $250k wages, 2 kids",
            250_000,
            42,
            married=True,
            dependents=(8, 11),
        ),
        _profile("Single filer, $1.5M wages", 1_500_000, 50),
        _profile("Married couple, $5M wages", 5_000_000, 58, married=True),
    ),
    official_estimates=(
        OfficialEstimate(
            source="Washington Office of Financial Management",
            url="https://www.sos.wa.gov/sites/default/files/2026-07/FIS%20-%20Initiative%20645%20-%20FINAL.pdf",
            period="FY 2029 (July 2028 - June 2029)",
            model_year=2028,
            metric="state_budget_impact",
            low=-3_108_000_000,
            high=-3_108_000_000,
            note="State fiscal-year collections; the model scores tax year 2028 liability.",
        ),
        OfficialEstimate(
            source="Washington Office of Financial Management",
            url="https://www.sos.wa.gov/sites/default/files/2026-07/FIS%20-%20Initiative%20645%20-%20FINAL.pdf",
            period="FY 2030 (July 2029 - June 2030)",
            model_year=2029,
            metric="state_budget_impact",
            low=-4_432_000_000,
            high=-4_432_000_000,
            note="State fiscal-year collections; the model scores tax year 2029 liability.",
        ),
        OfficialEstimate(
            source="Washington Office of Financial Management",
            url="https://www.sos.wa.gov/sites/default/files/2026-07/FIS%20-%20Initiative%20645%20-%20FINAL.pdf#page=4",
            period="Taxpayers in the tax administration estimate",
            model_year=2028,
            metric="tax_units_paying_less",
            low=30_000,
            high=30_000,
            unit="people",
            # Quoted verbatim from the fiscal impact statement, page 4 (under
            # "State Agency Implementation Cost Assumptions"); the content
            # file (wa-i-645.ts) quotes the same sentence.
            note=(
                "In its implementation cost assumptions for the Department of "
                "Revenue, the fiscal impact statement says: “Savings are "
                "assumed for tax administration duties for approximately "
                "30,000 taxpayers that will no longer be required.”"
            ),
        ),
    ),
)

ND_MEASURE_2 = Measure(
    slug="nd-measure-2",
    state="ND",
    designation="Constitutional Measure No. 2",
    short_title="Free school breakfast and lunch for all students",
    kind="school_meals",
    years=(2028,),
    headline_year=2028,
    headline_metric="state_budget_impact",
    baseline_overrides={},
    reform_overrides={
        # Every public school serves one free breakfast and one free lunch
        # per school day from the 2027-28 school year. Annual parameters
        # are read on January 1, so 2028 is the first full year.
        "gov.usda.school_meals.state_universal_free_meals.ND": {
            "2027-07-01.2100-12-31": True,
        },
    },
    target_variable="school_meal_net_subsidy",
    target_sign=+1,
    state_revenue_variables=(),
    # The state cost is participation-adjusted in metrics/school_meals.py
    # rather than read from a model variable.
    state_spending_variables=(),
    federal_revenue_variables=("income_tax",),
    federal_spending_variables=(),
    income_bands=LOW_INCOME_BANDS,
    sweep_max=150_000,
    example_profiles=(
        _profile("Single parent, $30k, 1 child", 30_000, 32, dependents=(8,)),
        _profile(
            "Married couple, $55k, 2 kids", 55_000, 38, married=True, dependents=(7, 10)
        ),
        _profile(
            "Married couple, $110k, 3 kids",
            110_000,
            41,
            married=True,
            dependents=(6, 9, 13),
        ),
    ),
    official_estimates=(
        OfficialEstimate(
            source="North Dakota Secretary of State, 2026 general election measure guide",
            url="https://www.sos.nd.gov/sites/default/files/documents/elections/2026-general-measure-guide.pdf",
            period="2027-29 biennium",
            model_year=2028,
            metric="state_cost_biennium",
            low=124_300_000,
            high=134_300_000,
            note=(
                "Meals ($124 million to $134 million) plus $300,000 for "
                "administration per two-year budget. The range reflects how much "
                "participation rises: $124 million if it rises as in other "
                "universal-meal states, $134 million if it rises more."
            ),
        ),
        OfficialEstimate(
            source="North Dakota Department of Public Instruction fiscal note (June 2026)",
            url="https://ndlegis.gov/sites/default/files/pdf/committees/69-2025/27.5158.03000appendix.pdf",
            period="2027-29 biennium, participation at current levels",
            model_year=2028,
            metric="state_cost_biennium_low",
            low=105_300_000,
            high=105_300_000,
            note=(
                "DPI's scenario in which participation stays at current levels: "
                "$105 million for meals plus $300,000 for administration."
            ),
        ),
    ),
    kind_params={
        # Benchmarks for the participation adjustment in
        # ballot_calc/metrics/school_meals.py (source files in
        # ~/PolicyEngine/searchlight-school-meals/research/data/).
        # NCES Common Core of Data 2024-25: public K-12 enrollment.
        "public_enrollment": 116_762,
        # Students at PUBLIC schools that already serve every meal free under
        # the Community Eligibility Provision (CEP): 9,196 at 39 schools in 18
        # public districts. Source: North Dakota Department of Public
        # Instruction, CEP Annual Notification of Local Educational Agencies,
        # 2026 (sum of the "Total Student Enrollment at CEP Schools" column;
        # the TOTAL row, 10,742 students at 47 schools, includes the rows
        # below).
        # https://www.nd.gov/dpi/sites/default/files/documents/ChildNutrition/SNP/2026CEPLEAwideNotificationReport2.pdf#page=2
        # Excluded, because public_enrollment (NCES Common Core of Data) counts
        # state public schools only and the measure covers public schools:
        # the Bureau of Indian Education, tribal and Catholic schools coded
        # -900, -409 and -410, 1,546 students at 8 schools: 03-900 Tate Topa
        # Tribal School (451), 08-900 Theodore Jamerson Elementary (97),
        # 40-900 Dunseith Day Elementary (189), 43-900 Standing Rock
        # Community Schools (546), 40-409 Ojibwa Indian School (208), 43-409
        # St. Bernard Mission School (39) and 40-410 St. Ann's Catholic
        # School (16).
        "cep_students": 9_196,
        # USDA FNS FY 2025 (preliminary, data as of 2026-09-11): lunches and
        # breakfasts served in North Dakota. Current participation = meals /
        # (school days x participating enrollment).
        "lunch_meals": 14_982_168,
        "breakfast_meals": 5_436_081,
        # ND DPI testimony, December 10, 2025: SY 2024-25 enrollment at
        # schools in the federal lunch program (119,506 public plus 6,755
        # private), the population those meals were served to.
        # https://ndlegis.gov/sites/default/files/pdf/committees/69-2025/27.5088.03000appendixb.pdf
        "participating_enrollment": 126_261,
        # FNS FY 2025 average daily participation, for reference only: FNS
        # divides average daily meals by a 0.927 attendance factor, so ADP /
        # enrollment overstates meals per enrolled student-day by about 11%.
        "lunch_adp": 92_641,
        "breakfast_adp": 33_835,
        # Biennial administration cost from the fiscal impact statement.
        "admin_cost_per_biennium": 300_000,
        # High case: participation rises by what DPI's fiscal note assumed
        # from nine states with universal free meals, +9 percentage points at
        # lunch and +12 at breakfast (June 11, 2026,
        # https://ndlegis.gov/sites/default/files/pdf/committees/69-2025/27.5158.03000appendix.pdf).
        # The lunch figure matches Ramponi et al., JAMA Pediatrics (2025),
        # doi:10.1001/jamapediatrics.2025.2301: +9 points (95% CI 7-10) for
        # lunch and +5 (3-6) for breakfast in the CO/MI/MN/NM wave of
        # universal-meal states, +19 and +26 in the first wave. USDA's CEP
        # evaluation (Logan et al., 2014) found +3.5 and +3.6 points for
        # schools adopting community eligibility.
        "uplift_lunch": 0.09,
        "uplift_breakfast": 0.12,
    },
)

SD_AMENDMENT_I = Measure(
    slug="sd-amendment-i",
    state="SD",
    designation="Constitutional Amendment I",
    short_title="Tie the constitutional Medicaid expansion requirement to a 90% federal share",
    kind="medicaid",
    years=(2028,),
    headline_year=2028,
    headline_metric="people_losing_medicaid",
    baseline_overrides={
        # Count Medicaid and marketplace subsidies in net income so the
        # household and distributional figures show the coverage change.
        "gov.simulation.include_health_benefits_in_net_income": {
            "2027-01-01.2100-12-31": True,
        },
    },
    reform_overrides={
        # Scenario: the federal share for expansion adults falls below 90%
        # and expansion ends on July 1, 2027. Minus infinity removes the
        # adult group (a 0 limit would still admit zero-income adults).
        "gov.hhs.medicaid.eligibility.categories.adult.income_limit.SD": {
            "2027-07-01.2100-12-31": -INF,
        },
    },
    target_variable="medicaid_enrolled",
    target_sign=-1,
    state_revenue_variables=(),
    state_spending_variables=("medicaid_state_cost",),
    federal_revenue_variables=("income_tax",),
    federal_spending_variables=("medicaid_federal_cost", "assigned_aca_ptc"),
    income_bands=LOW_INCOME_BANDS,
    sweep_max=60_000,
    example_profiles=(
        _profile("Single adult, $14k wages", 14_000, 30),
        _profile("Single adult, $20k wages", 20_000, 45),
        _profile("Married couple, $28k, no children", 28_000, 55, married=True),
    ),
    official_estimates=(
        OfficialEstimate(
            source="South Dakota Secretary of State, 2026 ballot question pamphlet",
            url="https://sdsos.gov/elections-voting/upcoming-elections/general-information/2026%20Election%20Information/2026%20Ballot%20Question%20Information/2026%20Ballot%20Question%20Files/2026%20BQ/2026GeneralBQPamphletFINAL.pdf",
            period="Current expansion enrollment",
            model_year=2028,
            metric="baseline_expansion_enrollees",
            low=30_000,
            high=30_000,
            unit="people",
            note="Approximate enrollment cited in the pamphlet; no official fiscal note exists.",
        ),
        OfficialEstimate(
            source=(
                "South Dakota Department of Social Services, South Dakota "
                "Medicaid Report SFY25 (January 2026)"
            ),
            url="https://dss.sd.gov/docs/medicaid/reports/2025_Medicaid_Report.pdf#page=9",
            period="Average monthly enrollment, July 2024 - June 2025",
            model_year=2028,
            metric="admin_expansion_enrollees",
            low=29_055,
            high=29_055,
            unit="people",
            note=(
                "Average monthly enrollment in the Medicaid expansion group "
                "(adults 19-64 with income up to 138% of the poverty line). The "
                "dashboard scales the model's coverage and budget figures to it."
            ),
        ),
    ),
    kind_params={
        "conditional": True,
        "expansion_end_date": "2027-07-01",
        "federal_expansion_share": 0.9,
        # Administrative enrollment the coverage and budget figures are
        # scaled to (metrics/medicaid.py): DSS's average monthly Medicaid
        # Expansion enrollment for state fiscal year 2025, Graph 1 of the
        # SFY25 Medicaid Report. The DSS Medicaid dashboard
        # (dss.sd.gov/keyresources/statistics.aspx) shows 31,573 in
        # September 2026.
        "admin_expansion_enrollees": 29_055,
        "admin_expansion_enrollees_source": (
            "South Dakota Department of Social Services, South Dakota Medicaid "
            "Report SFY25 (January 2026), Graph 1: average monthly Medicaid "
            "Expansion enrollment, July 2024 - June 2025"
        ),
        "admin_expansion_enrollees_url": (
            "https://dss.sd.gov/docs/medicaid/reports/2025_Medicaid_Report.pdf#page=9"
        ),
        "admin_expansion_enrollees_date": "2026-01",
    },
)

MEASURES: dict[str, Measure] = {
    m.slug: m
    for m in (
        CO_AMENDMENT_87,
        CO_PROP_NN,
        CA_PROP_3,
        WA_I_645,
        ND_MEASURE_2,
        SD_AMENDMENT_I,
    )
}

MEASURE_SLUGS: tuple[str, ...] = tuple(MEASURES)


def measure_years() -> list[tuple[str, int]]:
    """Every (slug, year) pair the pipeline scores."""
    return [(m.slug, year) for m in MEASURES.values() for year in m.years]


def states_used() -> tuple[str, ...]:
    """State codes with at least one measure, in registry order."""
    return tuple(dict.fromkeys(m.state for m in MEASURES.values()))
