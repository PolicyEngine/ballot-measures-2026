import type { Comparison, MeasureContent } from './types';

const BLUE_BOOK_URL = 'https://content.leg.colorado.gov/sites/default/files/2026-blue-book-en-accessible.pdf';
const FORECAST_URL =
  'https://content.leg.colorado.gov/sites/default/files/2026-09/sept2026-forecast-with-cover-for-remediation-and-posting-accessible.pdf';
const BILL_URL = 'https://leg.colorado.gov/bills/sb26-135';

/** Six-tier sales tax refund per eligible person (LCS September 2026 forecast, Table 9). */
const tierTable = (year: number, tiers: [string, number][]): Comparison => ({
  caption: `Six-tier sales tax refund per person, tax year ${year}`,
  rows: tiers.map(([label, amount]) => ({
    label,
    currentLaw: `$${amount}`,
    ifPasses: '$0',
  })),
  note: 'Tiers use Colorado modified adjusted gross income. A joint return receives the amount for each spouse. Amounts are the September 2026 forecast.',
});

const content: MeasureContent = {
  slug: 'co-prop-nn',
  description:
    'Colorado Proposition NN would permanently raise the state’s TABOR revenue limit by its K-12 education spending, letting the state keep revenue it would otherwise refund; PolicyEngine scores the sales tax refunds projected for tax years 2027 and 2028.',
  measureType: 'Referred by the Legislature (Senate Bill 26-135) as a statute',
  voteRequirement: {
    text: 'A majority vote.',
    sources: [{ label: '2026 Blue Book, page 41 (Proposition NN)', url: `${BLUE_BOOK_URL}#page=41` }],
  },
  ballotText: {
    label: 'Ballot title',
    paragraphs: [
      'Shall state investment in K-12 public education increase two percent each year for the next ten years, with investments used to increase teacher pay, improve teacher retention, lower class sizes, and increase access to career and technical courses, without raising taxes but instead funded by raising the annual limit on state fiscal year spending only by the amount spent on public K-12 education as a voter-approved revenue change, and requiring an annual publicly released, independent audit to show how the new investments are spent?',
    ],
    source: { label: '2026 Blue Book, page 11', url: `${BLUE_BOOK_URL}#page=11` },
  },
  summary: [
    "Colorado's Taxpayer's Bill of Rights (TABOR) limits how much revenue the state may keep each year and requires it to refund the excess. Under the September 2026 forecast, the state refunds surpluses for the 2026-27 and 2027-28 budget years partly through a six-tier sales tax refund on tax year 2027 and 2028 returns: $43 to $137 per person in 2027 and $47 to $147 in 2028.",
    'Proposition NN would raise the limit by the most the state has spent on K-12 education from certain sources, with no end date. The Blue Book expects revenue to stay below the higher limit for at least five to ten years and says the measure eliminates TABOR refunds for 2026-27 and 2027-28. The state would spend the retained revenue first on property tax exemption reimbursements to local governments, then on K-12 education and programs for children.',
    'For ten years, the Children’s Account funds K-12 education that grows 2% a year (teacher pay and retention, smaller classes, career and technical courses) and programs for children, prioritizing full-day preschool and child care.',
  ],
  whatItDoes: [
    'Starts with the 2026-27 budget year and has no end date.',
    'Spends the retained revenue first on property tax exemption reimbursements to local governments, as current law already does, and deposits the rest in a new Children’s Account.',
    'For ten years, directs the Children’s Account to K-12 education and to programs for children.',
    'Requires an annual independent audit of how the money is spent.',
  ],
  comparisons: [
    tierTable(2027, [
      ['Up to $57,000', 43],
      ['$57,001 to $117,000', 58],
      ['$117,001 to $187,000', 67],
      ['$187,001 to $265,000', 79],
      ['$265,001 to $349,000', 85],
      ['Over $349,000', 137],
    ]),
    tierTable(2028, [
      ['Up to $59,000', 47],
      ['$59,001 to $120,000', 62],
      ['$120,001 to $192,000', 71],
      ['$192,001 to $272,000', 85],
      ['$272,001 to $358,000', 91],
      ['Over $358,000', 147],
    ]),
  ],
  whoIsAffectedSummary:
    'Under current law, Colorado filers receive the six-tier sales tax refund on their income tax returns; if Proposition NN passes, those refunds are not paid for tax years 2027 and 2028.',
  whoIsAffected: [
    'Under current law, Colorado filers aged 18 or older, and younger filers who owe Colorado income tax or had it withheld, receive the six-tier refund on their income tax return; a joint return receives it for each spouse.',
    'If Proposition NN passes, those refunds are not paid for tax years 2027 and 2028. A single filer with income up to $57,000 receives $43 less in 2027; a joint return with income over $349,000 receives $274 less.',
  ],
  effectiveDate:
    'Budget years beginning July 1, 2026, with no end date. PolicyEngine scores tax years 2027 and 2028, the forecast years the Blue Book quantifies; the effect in later years depends on future revenue.',
  context: [
    {
      title: 'Proposition 137',
      body: [
        'Proposition 137, also on the ballot, would let the state keep part of its sales tax on sporting goods for conservation, outside the TABOR limit: an estimated $175.0 million in 2027-28. The Blue Book says it would reduce the six-tier refunds and that “if the measure passes, the amount of money the state will actually keep and spend under Proposition NN may be reduced or eliminated.” This dashboard models Proposition NN against current law, without Proposition 137.',
      ],
      sources: [
        { label: '2026 Blue Book, page 67 (Proposition 137: $175.0 million)', url: `${BLUE_BOOK_URL}#page=67` },
        { label: '2026 Blue Book, page 45 (interaction with Proposition NN)', url: `${BLUE_BOOK_URL}#page=45` },
      ],
    },
    {
      title: 'Later years',
      body: [
        'The higher limit has no end date. Under Proposition NN, TABOR refunds are paid only in years when state revenue exceeds the higher limit. The Blue Book expects revenue not to exceed it “for at least the next five to ten years,” so no TABOR refunds would be paid in those years, and it says long-term projections beyond that period are uncertain.',
        'PolicyEngine scores tax years 2027 and 2028, the forecast years the Blue Book quantifies, and does not score later years. Under current law, the September 2026 forecast projects refunds for tax year 2029 as well, including a temporary income tax rate cut from 4.40% to 4.36%.',
      ],
      sources: [
        { label: '2026 Blue Book, page 43 (the Proposition NN limit and TABOR refunds)', url: `${BLUE_BOOK_URL}#page=43` },
        { label: 'Legislative Council Staff, September 2026 forecast, page 34', url: `${FORECAST_URL}#page=34` },
      ],
    },
  ],
  notModeled: [
    'Property tax exemption reimbursements to local governments, which continue under both current law and the measure.',
    'How the state would spend the retained revenue on education and children’s programs.',
    'Years after 2028.',
  ],
  caveats: [
    'Refund amounts depend on how far revenue exceeds the TABOR limit, so they change with each forecast. The model uses the September 2026 forecast tiers; the Blue Book used the June 2026 forecast.',
  ],
  officialEstimateProse: [
    'The Legislative Council Staff September 2026 forecast projects the six-tier refunds at $259.8 million for tax year 2027 and $281.1 million for tax year 2028. These compare most directly with the model, which estimates the same refunds.',
    'The 2026 Blue Book, based on the June 2026 forecast, says Proposition NN reduces TABOR refunds by $329.9 million in 2026-27 and $521.0 million in 2027-28. Those totals also count property tax exemption reimbursements to local governments, which households do not receive directly, and for 2027-28 a temporary income tax rate cut that the September forecast no longer projects for that year.',
  ],
  officialTables: [
    {
      caption: 'TABOR refund obligations under current law, September 2026 forecast',
      columns: ['Surplus year (refunded in)', 'Total', 'Property tax exemptions', 'Six-tier refund', 'Rate cut'],
      rows: [
        ['2026-27 (tax year 2027)', '$463.7M', '$203.9M', '$259.8M', '—'],
        ['2027-28 (tax year 2028)', '$490.7M', '$209.6M', '$281.1M', '—'],
        ['2028-29 (tax year 2029)', '$651.5M', '$215.5M', '$294.6M', '$141.5M'],
      ],
      note: 'Legislative Council Staff, September 2026 economic and revenue forecast. The forecast does not account for ballot measures.',
    },
  ],
  householdNote:
    'Enter your household to compare your Colorado sales tax refund and net income under current law and if Proposition NN passes.',
  references: [
    { label: '2026 Blue Book: Proposition NN analysis (Legislative Council Staff)', url: `${BLUE_BOOK_URL}#page=41` },
    { label: 'Legislative Council Staff, September 2026 economic and revenue forecast', url: `${FORECAST_URL}#page=34` },
    { label: 'Senate Bill 26-135', url: BILL_URL },
  ],
};

export default content;
