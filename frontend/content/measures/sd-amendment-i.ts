import type { MeasureContent } from './types';

const PAMPHLET_URL =
  'https://sdsos.gov/elections-voting/upcoming-elections/general-information/2026%20Election%20Information/2026%20Ballot%20Question%20Information/2026%20Ballot%20Question%20Files/2026%20BQ/2026GeneralBQPamphletFINAL.pdf';
const AG_URL = 'https://atg.sd.gov/docs/May-18-2026_BallotIntiMeasureMedicCoverat-Final.pdf';
const DSS_URL = 'https://dss.sd.gov/docs/medicaid/reports/2025_Medicaid_Report.pdf';

const content: MeasureContent = {
  slug: 'sd-amendment-i',
  description:
    "South Dakota Amendment I concerns Medicaid expansion if the federal government's share of its cost falls below 90%. Officials disagree on whether expansion would then end automatically; PolicyEngine models a scenario in which the share falls and expansion ends on July 1, 2027.",
  measureType: 'Constitutional amendment referred by the Legislature (House Joint Resolution 5001); passes with a majority vote',
  ballotText: {
    label: 'Title and Attorney General explanation',
    paragraphs: [
      'Title: An Amendment to the South Dakota Constitution that Repeals Expanded Medicaid Coverage if Federal Funding for the Program Drops below 90%.',
      "Attorney General Explanation: Medicaid is a program, funded by the State and the federal government, to provide medical coverage for low-income children, pregnant women, disabled individuals, and the elderly. In the 2022 General Election the voters approved Constitutional Amendment D, which expanded Medicaid eligibility in South Dakota. Amendment D requires the State to also provide Medicaid benefits to anyone over the age of 18 and under 65 whose income is at or below 133% of the federal property [sic] level, plus 5% of the federal poverty level for the applicable family size. Currently, federal law requires the federal government to fund 90% of South Dakota's Medicaid expansion.",
      'This proposed Constitutional Amendment ends the expanded Medicaid coverage if the federal funding for expansion drops below 90%. If federal funding drops below that 90% threshold, Medicaid coverage will once again only apply to low-income children, pregnant women, disabled individuals, and the elderly.',
      'Vote “Yes” to adopt the amendment. Vote “No” to leave the Constitution as it is.',
    ],
    source: { label: 'South Dakota Secretary of State, 2026 ballot question pamphlet', url: PAMPHLET_URL },
  },
  summary: [
    "South Dakota voters expanded Medicaid in 2022 (Constitutional Amendment D) to adults aged 19 to 64 with income up to 133% of the poverty line, plus a 5% income disregard. Federal law sets the federal government's share of the cost for these adults at 90%.",
    'Amendment I would make the constitutional requirement to cover them last only until the federal share falls below 90%. Under current federal law the share stays at 90%, so the measure has no immediate effect.',
  ],
  whatItDoes: [
    'Limits the constitutional requirement to provide expanded Medicaid to the period before the federal share of its cost falls below 90%.',
    'Has no effect while the federal share remains 90%.',
  ],
  comparisons: [
    {
      caption: 'Medicaid for adults aged 19 to 64 covered through expansion',
      columns: ['Current law', 'Scenario: expansion ends'],
      rows: [
        {
          label: 'Income up to 100% of poverty',
          currentLaw: 'Medicaid',
          ifPasses: 'No Medicaid; not eligible for marketplace premium tax credits',
        },
        {
          label: '100% to 138% of poverty',
          currentLaw: 'Medicaid',
          ifPasses: 'No Medicaid; may qualify for marketplace premium tax credits',
        },
      ],
      note: 'Applies to adults who qualify only through expansion. Children, pregnant women, people with disabilities and older adults keep the coverage they have under pre-expansion rules.',
    },
  ],
  whoIsAffected: [
    "Both ballot pamphlet statements put expansion enrollment at about 30,000; the Department of Social Services reports an average of 29,055 a month in state fiscal year 2025.",
    'In the scenario, adults covered through expansion lose Medicaid. Those with income at or above the poverty line may qualify for premium tax credits to buy marketplace coverage; those below it generally qualify for neither.',
    'PolicyEngine counts Medicaid at its average cost per enrollee and premium tax credits at their dollar value. Marketplace premiums rise with age, so for some older adults the credit is worth more than that average cost, and their measured net income rises in the scenario. Net income does not reflect differences in premiums paid, cost sharing or access to care between Medicaid and marketplace coverage.',
  ],
  effectiveDate:
    'If approved, July 1, 2027. It has an effect only if the federal share falls below 90%; the scenario assumes expansion ends on July 1, 2027, and the model scores 2028, the first full year.',
  context: [],
  scenario: {
    title: 'A conditional scenario, not a forecast',
    body: [
      'Under current federal law, the federal government pays 90% of the cost of the expansion group, so Amendment I would have no immediate effect. The figures on this page show what would happen if the federal share fell below 90% and expansion ended on July 1, 2027.',
      "The ballot title and the Attorney General's explanation say the amendment “ends the expanded Medicaid coverage” if the federal share drops below 90%. The sponsors' statement in the ballot pamphlet says it “would NOT automatically end Medicaid expansion,” only the constitutional requirement to provide it. PolicyEngine takes no position on this question. The scenario follows the Attorney General's reading; under the sponsors' reading, these figures would apply only if the Legislature or voters later ended expansion.",
    ],
  },
  notModeled: [
    'A change in federal law lowering the federal share; the scenario assumes one occurs.',
    'Any later decision by the Legislature or voters to continue expansion with a lower federal share.',
    "Effects on hospitals, providers and the state's other health spending.",
  ],
  caveats: [
    "PolicyEngine's microdata predate South Dakota's expansion, so the model's count of expansion enrollees may differ from administrative counts; measure-specific methods compares them.",
    'Health coverage counts toward net income at its cost: Medicaid at its average cost per enrollee and premium tax credits at their dollar value. Losing Medicaid therefore lowers measured net income, and gaining a larger premium tax credit can raise it, whatever happens to out-of-pocket spending or access to care.',
  ],
  officialEstimateProse: [
    "No official fiscal note estimates the measure's cost. The Department of Social Services reports an average of 29,055 people a month enrolled through expansion in state fiscal year 2025, and both statements in the ballot pamphlet cite about 30,000. Measure-specific methods, below, compares these with the model's expansion enrollment and shows the model's expansion costs.",
  ],
  householdNote:
    'Enter your household to compare your 2028 Medicaid, marketplace premium tax credit and net income under current law and in the scenario where expansion ends. Net income counts Medicaid at its average cost per enrollee and premium tax credits at their dollar value, so a household that moves from Medicaid to a larger credit can show a gain.',
  references: [
    { label: 'South Dakota Secretary of State, 2026 ballot question pamphlet', url: PAMPHLET_URL },
    { label: 'Attorney General statement and amendment text', url: AG_URL },
    { label: 'Department of Social Services, state fiscal year 2025 Medicaid report', url: `${DSS_URL}#page=9` },
  ],
};

export default content;
