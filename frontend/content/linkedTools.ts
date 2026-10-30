/**
 * Ballot measures that PolicyEngine covers with a separate calculator rather
 * than this dashboard's pipeline. They appear on the landing map beside the
 * registry's measures and get a page that embeds the calculator; they are
 * not in ballot_calc/measures.py or measures.json.
 */

export interface LinkedTool {
  /** Page path under the dashboard, e.g. "ca-prop-40". */
  slug: string;
  /** Two-letter state code, e.g. "CA". */
  state: string;
  stateName: string;
  /** "Proposition 40" */
  designation: string;
  shortTitle: string;
  /** One-sentence policy overview, for the landing popup and the page metadata. */
  overview: string;
  /** One line above the embedded calculator. */
  intro: string;
  /** The calculator, embedded on the page. */
  embedUrl: string;
  /** The calculator on policyengine.org, for "Open the calculator in a new tab". */
  calculatorUrl: string;
  /** Accessible name of the embedded calculator. */
  embedTitle: string;
}

/**
 * California Proposition 40, the 2026 Billionaire Tax Act (Initiative
 * 25-0024A1): wording checked against the calculator's README
 * (PolicyEngine/california-wealth-tax).
 */
export const CA_PROP_40: LinkedTool = {
  slug: 'ca-prop-40',
  state: 'CA',
  stateName: 'California',
  designation: 'Proposition 40',
  shortTitle: 'One-time tax on billionaires’ wealth',
  overview:
    'California Proposition 40 would levy a one-time tax of 5% of the net worth of people who were California residents on January 1, 2026 and are worth $1 billion or more, valued on December 31, 2026, with the rate phasing in from 0% to 5% between $1.0 billion and $1.1 billion.',
  intro:
    'PolicyEngine’s calculator estimates receipts from the tax using Forbes data on California billionaires, with adjustable assumptions about residency, departures and future California income tax.',
  // Embedded through policyengine.org, which serves the same page, so the
  // iframe keeps working if the calculator's own host starts redirecting there.
  embedUrl: 'https://www.policyengine.org/us/california-wealth-tax',
  calculatorUrl: 'https://www.policyengine.org/us/california-wealth-tax',
  embedTitle: 'PolicyEngine’s California Proposition 40 billionaire tax calculator',
};

export const LINKED_TOOLS: readonly LinkedTool[] = [CA_PROP_40];
