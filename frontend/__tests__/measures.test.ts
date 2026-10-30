import { describe, expect, it } from 'vitest';
import registryJson from '../public/data/measures.json';
import { MEASURE_CONTENT, MEASURE_SLUGS, getContent } from '../content/measures';
import {
  MEASURES,
  MEASURES_BY_SLUG,
  REGISTRY,
  estimatesForYear,
  getMeasure,
  isMeasureSlug,
  measureName,
  measuresByState,
  normalizeRegistry,
  resolveYear,
  showsDistricts,
} from '../lib/registry';
import { measureTabs } from '../components/MeasureDashboard';
import { examplesFor, type ExampleHousehold, type ExampleHouseholdsPayload } from '../lib/measures';

describe('measure registry (measures.json)', () => {
  it('lists the six measures in the same order as the content and static routes', () => {
    expect(MEASURES.map((m) => m.slug)).toEqual([...MEASURE_SLUGS]);
    expect(Object.keys(MEASURE_CONTENT).sort()).toEqual([...MEASURE_SLUGS].sort());
  });

  it('turns the "Infinity" strings in income bands into numbers', () => {
    for (const m of MEASURES) {
      expect(m.income_bands[0].low).toBe(-Infinity);
      expect(m.income_bands[m.income_bands.length - 1].high).toBe(Infinity);
      for (const band of m.income_bands) expect(typeof band.label).toBe('string');
    }
  });

  it('normalizes a raw registry', () => {
    const raw = {
      election_date: '2026-11-03',
      pin: 'p',
      registry_hash: 'h',
      measures: [
        {
          ...registryJson.measures[0],
          income_bands: [['-Infinity', 10, 'Under $10'], [10, 'Infinity', '$10+']],
          official_estimates: [{ ...registryJson.measures[0].official_estimates[0], unit: 'people' }],
        },
      ],
    };
    const r = normalizeRegistry(raw);
    expect(r.measures[0].income_bands).toEqual([
      { low: -Infinity, high: 10, label: 'Under $10' },
      { low: 10, high: Infinity, label: '$10+' },
    ]);
    expect(r.measures[0].official_estimates[0].unit).toBe('people');
  });

  it('knows which states have congressional districts', () => {
    const withDistricts = MEASURES.filter((m) => m.has_districts).map((m) => m.state);
    expect(new Set(withDistricts)).toEqual(new Set(['CO', 'CA', 'WA']));
    expect(getMeasure('co-amendment-87').district_count).toBe(8);
    expect(getMeasure('ca-prop-3').district_count).toBe(52);
    expect(getMeasure('wa-i-645').district_count).toBe(10);
  });

  it('shows districts only for the two Colorado measures', () => {
    expect(MEASURES.filter((m) => m.show_districts).map((m) => m.slug)).toEqual([
      'co-amendment-87',
      'co-prop-nn',
    ]);
    for (const slug of ['co-amendment-87', 'co-prop-nn']) {
      expect(measureTabs(slug)).toEqual(['overview', 'statewide', 'districts', 'household', 'validation']);
    }
    for (const slug of ['ca-prop-3', 'wa-i-645', 'nd-measure-2', 'sd-amendment-i']) {
      expect(measureTabs(slug)).toEqual(['overview', 'statewide', 'household', 'validation']);
    }
  });

  it('follows show_districts when measures.json has it, else Colorado', () => {
    expect(showsDistricts({ show_districts: true, has_districts: true, state: 'WA' })).toBe(true);
    expect(showsDistricts({ show_districts: false, has_districts: true, state: 'CO' })).toBe(false);
    // An at-large state never gets a district view.
    expect(showsDistricts({ show_districts: true, has_districts: false, state: 'ND' })).toBe(false);
    expect(showsDistricts({ has_districts: true, state: 'CO' })).toBe(true);
    expect(showsDistricts({ has_districts: true, state: 'CA' })).toBe(false);
  });

  it('resolves years to scored ones', () => {
    const nn = getMeasure('co-prop-nn');
    expect(nn.years).toEqual([2027, 2028]);
    expect(resolveYear(nn, 2028)).toBe(2028);
    expect(resolveYear(nn, 2031)).toBe(nn.headline_year);
    expect(resolveYear(nn, null)).toBe(nn.headline_year);
  });

  it('looks up measures by slug', () => {
    expect(isMeasureSlug('wa-i-645')).toBe(true);
    expect(isMeasureSlug('wa-i-1000')).toBe(false);
    expect(isMeasureSlug(undefined)).toBe(false);
    expect(() => getMeasure('nope')).toThrow('Unknown measure');
    expect(measureName(MEASURES_BY_SLUG['nd-measure-2'])).toBe('North Dakota Constitutional Measure No. 2');
  });

  it('groups Colorado’s two measures together', () => {
    const groups = measuresByState();
    expect(groups.map((g) => g.state)).toEqual(['CO', 'CA', 'WA', 'ND', 'SD']);
    expect(groups[0].measures.map((m) => m.slug)).toEqual(['co-amendment-87', 'co-prop-nn']);
  });

  it('filters official estimates by tax year', () => {
    const wa = getMeasure('wa-i-645');
    expect(estimatesForYear(wa, 2029).map((e) => e.low)).toEqual([-4_432_000_000]);
  });

  it('carries the election date and a registry hash', () => {
    expect(REGISTRY.election_date).toBe('2026-11-03');
    expect(REGISTRY.registry_hash).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('examplesFor', () => {
  const household = (id: string) => ({ id, label: id, input: {}, response: {} }) as unknown as ExampleHousehold;

  it('reads the year-keyed layout the household pipeline writes', () => {
    const payload = {
      pin: 'p',
      measures: { 'wa-i-645': { years: { '2029': { households: [household('b')] }, '2028': { households: [household('a')] } } } },
    } as unknown as ExampleHouseholdsPayload;
    expect(examplesFor(payload, 'wa-i-645', 2029)).toMatchObject({ year: 2029, households: [{ id: 'b' }] });
    // A year without examples falls back to the first computed year.
    expect(examplesFor(payload, 'wa-i-645', 2031)).toMatchObject({ year: 2028, households: [{ id: 'a' }] });
    expect(examplesFor(payload, 'wa-i-645')).toMatchObject({ year: 2028 });
  });

  it('reads a single-year entry and handles missing measures', () => {
    const payload = {
      pin: 'p',
      measures: { 'nd-measure-2': { year: 2028, households: [household('c')] } },
    } as unknown as ExampleHouseholdsPayload;
    expect(examplesFor(payload, 'nd-measure-2', 2028)).toMatchObject({ year: 2028, households: [{ id: 'c' }] });
    expect(examplesFor(payload, 'sd-amendment-i', 2028)).toEqual({ year: null, households: [] });
    expect(examplesFor(null, 'sd-amendment-i')).toEqual({ year: null, households: [] });
  });
});

describe('measure content', () => {
  it.each(MEASURE_SLUGS)('%s has complete, sourced copy', (slug) => {
    const c = getContent(slug);
    expect(c.slug).toBe(slug);
    expect(c.description.length).toBeGreaterThan(40);
    expect(c.ballotText.paragraphs.length).toBeGreaterThan(0);
    expect(c.ballotText.source.url).toMatch(/^https:\/\//);
    expect(c.summary.length).toBeGreaterThan(0);
    expect(c.comparisons.length).toBeGreaterThan(0);
    expect(c.whoIsAffected.length).toBeGreaterThan(0);
    expect(c.officialEstimateProse.length).toBeGreaterThan(0);
    for (const r of c.references) expect(r.url).toMatch(/^https:\/\//);
  });

  it('keeps advocacy words out of the copy', () => {
    const banned = /\b(massive|burden|crushing|devastating|windfall|giveaway|slash(es)?|skyrocket|unfair)\b/i;
    for (const slug of MEASURE_SLUGS) {
      const c = getContent(slug);
      const ownWords = [
        c.description,
        ...c.summary,
        ...c.whatItDoes,
        c.whoIsAffectedSummary,
        ...(c.scenarioSummary ?? []),
        ...c.whoIsAffected,
        ...c.notModeled,
        ...c.caveats,
        ...c.officialEstimateProse,
        c.householdNote,
        ...c.context.flatMap((s) => s.body),
      ].join(' ');
      expect(ownWords).not.toMatch(banned);
    }
  });

  it('frames South Dakota as a conditional scenario that states both readings', () => {
    const sd = getContent('sd-amendment-i');
    expect(sd.scenario?.title).toMatch(/conditional/i);
    const text = sd.scenario?.body.join(' ') ?? '';
    expect(text).toMatch(/Attorney General/);
    expect(text).toMatch(/sponsors/);
    expect(text).toMatch(/no immediate effect/);
    expect(getMeasure('sd-amendment-i').kind_params.conditional).toBe(true);
  });

  it('notes the Colorado measure interactions', () => {
    expect(getContent('co-amendment-87').context.map((s) => s.title)).toContain('Proposition 136');
    expect(getContent('co-prop-nn').context.map((s) => s.title)).toContain('Proposition 137');
  });
});

describe('copy the final review corrected (29 October)', () => {
  it('promises no federal comparison the household results no longer show', () => {
    for (const slug of ['co-amendment-87', 'ca-prop-3'] as const) {
      expect(getContent(slug).householdNote).not.toMatch(/federal/);
      expect(getContent(slug).householdNote).toMatch(/income tax and net income/);
    }
  });

  it('says North Dakota’s household figures assume every meal is eaten', () => {
    expect(getContent('nd-measure-2').householdNote).toMatch(/each child eats both meals every school day/);
  });

  it('quotes the LAO in full and gives the school funding formula as PolicyEngine’s reading', () => {
    const body = getContent('ca-prop-3').context.flatMap((s) => s.body).join(' ');
    expect(body).toContain('budget reserves the state could use to fund these programs when revenues decline.”');
    expect(body).toMatch(/In PolicyEngine's reading, .*school funding formula \(Proposition 98\)/);
    expect(getContent('ca-prop-3').whatItDoes.join(' ')).not.toMatch(/after the school funding formula/);
  });

  it('dates Washington’s first inflation adjustment and lists the credits the model leaves out', () => {
    const wa = getContent('wa-i-645');
    expect(wa.comparisons[0].note).toMatch(/first adjusted for inflation for tax year 2030/);
    expect(wa.notModeled.join(' ')).toMatch(/ESSB 6346, sections 203 to 206/);
    expect(wa.notModeled.join(' ')).toMatch(/overstates the tax under current law/);
  });

  it('labels South Dakota’s 30,000 as the pamphlet statements’ figure, not an official estimate', () => {
    const row = getMeasure('sd-amendment-i').official_estimates.find((e) => e.low === 30_000)!;
    expect(row.source).toMatch(/Statements for and against.*\(not an official estimate\)/);
    expect(row.compare).toBe(false);
    expect(row.url).toMatch(/#page=2$/);
  });
});
