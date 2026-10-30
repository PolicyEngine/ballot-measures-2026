import type { MeasureContent } from './types';

const BLUE_BOOK_URL = 'https://content.leg.colorado.gov/sites/default/files/2026-blue-book-en-accessible.pdf';
const TEXT_URL =
  'https://www.sos.state.co.us/pubs/elections/Initiatives/titleBoard/filings/2025-2026/195Final.pdf';
const INITIAL_FIS_URL = 'https://leg.colorado.gov/initiative_files/3320/download';

const content: MeasureContent = {
  slug: 'co-amendment-87',
  description:
    'Colorado Amendment 87 would replace the 4.4% flat income tax with six rates from 3.7% to 8.4%, starting in tax year 2027.',
  measureType: 'Citizen initiative (Initiative 195) amending the state constitution and statutes',
  voteRequirement: {
    text: 'A majority vote. A Colorado constitutional amendment needs at least 55% of the votes cast unless it is limited to a repeal, which needs a simple majority; the Blue Book lists Amendment 87, whose constitutional change removes the single-rate requirement, as passing with a majority vote.',
    sources: [
      { label: '2026 Blue Book, page 4 (vote requirements)', url: `${BLUE_BOOK_URL}#page=4` },
      { label: '2026 Blue Book, page 33 (Amendment 87)', url: `${BLUE_BOOK_URL}#page=33` },
    ],
  },
  ballotText: {
    label: 'Ballot title',
    paragraphs: [
      'SHALL STATE TAXES BE INCREASED $2.7 BILLION ANNUALLY, IN ORDER TO INCREASE OR IMPROVE LEVELS OF PUBLIC SERVICES, INCLUDING K-12 PUBLIC SCHOOL EDUCATION, HEALTH CARE, AND EARLY CHILD CARE AND EDUCATION SERVICES, BY AN AMENDMENT TO THE COLORADO CONSTITUTION AND A CHANGE TO THE COLORADO REVISED STATUTES REPEALING EXISTING LAW AND CREATING NEW LAW TO REPLACE THE UNIFORM STATE INCOME TAX RATE WITH A GRADUATED INCOME TAX STRUCTURE, AND, IN CONNECTION THEREWITH, AMENDING THE TAXPAYER’S BILL OF RIGHTS TO ELIMINATE THE CONSTITUTIONAL REQUIREMENT FOR ALL TAXABLE NET INCOME TO BE TAXED AT ONE RATE WITH NO ADDED TAX ON INCOME; ESTABLISHING VARIOUS INCOME TAX RATES BASED ON THE AMOUNT OF TAXABLE INCOME EARNED BY INDIVIDUALS, ESTATES, TRUSTS, AND CORPORATIONS, WHILE MAINTAINING THE CURRENT 4.4% TAX ON INCOME FROM THE SALE OF A PRINCIPAL RESIDENCE, WHICH WILL RESULT IN THE ESTIMATED CHANGE IN INCOME TAXES OWED BY INDIVIDUALS AS IDENTIFIED IN THE FOLLOWING TABLE; AND AUTHORIZING THE STATE TO RETAIN AND SPEND ANY INCREASED REVENUE FROM THE NEW TAX STRUCTURE, AS A VOTER-APPROVED REVENUE CHANGE, TO SUPPLEMENT CURRENT LEVELS OF FUNDING FOR K-12 PUBLIC SCHOOL EDUCATION, HEALTH CARE, AND EARLY CHILD CARE AND EDUCATION PROGRAMS?',
    ],
    table: {
      caption: 'Amendment 87: change in income taxes owed by income category (from the ballot title)',
      columns: [
        'Income category',
        'Current average income tax owed',
        'Proposed average income tax owed',
        'Proposed change if passed',
      ],
      rows: [
        ['$25,000 or less', '$59', '$50', '-$9'],
        ['$25,001 - $50,000', '$751', '$632', '-$119'],
        ['$50,001 - $100,000', '$1,877', '$1,666', '-$210'],
        ['$100,001 - $200,000', '$4,126', '$3,828', '-$298'],
        ['$200,001 - $500,000', '$9,344', '$9,019', '-$325'],
        ['$500,001 - $1,000,000', '$19,288', '$18,963', '-$325'],
        ['$1,000,001 - $2,000,000', '$29,432', '$34,196', '+$4,764'],
        ['$2,000,001 - $5,000,000', '$41,196', '$55,110', '+$13,914'],
      ],
      note: 'Income categories use adjusted gross income reported to the federal Internal Revenue Service.',
    },
    source: { label: '2026 Blue Book, page 10', url: `${BLUE_BOOK_URL}#page=10` },
  },
  summary: [
    'Colorado taxes individual and corporate income at a flat 4.4%, and the state constitution requires a single rate. Amendment 87 would remove that requirement and tax Colorado taxable income at six graduated rates, from 3.7% on the first $25,000 to 8.4% on taxable income above $1 million, starting in tax year 2027.',
    "The thresholds are the same for every filing status and are not adjusted for inflation. The added revenue goes to a new Colorado Future's account in the General Fund, to supplement spending on K-12 education, health care, and early child care and education; the Legislature decides which programs receive it. The Blue Book says the measure has no impact on current TABOR refunds.",
  ],
  whatItDoes: [
    'Applies the same rate schedule to estates, trusts and C corporations.',
    'Keeps the 4.4% rate on gains from selling a principal residence above the federal exclusion.',
    'Lets the state keep and spend the added revenue as a voter-approved revenue change under TABOR.',
  ],
  comparisons: [
    {
      caption: 'Income tax rates on Colorado taxable income, from tax year 2027',
      rows: [
        { label: '$0 to $25,000', currentLaw: '4.4%', ifPasses: '3.7%' },
        { label: '$25,000 to $100,000', currentLaw: '4.4%', ifPasses: '4.2%' },
        { label: '$100,000 to $500,000', currentLaw: '4.4%', ifPasses: '4.4%' },
        { label: '$500,000 to $750,000', currentLaw: '4.4%', ifPasses: '7.4%' },
        { label: '$750,000 to $1 million', currentLaw: '4.4%', ifPasses: '7.9%' },
        { label: 'Over $1 million', currentLaw: '4.4%', ifPasses: '8.4%' },
      ],
      note: 'Marginal rates: each rate applies only to the taxable income within its range. Thresholds are the same for every filing status and are not indexed for inflation.',
    },
  ],
  whoIsAffectedSummary:
    'According to the Blue Book, taxes fall for filers with Colorado taxable income below $510,834 and rise at $510,834 and above.',
  whoIsAffected: [
    'A filer with at least $100,000 of Colorado taxable income pays $325 less on the first $100,000: 0.7 percentage points less on the first $25,000 ($175) and 0.2 points less on the next $75,000 ($150). Filers with less taxable income save less, such as $70 at $10,000.',
    'Taxable income above $500,000 is taxed at 3.0 to 4.0 percentage points more. According to the Blue Book, taxes fall for filers with Colorado taxable income below $510,834 and rise at $510,834 and above. A filer with $1 million of taxable income pays $15,925 more; at $2 million, $55,925 more.',
  ],
  effectiveDate:
    'Tax years beginning on or after January 1, 2027. The measure itself takes effect when the Governor proclaims the election results.',
  context: [
    {
      title: 'Proposition 136',
      body: [
        "Proposition 136, also on Colorado's ballot, would cap the state income tax rate at 4.4% starting January 1, 2027. The Blue Book says that if both measures pass, “the exact outcome is unclear. The state legislature or a court will need to determine how to resolve any conflicts.” This dashboard models Amendment 87 on its own.",
      ],
      sources: [
        { label: '2026 Blue Book, page 62 (Proposition 136: the 4.4% limit)', url: `${BLUE_BOOK_URL}#page=62` },
        { label: '2026 Blue Book, page 36 (if both measures pass)', url: `${BLUE_BOOK_URL}#page=36` },
      ],
    },
  ],
  notModeled: [
    'The rate schedule for C corporations, estates and trusts.',
    'The 4.4% rate on home-sale gains above the federal exclusion; the model applies the graduated rates to all taxable income.',
    'How the Legislature would spend the added revenue.',
    'Behavioral responses, such as changes in when people realize capital gains, or moves into or out of the state.',
  ],
  caveats: [
    'Most of the added revenue comes from taxable income above $500,000. Survey-based microdata hold few very high-income households, so this part of the estimate is the least certain; the comparisons on this tab show how the model’s figures line up with official estimates and IRS data.',
    'The Blue Book’s revenue estimates cover state budget years and include corporations, and its table for individual taxpayers uses tax year 2023 incomes; the model covers individual income tax liability for tax year 2027.',
  ],
  officialEstimateProse: [
    "Colorado's Legislative Council Staff estimate in the 2026 Blue Book that the measure raises $958.4 million in the 2026-27 budget year, a half-year of tax year 2027, and $1.972 billion in 2027-28. The Blue Book describes the $2.7 billion in the ballot title as the maximum estimate for 2027-28, based on possible forecast error.",
    'The Blue Book figures include corporate income tax and are stated by budget year (July through June). PolicyEngine estimates individual income tax for tax year 2027.',
    'For individual taxpayers alone, the Blue Book’s Table 3 gives the change in tax by income, estimated on tax year 2023 Department of Revenue data: $1,208.5 million more from incomes of $1 million or more and $572.8 million less below that, a net $635.7 million. The dashboard compares PolicyEngine’s estimate with that figure.',
  ],
  householdNote:
    'Enter your household to compare your 2027 Colorado income tax and net income under current law and if Amendment 87 passes.',
  references: [
    { label: '2026 Blue Book: Amendment 87 analysis (Legislative Council Staff)', url: `${BLUE_BOOK_URL}#page=34` },
    { label: 'Initiative 195 final text (Colorado Secretary of State)', url: TEXT_URL },
    { label: 'Initial fiscal impact statement, March 2026 (Legislative Council Staff)', url: INITIAL_FIS_URL },
    {
      label: 'policyengine-us pull request 9431 (Initiative 195 rate schedule)',
      url: 'https://github.com/PolicyEngine/policyengine-us/pull/9431',
    },
  ],
};

export default content;
