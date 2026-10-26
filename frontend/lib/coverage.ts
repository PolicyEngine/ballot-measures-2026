/**
 * Health coverage outcomes for the Medicaid measure (South Dakota). The
 * household and statewide views report people and premiums rather than net
 * income: the model values Medicaid at its average cost per enrollee, the
 * same for every adult, while premium tax credits rise with age, so a
 * net-income comparison would show some adults gaining when they move from
 * Medicaid to marketplace coverage.
 *
 * The household API reports, for each policy, the coverage of the
 * household's adults (`coverage_status`: medicaid, medicare,
 * subsidized_marketplace or no_subsidized_option), why an adult has no
 * subsidized option (`no_option_reason`), and `cash_net_income` (net income
 * without the value of health coverage). Responses without them fall back to
 * `medicaid_enrolled`, `ptc` and `marketplace_premium`.
 */

import type { HouseholdResponse, PolicyPoint, PolicySweep } from './householdApi';

export type CoverageKind = 'medicaid' | 'medicare' | 'marketplace' | 'no_subsidy' | 'other';

export const COVERAGE_LABELS: Record<Exclude<CoverageKind, 'other'>, string> = {
  medicaid: 'Medicaid',
  medicare: 'Medicare',
  marketplace: 'Subsidized marketplace coverage',
  no_subsidy: 'No subsidized coverage option',
};

/** Why an adult has neither Medicaid nor a premium tax credit (household API codes). */
export const NO_OPTION_REASONS: Record<string, string> = {
  work_requirement: 'Does not meet Medicaid’s work requirement, which also rules out the credit',
  below_poverty_line: 'Income below the poverty line, too low for a premium tax credit',
  above_subsidy_limit: 'Income above the premium tax credit limit',
  other: 'Not eligible for a premium tax credit',
};

/** Short names for the reasons, for chart bands. */
export const NO_OPTION_SHORT: Record<string, string> = {
  work_requirement: 'Work requirement',
  below_poverty_line: 'Coverage gap',
  above_subsidy_limit: 'Above the credit limit',
  other: 'No subsidized option',
};

/** Band colors: Medicaid dark teal, marketplace teal, Medicare light teal, no option gray. */
export const COVERAGE_COLORS: Record<CoverageKind, string> = {
  medicaid: 'var(--chart-3)',
  marketplace: 'var(--chart-1)',
  medicare: 'var(--primary-200)',
  no_subsidy: 'var(--gray-300)',
  other: 'var(--gray-200)',
};

/** Kinds whose band color takes white text. */
export const DARK_COVERAGE: ReadonlySet<CoverageKind> = new Set<CoverageKind>(['medicaid', 'marketplace']);

/** Map an API `coverage_status` value to a kind; null when unrecognized. */
export function parseCoverageStatus(raw: unknown): CoverageKind | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const s = raw.trim().toLowerCase();
  // Check the "no subsidy" spellings first: "unsubsidized" contains "subsid".
  if (/gap|uninsured|unsubsid|no[_ -]|^none$|without/.test(s)) return 'no_subsidy';
  if (s.includes('medicaid')) return 'medicaid';
  if (s.includes('medicare')) return 'medicare';
  if (/marketplace|subsid|ptc|exchange/.test(s)) return 'marketplace';
  return null;
}

