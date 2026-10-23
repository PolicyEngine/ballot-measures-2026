import type { MeasureContent } from './types';

const GUIDE_URL =
  'https://www.sos.nd.gov/sites/default/files/documents/elections/2026-general-measure-guide.pdf';
const ANALYSIS_URL =
  'https://www.sos.nd.gov/sites/default/files/documents/elections/measures/analysis-2026-general-measure2.pdf';
const TEXT_URL =
  'https://www.sos.nd.gov/sites/default/files/documents/elections/measures/schoollunches-measure-full-text.pdf';
const FISCAL_URL =
  'https://www.sos.nd.gov/sites/default/files/documents/elections/measures/schoollunches-fiscal-impact.pdf';
const HB1013_URL = 'https://ndlegis.gov/assembly/69-2025/regular/documents/25-0157-07000.pdf';

const content: MeasureContent = {
  slug: 'nd-measure-2',
  description:
    'North Dakota Constitutional Measure No. 2 would require every public school to serve one free breakfast and one free lunch each school day to all enrolled students, starting in the 2027-28 school year.',
  measureType: 'Citizen-initiated constitutional amendment',
  voteRequirement: {
    text: 'A majority vote. The Secretary of State’s measure guide says Measure No. 2 is “to be voted on in the Nov. 3, 2026, General Election where a majority vote would result in passage.”',
    sources: [{ label: '2026 general election measure guide, page 3', url: `${GUIDE_URL}#page=3` }],
  },
  ballotText: {
    label: 'Ballot language',
    paragraphs: [
      'This initiated measure amendment would amend and add a new section to article VIII of the North Dakota Constitution. It would mandate all public school districts, public schools, and public charter schools to provide one breakfast and one lunch each school day to enrolled students at no cost to the student, parent, or guardians. It would allow nonpublic schools, Bureau of Indian Education schools, and other tribal schools the option to provide the same. It would require the State of North Dakota to reimburse school districts and schools at one hundred percent of the current rates used by the state for free meals, and the rate shall be adjusted annually for inflation. It would require the legislative assembly to identify a source of funds for reimbursement and if a source of funds is unable to be identified, reimbursement funds would be appropriated from the legacy earnings fund. This amendment would supersede any other part of the constitution that conflicts with it.',
      'The estimated fiscal impact of this measure is a $124.3 million to $134.3 million increase in ongoing biennial expenditures for the 2027–2029 biennium and will be adjusted for inflation every year after that.',
      'Voting “YES” means you approve the measure summarized above. Voting “NO” means you reject the measure summarized above.',
    ],
    source: { label: 'North Dakota Secretary of State, measure analysis', url: ANALYSIS_URL },
  },
  summary: [
    'Federal school meal programs serve free meals to students from households with income up to 130% of the poverty line and reduced-price meals up to 185%. North Dakota also pays for free meals for students at or below 225% of the poverty line, through an appropriation that runs through June 30, 2027.',
    'Measure No. 2 would require public schools to serve one breakfast and one lunch each school day to every enrolled student at no cost. The state would reimburse schools for costs that federal funding does not cover, at its free-meal rates as of the 2025-26 school year, adjusted for inflation; schools must claim all federal reimbursement available.',
  ],
  whatItDoes: [
    'Requires public school districts, public schools and public charter schools to serve one free breakfast and one free lunch each school day to every enrolled student.',
    'Lets nonpublic, Bureau of Indian Education and other tribal schools choose to do the same.',
    'Requires the Legislature to identify a funding source, or else appropriate the money from Legacy Fund earnings.',
    'Covers all enrolled students; the Secretary of State’s guide describes this as pre-K through grade 12. The model covers kindergarten through grade 12.',
  ],
  comparisons: [
    {
      caption: 'School meals at North Dakota public schools from the 2027-28 school year',
      rows: [
        { label: 'Household income up to 130% of poverty', currentLaw: 'Free', ifPasses: 'Free' },
        { label: '130% to 185% of poverty', currentLaw: 'Reduced price', ifPasses: 'Free' },
        { label: 'Above 185% of poverty', currentLaw: 'Full price', ifPasses: 'Free' },
        {
          label: 'Schools that already serve every meal free',
          currentLaw: 'Free',
          ifPasses: 'Free',
        },
      ],
      note: "Current law here assumes the state's free meals up to 225% of poverty end when their appropriation does, on June 30, 2027.",
    },
  ],
  whoIsAffected: [
    'North Dakota public schools enrolled 116,762 students in kindergarten through grade 12 in 2024-25 (National Center for Education Statistics). The Department of Public Instruction’s 2026 community eligibility list counts 9,196 students at 39 public schools in 18 districts that already serve every meal free; PolicyEngine uses this count, leaving out the list’s Bureau of Indian Education, tribal and private schools because the measure covers public schools.',
    'Families above 130% of the poverty line who buy school meals would no longer pay for them. The savings depend on how often a student eats breakfast and lunch at school.',
  ],
  whoIsAffectedSources: [
    {
      label: 'NCES Common Core of Data, 2024-25 state membership file (ZIP)',
      url: 'https://nces.ed.gov/ccd/Data/zip/ccd_sea_052_2425_l_1a_073025.zip',
    },
    {
      label: 'Department of Public Instruction, 2026 community eligibility list by district, page 2',
      url: 'https://www.nd.gov/dpi/sites/default/files/documents/ChildNutrition/SNP/2026CEPLEAwideNotificationReport2.pdf#page=2',
    },
  ],
  effectiveDate:
    'The 2027-28 school year. The measure takes effect 30 days after the election; its requirements start with the first full school year at least 90 days later. PolicyEngine scores 2028, the first full calendar year.',
  context: [
    {
      title: 'If the state program is renewed',
      body: [
        "North Dakota's free meals up to 225% of poverty are funded by a $6 million appropriation for the 2025-27 biennium. The model's current law assumes no new appropriation. If the Legislature renews the program in 2027, fewer students would newly receive free meals under the measure, and it would cost the state less than shown here.",
      ],
    },
  ],
  notModeled: [
    'How the state would pay for the meals. The measure requires the Legislature to identify a source of funds and, if it cannot, to appropriate reimbursement from the legacy earnings fund.',
    'Pre-kindergarten students.',
    'Nonpublic, Bureau of Indian Education and tribal schools that choose to participate.',
    'Changes in federal reimbursement that schools could claim by maximizing federal funding.',
  ],
  caveats: [
    "The model's population has more school-age children than public school enrollment, so PolicyEngine scales its counts to enrollment.",
    'How many students eat school meals determines the cost. The model adjusts for participation using federal data on average daily breakfast and lunch counts, and reports a low and a high case. The unadjusted figure, which assumes every student eats both meals every day, appears under measure-specific methods.',
  ],
  officialEstimateProse: [
    "The Legislative Council's fiscal impact report, based on Department of Public Instruction figures, puts the measure's cost at $124 million to $134 million for free meals and $300,000 for administration in the 2027-29 biennium: $124.3 million to $134.3 million in total, as the ballot states.",
  ],
  householdNote:
    'Enter your household to see the value of school meals for your children in 2028 under current law and if Measure No. 2 passes. The calculator assumes each child eats school breakfast and lunch every school day.',
  references: [
    { label: 'North Dakota Secretary of State, 2026 general election measure guide', url: GUIDE_URL },
    { label: 'Measure No. 2 full text', url: TEXT_URL },
    { label: 'Legislative Council fiscal impact report', url: FISCAL_URL },
    { label: 'House Bill 1013 (2025), section 12: free meals up to 225% of poverty', url: HB1013_URL },
  ],
};

export default content;
