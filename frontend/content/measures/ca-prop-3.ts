import type { MeasureContent, VoteRequirement } from './types';

const GUIDE_URL = 'https://vig.cdn.sos.ca.gov/2026/general/pdf/prop3.pdf';
const TEXT_URL = 'https://vig.cdn.sos.ca.gov/2026/general/pdf/prop3-text-proposed-laws.pdf';
const LAO_URL = 'https://lao.ca.gov/ballot/2026/prop3-110326.pdf';
const LABEL_URL = 'https://elections.cdn.sos.ca.gov/ccrov/2026/august/26211jj.pdf';

const CONSTITUTION_URL =
  'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CONS&sectionNum=SEC.%204.&article=XVIII';

/** The voter guide does not state the threshold; the constitution does. */
const VOTE_REQUIREMENT: VoteRequirement = {
  text: 'A majority of the votes cast on it. The state constitution says a proposed amendment takes effect “if approved by a majority of votes cast thereon.”',
  sources: [{ label: 'California Constitution, article XVIII, section 4', url: CONSTITUTION_URL }],
};

const content: MeasureContent = {
  slug: 'ca-prop-3',
  description:
    'California Proposition 3 would keep the 10.3%, 11.3% and 12.3% income tax rates on high incomes after 2030, when current law ends them.',
  measureType: 'Citizen-initiated constitutional amendment (Initiative 25-0016)',
  voteRequirement: VOTE_REQUIREMENT,
  ballotText: {
    label: 'Ballot label',
    paragraphs: [
      'PROVIDES PERMANENT FUNDING FOR SCHOOLS AND HEALTH CARE BY EXTENDING EXISTING TAX ON HIGH INCOMES. INITIATIVE CONSTITUTIONAL AMENDMENT. Makes permanent existing voter-approved tax rates for individuals earning over $371,000 (adjusted annually for inflation). Allocates tax revenues to public education. Fiscal Impact: Maintains $5 billion to $15 billion of annual state income tax revenue by making a temporary tax increase on high-income earners permanent instead of letting it expire in 2031. Supporters: California Teachers Association; CA School Nurses Organization; California State PTA; Planned Parenthood Affiliates of CA Opponents: California Taxpayers Association; Family Business Association of California; California Hispanic Chambers of Commerce',
      'A YES vote on this measure means: An income tax increase on high-income earners in place since 2012 would become permanent instead of expiring in 2031. A NO vote on this measure means: An income tax increase on high-income earners in place since 2012 would expire in 2031.',
    ],
    source: {
      label: 'Ballot label (Secretary of State); yes/no statement (Legislative Analyst’s Office)',
      url: `${LABEL_URL}#page=6`,
    },
  },
  summary: [
    'Since 2012, California has taxed high incomes at three rates above its 9.3% bracket: 10.3%, 11.3% and 12.3%. Voters added them with Proposition 30 in 2012 and extended them with Proposition 55 in 2016. Under current law they end after tax year 2030, and income in those brackets is then taxed at 9.3%.',
    'Proposition 3 would make the three rates permanent. It changes no taxes before 2031, so PolicyEngine scores tax year 2031.',
  ],
  whatItDoes: [
    'Keeps the revenue in the Education Protection Account, which allocates it 89% to K-12 schools and 11% to community colleges; the Legislative Analyst’s Office expects roughly 40% to reach schools and community colleges after the school funding formula, with the rest going to other programs and reserves.',
    'Leaves the other rates, and the 1% Mental Health Services Act tax on taxable income above $1 million, unchanged.',
  ],
  comparisons: [
    {
      caption: 'Income tax rates from 2031, single filers (2025 thresholds; they rise with inflation)',
      rows: [
        { label: 'Up to $371,479', currentLaw: '1% to 9.3%', ifPasses: '1% to 9.3%' },
        { label: '$371,479 to $445,771', currentLaw: '9.3%', ifPasses: '10.3%' },
        { label: '$445,771 to $742,953', currentLaw: '9.3%', ifPasses: '11.3%' },
        { label: 'Over $742,953', currentLaw: '9.3%', ifPasses: '12.3%' },
        {
          label: 'Additional tax on taxable income over $1 million',
          currentLaw: '1%',
          ifPasses: '1%',
        },
      ],
      note: 'Thresholds are 2025 amounts for single filers and rise with inflation each year; joint filers’ thresholds are twice as high (10.3% above $742,958 in 2025) and heads of household start at about $505,000. The $1 million threshold for the additional 1% tax is the same for every filing status.',
    },
  ],
  whoIsAffectedSummary:
    "Single filers with taxable income above about $371,000 and joint filers above about $743,000 (2025 thresholds); the Legislative Analyst's Office says the top 2% of taxpayers pay these rates.",
  whoIsAffected: [
    "Single filers with taxable income above about $371,000 and joint filers above about $743,000 (2025 thresholds, indexed for inflation). The Legislative Analyst's Office says the top 2% of taxpayers pay these rates. Under current law their rates on that income fall to 9.3% in 2031; if Proposition 3 passes, the rates stay at 10.3% to 12.3%.",
    'Filers below those thresholds see no change.',
  ],
  effectiveDate: 'Tax year 2031; the measure changes no taxes before then.',
  context: [
    {
      title: 'Where the revenue goes',
      body: [
        "The measure keeps the revenue in the Education Protection Account (89% K-12 schools, 11% community colleges). The Legislative Analyst's Office expects that, after the state's school funding formula, “roughly 40 percent of the funding would go to schools and community colleges. The rest would go to other state programs. Part of this amount would be set aside in budget reserves.”",
      ],
    },
  ],
  notModeled: [
    'How the state would spend the revenue.',
    'Behavioral responses, such as changes in reported income or moves into or out of the state.',
  ],
  caveats: [
    'The model projects 2031 incomes from 2024 survey data with forecast growth rates. High incomes vary from year to year, which is why the official estimate is a wide range.',
    'Survey-based microdata hold few very high-income households, who pay most of the tax at these rates; the comparisons on this tab show how the model’s figures line up with the official estimate and IRS data.',
  ],
  officialEstimateProse: [
    "California's Legislative Analyst's Office estimates that the measure brings in $5 billion to $15 billion a year: about $5 billion in a weak year and $15 billion in a strong one, because much of the revenue comes from income tied to the stock market.",
  ],
  householdNote:
    'Enter your household to compare your 2031 California and federal income taxes under current law and if Proposition 3 passes. Only high incomes are affected.',
  references: [
    { label: "Legislative Analyst's Office analysis of Proposition 3", url: LAO_URL },
    { label: 'Official voter information guide: Proposition 3', url: GUIDE_URL },
    { label: 'Proposition 3 text of proposed law', url: TEXT_URL },
    {
      label: 'policyengine-us pull request 9601 (Proposition 3 reform)',
      url: 'https://github.com/PolicyEngine/policyengine-us/pull/9601',
    },
  ],
};

export default content;