const n = (v: number | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export interface CoverageOutcome {
  /** Coverage under current law. */
  baseline: CoverageKind;
  /** Coverage in the scenario. */
  reform: CoverageKind;
  baselineLabel: string;
  reformLabel: string;
  /** Why there is no subsidized option, when the API says. */
  baselineReason: string | null;
  reformReason: string | null;
  /** Someone in the household loses Medicaid. */
  losesMedicaid: boolean;
  /** People enrolled in Medicaid under each policy. */
  enrolledBaseline: number;
  enrolledReform: number;
  ptcBaseline: number;
  ptcReform: number;
  /** Marketplace premium the household pays after the credit, per year. */
  premiumBaseline: number;
  premiumReform: number;
  /** reform − baseline premium paid (positive = the household pays more). */
  premiumChange: number;
  /**
   * reform − baseline cash income (net income without the value of health
   * coverage); the premium change with its sign flipped when the API does
   * not report cash_net_income.
   */
  cashChange: number;
}

const label = (kind: CoverageKind, raw?: unknown) =>
  kind === 'other'
    ? (typeof raw === 'string' && raw.trim()
        ? raw.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
        : 'No Medicaid or premium tax credit')
    : COVERAGE_LABELS[kind];

function derived(point: PolicyPoint): CoverageKind {
  if (n(point.medicaid_enrolled) > 0) return 'medicaid';
  if (n(point.ptc) > 0) return 'marketplace';
  return 'other';
}

function reasonText(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  return NO_OPTION_REASONS[raw.trim().toLowerCase()] ?? null;
}

/** Coverage at the entered income, under current law and in the scenario. */
export function coverageOutcome(result: HouseholdResponse): CoverageOutcome {
  const b = result.at_income.baseline;
  const r = result.at_income.reform;
  const enrolledBaseline = n(b.medicaid_enrolled);
  const enrolledReform = n(r.medicaid_enrolled);
  const losesMedicaid = enrolledReform < enrolledBaseline;
  const ptcBaseline = n(b.ptc);
  const ptcReform = n(r.ptc);

  const baselineKind = parseCoverageStatus(b.coverage_status) ?? derived(b);
  let reformKind = parseCoverageStatus(r.coverage_status);
  if (!reformKind) {
    reformKind = losesMedicaid ? (ptcReform > ptcBaseline ? 'marketplace' : 'no_subsidy') : derived(r);
  }

  const premiumBaseline = n(b.marketplace_premium);
  const premiumReform = n(r.marketplace_premium);
  const premiumChange = premiumReform - premiumBaseline;
  const hasCash = typeof b.cash_net_income === 'number' && typeof r.cash_net_income === 'number';
  return {
    baseline: baselineKind,
    reform: reformKind,
    baselineLabel: label(baselineKind, b.coverage_status),
    reformLabel: label(reformKind, r.coverage_status),
    baselineReason: baselineKind === 'no_subsidy' ? reasonText(b.no_option_reason) : null,
    reformReason: reformKind === 'no_subsidy' ? reasonText(r.no_option_reason) : null,
    losesMedicaid,
    enrolledBaseline,
    enrolledReform,
    ptcBaseline,
    ptcReform,
    premiumBaseline,
    premiumReform,
    premiumChange,
    cashChange: hasCash ? n(r.cash_net_income) - n(b.cash_net_income) : -premiumChange,
  };
}

export interface CoverageSegment {
  kind: CoverageKind;
  /** The API's no_option_reason code (no_subsidy only). */
  reason: string | null;
  /** "Medicaid", "No subsidized coverage option (work requirement)". */
  label: string;
  /** Text inside the band: "Medicaid", "Coverage gap". */
  shortLabel: string;
  /** First and last incomes on the sweep grid with this coverage. */
  first: number;
  last: number;
  /** Where the band ends on the chart: the next band's first income, or the last income. */
  end: number;
}

const at = (values: unknown, i: number): number => {
  const v = Array.isArray(values) ? values[i] : undefined;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
};

/** Coverage at one point of the earnings sweep (falls back to enrollment and the credit). */
export function sweepCoverage(sweep: PolicySweep, i: number): { kind: CoverageKind; reason: string | null } {
  const kind =
    parseCoverageStatus(sweep.coverage_status?.[i]) ??
    (at(sweep.medicaid_enrolled, i) > 0 ? 'medicaid' : at(sweep.ptc, i) > 0 ? 'marketplace' : 'other');
  const raw = sweep.no_option_reason?.[i];
  const reason = kind === 'no_subsidy' && typeof raw === 'string' && raw.trim() ? raw.trim().toLowerCase() : null;
  return { kind, reason };
}

const REASON_PHRASE: Record<string, string> = {
  work_requirement: 'work requirement',
  below_poverty_line: 'income below the poverty line',
  above_subsidy_limit: 'income above the credit limit',
};

function segmentLabels(kind: CoverageKind, reason: string | null): { label: string; shortLabel: string } {
  switch (kind) {
    case 'medicaid':
      return { label: 'Medicaid', shortLabel: 'Medicaid' };
    case 'medicare':
      return { label: 'Medicare', shortLabel: 'Medicare' };
    case 'marketplace':
      return { label: COVERAGE_LABELS.marketplace, shortLabel: 'Marketplace' };
    case 'no_subsidy': {
      const phrase = reason ? REASON_PHRASE[reason] : undefined;
      return {
        label: phrase ? `${COVERAGE_LABELS.no_subsidy} (${phrase})` : COVERAGE_LABELS.no_subsidy,
        shortLabel: (reason && NO_OPTION_SHORT[reason]) || 'No subsidized option',
      };
    }
    default:
      return { label: 'No Medicaid or premium tax credit', shortLabel: 'Neither' };
  }
}

/** Runs of the same coverage (and reason) across the earnings sweep. */
export function coverageSegments(incomes: number[], sweep: PolicySweep): CoverageSegment[] {
  const segments: CoverageSegment[] = [];
  incomes.forEach((income, i) => {
    const { kind, reason } = sweepCoverage(sweep, i);
    const previous = segments[segments.length - 1];
    if (previous && previous.kind === kind && previous.reason === reason) {
      previous.last = income;
      previous.end = income;
      return;
    }
    if (previous) previous.end = income;
    segments.push({ kind, reason, ...segmentLabels(kind, reason), first: income, last: income, end: income });
  });
  return segments;
}

/** The coverage changes for the household's adults. */
export const coverageChanges = (o: CoverageOutcome): boolean => o.losesMedicaid || o.baseline !== o.reform;

/** One line for an example card: "Medicaid → Subsidized marketplace coverage". */
export function coverageSummary(outcome: CoverageOutcome): string {
  if (!coverageChanges(outcome)) {
    return outcome.baseline === 'medicaid' ? 'Keeps Medicaid' : 'No change in coverage';
  }
  return `${outcome.baselineLabel} → ${outcome.reformLabel}`;
}
