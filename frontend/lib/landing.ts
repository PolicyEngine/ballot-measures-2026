/**
 * The landing map's states: the registry's measures (each with its page and
 * policy overview) merged with the linked calculators in content/linkedTools,
 * so a state lists every measure on its ballot that PolicyEngine covers.
 */

import { getContent } from '@/content/measures';
import { LINKED_TOOLS } from '@/content/linkedTools';
import { measuresByState } from './registry';

export interface LandingMeasure {
  /** Page path, e.g. "co-amendment-87" or "ca-prop-40". */
  slug: string;
  /** "Amendment 87" */
  designation: string;
  shortTitle: string;
  /** One-sentence policy overview. */
  overview: string;
  /** "View analysis" for a dashboard page, "Open the calculator" for a linked calculator. */
  linkLabel: string;
}

export interface LandingState {
  /** Two-letter code, e.g. "CO". */
  code: string;
  name: string;
  measures: LandingMeasure[];
}

/** States in registry order; a linked calculator joins its state's list after the registry's measures. */
export function landingStates(): LandingState[] {
  const states: LandingState[] = measuresByState().map((g) => ({
    code: g.state,
    name: g.stateName,
    measures: g.measures.map((m) => ({
      slug: m.slug,
      designation: m.designation,
      shortTitle: m.short_title,
      overview: getContent(m.slug).description,
      linkLabel: 'View analysis',
    })),
  }));
  for (const tool of LINKED_TOOLS) {
    const entry: LandingMeasure = {
      slug: tool.slug,
      designation: tool.designation,
      shortTitle: tool.shortTitle,
      overview: tool.overview,
      linkLabel: 'Open the calculator',
    };
    const state = states.find((s) => s.code === tool.state);
    if (state) state.measures.push(entry);
    else states.push({ code: tool.state, name: tool.stateName, measures: [entry] });
  }
  return states;
}
