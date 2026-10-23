import type { MeasureContent } from './types';

const FISCAL_URL =
  'https://www.sos.wa.gov/sites/default/files/2026-07/FIS%20-%20Initiative%20645%20-%20FINAL.pdf';
const DISCLOSURE_URL = 'https://www.sos.wa.gov/sites/default/files/2026-07/IP26-645_PIID.pdf';
const EXPLANATORY_URL = 'https://www.sos.wa.gov/sites/default/files/2026-07/ExStmt_IP26-645.pdf';
const ESSB_URL =
  'https://lawfilesext.leg.wa.gov/biennium/2025-26/Pdf/Bills/Senate%20Passed%20Legislature/6346-S.PL.pdf';

const content: MeasureContent = {
  slug: 'wa-i-645',
  description:
    'Washington Initiative 645 would repeal the 9.9% tax on individual income over $1 million that the Legislature enacted in 2026, before it starts in 2028, and prohibit taxes on individual income by statute.',
  measureType: 'Initiative to the people (statute); passes with a majority vote',
  ballotText: {
    label: 'Ballot title',
    paragraphs: [
      'Initiative Measure No. IP26-645 concerns state and local taxes.',
      'This measure would repeal a 9.9% tax on annual individual income over $1,000,000; prohibit taxes measured by individual income and taxes on individual income or the receipt of individual income; and define “income.”',
      'This measure would decrease funding for public K-12 education, higher education (including universities and community colleges), and human services (primarily healthcare).',
      'Should this measure be enacted into law? Yes [ ] No [ ]',
    ],
    source: {
      label: 'Washington Secretary of State, ballot title and public investment impact disclosure',
      url: DISCLOSURE_URL,
    },
  },
  summary: [
    'Washington has no broad personal income tax. In 2026 the Legislature enacted a 9.9% tax on individual income above a $1 million standard deduction (ESSB 6346), starting in 2028, with 95% of the revenue going to the General Fund and 5% to the Fair Start for Kids Account.',
    'Initiative 645 would repeal that tax before it takes effect and add a statute prohibiting state and local taxes on individual income. It leaves in place the sales tax exemptions and Working Families Tax Credit expansion enacted alongside the tax.',
  ],
  whatItDoes: [
    'Repeals the 9.9% tax on individual income over $1 million, so it never takes effect.',
    'Prohibits, by statute, any state or local tax on individual income, on its receipt, or measured by it, and defines “income.”',
  ],
  comparisons: [
    {
      caption: 'Tax on income over $1 million, from 2028',
      rows: [
        { label: 'Tax rate on income above the deduction', currentLaw: '9.9%', ifPasses: 'No tax' },
        { label: 'Standard deduction (per household)', currentLaw: '$1 million', ifPasses: 'Not applicable' },
        { label: 'Charitable deduction', currentLaw: 'Up to $100,000', ifPasses: 'Not applicable' },
        {
          label: 'State and local taxes on individual income',
          currentLaw: 'No statutory prohibition',
          ifPasses: 'Prohibited by statute',
        },
      ],
      note: 'Under current law, the $1 million deduction is adjusted for inflation beginning in 2029.',
    },
  ],
  whoIsAffected: [
    'Only households with income above the $1 million deduction owe the tax under current law, so only they see a change. The fiscal impact statement assumes the Department of Revenue would administer the tax for about 30,000 taxpayers; that is the department’s administrative assumption, not an estimate of how many would owe it.',
    'A household whose income subject to the tax is $2 million owes 9.9% of the $1 million above the deduction, or $99,000, under current law in 2028, and nothing if Initiative 645 passes.',
  ],
  effectiveDate:
    'December 3, 2026, before the tax’s first year (2028). PolicyEngine scores tax years 2028 and 2029.',
  context: [],
  notModeled: [
    'The statutory prohibition on state and local income taxes; the model covers only the tax the measure repeals.',
    'Behavioral responses, such as changes in when people realize income, or moves into or out of the state.',
  ],
  caveats: [
    'Survey-based microdata hold few very high-income households, who would owe all of this tax; the comparisons on this tab show how the model’s figures line up with official estimates and IRS data.',
    'The official figures are state fiscal-year collections; the model estimates tax-year liability, so the two differ in timing.',
  ],
  officialEstimateProse: [
    "Washington's Office of Financial Management estimates that the initiative reduces state revenue by $3.108 billion in fiscal year 2029 (July 2028 through June 2029), $4.432 billion in fiscal year 2030 and $3.892 billion in fiscal year 2031: $11.43 billion over fiscal years 2027 through 2031. It does not affect local revenue.",
  ],
  householdNote:
    'Enter your household to compare your Washington tax and net income under current law and if Initiative 645 passes. Only income above $1 million is affected.',
  references: [
    { label: 'Office of Financial Management fiscal impact statement', url: FISCAL_URL },
    { label: 'Explanatory statement (Washington Secretary of State)', url: EXPLANATORY_URL },
    { label: 'ESSB 6346 as passed by the Legislature', url: ESSB_URL },
  ],
};

export default content;
