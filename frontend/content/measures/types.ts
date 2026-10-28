/**
 * Copy for one measure's pages. Structural facts (state, designation, short
 * title, years, official estimate figures, districts) come from
 * measures.json; this file holds the words. Framing rules: compare "if
 * the measure passes" with "current law", describe what changes without
 * judging it, and show official estimates beside PolicyEngine's. Quote
 * official text verbatim and cite it.
 */

export interface Reference {
  label: string;
  url: string;
}

export interface ComparisonRow {
  label: string;
  currentLaw: string;
  ifPasses: string;
}

export interface Comparison {
  caption: string;
  /** Column headings; default ["Current law", "If it passes"]. */
  columns?: [string, string];
  rows: ComparisonRow[];
  note?: string;
}

export interface ContentSection {
  title: string;
  body: string[];
  /** Sources for the figures and quotations in the body. */
  sources?: Reference[];
}

/** The share of the vote a measure needs, with the official source that states it. */
export interface VoteRequirement {
  text: string;
  sources: Reference[];
}

export interface SimpleTable {
  caption: string;
  columns: string[];
  rows: string[][];
  note?: string;
}

export interface BallotText {
  /** "Ballot title", "Ballot label", "Ballot language", … */
  label: string;
  /** Verbatim text, one paragraph per entry. */
  paragraphs: string[];
  /** A table printed with the ballot title (Colorado). */
  table?: SimpleTable;
  source: Reference;
}

export interface MeasureContent {
  slug: string;
  /** One sentence for the overview intro, the landing card and the page metadata. */
  description: string;
  /** How the measure reaches the ballot, e.g. "Citizen-initiated constitutional amendment". */
  measureType: string;
  /** The vote it needs to pass, cited to an official source. */
  voteRequirement: VoteRequirement;
  /** The official ballot wording, verbatim. */
  ballotText: BallotText;
  /** Plain-language summary, one to three short paragraphs. */
  summary: string[];
  /** What changes if the measure passes. */
  whatItDoes: string[];
  /** Current law vs. if the measure passes (one table per topic or year). */
  comparisons: Comparison[];
  /** Who the change reaches, in one or two sentences for the overview. */
  whoIsAffectedSummary: string;
  /** Who the change reaches, in full (Methods tab). */
  whoIsAffected: string[];
  /** Sources for the figures in whoIsAffected. */
  whoIsAffectedSources?: Reference[];
  /** When the change would take effect. */
  effectiveDate: string;
  /** Interactions with other measures or laws. */
  context: ContentSection[];
  /** For measures modeled as a scenario rather than a certain outcome (SD); the full text is on the Methods tab. */
  scenario?: ContentSection;
  /** The scenario box on the overview: two sentences, plus one on the competing readings. */
  scenarioSummary?: string[];
  /**
   * Why coverage changes at each income cutoff, for the household tab's
   * coverage bands (Medicaid measure). The income levels come from the data.
   */
  coverageCutoffs?: {
    /** Where Medicaid ends, e.g. "the expansion limit, 138% of the poverty line". */
    medicaidLimit: string;
    /** Below the premium tax credit's floor. */
    belowPovertyLine: string;
    /** Medicaid's work requirement. */
    workRequirement: string;
    /** Above the premium tax credit's ceiling. */
    aboveSubsidyLimit: string;
  };
  /** Provisions the model does not capture. */
  notModeled: string[];
  /** Caveats on the model's estimates. */
  caveats: string[];
  /** How the official estimates were made and how they differ from the model. */
  officialEstimateProse: string[];
  /** Official tables worth showing beside the model (methodology tab). */
  officialTables?: SimpleTable[];
  /** Short note above the household calculator. */
  householdNote: string;
  /** Primary sources. */
  references: Reference[];
}
