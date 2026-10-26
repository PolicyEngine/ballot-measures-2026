#!/usr/bin/env node
/**
 * Write SYNTHETIC results files in the data contract's shape
 * (scripts/DATA_SCHEMA.md) so the UI can be built and reviewed before the
 * pipeline publishes real results:
 *
 *   node scripts/make-fixtures.mjs
 *
 * writes public/data-fixtures/ (served when NEXT_PUBLIC_DATA_DIR=data-fixtures,
 * which shows a "Placeholder data" banner) and __tests__/fixtures/ (vitest).
 * The numbers are invented from simple formulas and a seeded random number
 * generator. They are NOT PolicyEngine estimates. Never write these files
 * into public/data/.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/measures.json'), 'utf8'));
const OUT_DIRS = [path.join(ROOT, 'public/data-fixtures'), path.join(ROOT, '__tests__/fixtures')];

// ── Seeded random numbers (mulberry32) ──────────────────────────────────

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (text) => [...text].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

const round = (v, digits = 2) => Number(v.toFixed(digits));
const toNumber = (v) => (v === 'Infinity' ? Infinity : v === '-Infinity' ? -Infinity : Number(v));

// ── State sizes (illustrative) ──────────────────────────────────────────

const STATE = {
  CO: { households: 2_400_000, sample: 21_000, people: 5_900_000 },
  CA: { households: 14_100_000, sample: 128_000, people: 39_400_000 },
  WA: { households: 3_100_000, sample: 26_000, people: 7_900_000 },
  ND: { households: 330_000, sample: 3_900, people: 790_000 },
  SD: { households: 370_000, sample: 4_300, people: 920_000 },
};

// Synthetic headline profile per measure-year: statewide budget change,
// average household change, winners and losers (percent of households).
const PROFILES = {
  'co-amendment-87': { 2027: { budget: 1.81e9, winners: 71.5, losers: 3.2 } },
  'co-prop-nn': { 2027: { budget: 2.63e8, winners: 0, losers: 74.8 }, 2028: { budget: 2.86e8, winners: 0, losers: 75.6 } },
  'ca-prop-3': { 2031: { budget: 9.6e9, winners: 0, losers: 2.1 } },
  'wa-i-645': { 2028: { budget: -3.42e9, winners: 0.9, losers: 0 }, 2029: { budget: -3.95e9, winners: 0.9, losers: 0 } },
  'nd-measure-2': { 2028: { budget: -6.3e7, winners: 19.4, losers: 0 } },
  'sd-amendment-i': { 2028: { budget: 2.9e7, winners: 0, losers: 6.8 } },
};

// How a measure's change is spread over deciles (weights sum to 1; sign
// gives the household's side).
const DECILE_SHAPES = {
  'co-amendment-87': [0.004, 0.012, 0.02, 0.026, 0.03, 0.033, 0.034, 0.035, 0.03, -1.224],
  'co-prop-nn': [0.06, 0.07, 0.08, 0.09, 0.1, 0.11, 0.12, 0.12, 0.12, 0.13],
  'ca-prop-3': [0, 0, 0, 0, 0, 0, 0, 0, 0.002, 0.998],
  'wa-i-645': [0, 0, 0, 0, 0, 0, 0, 0, 0.001, 0.999],
  'nd-measure-2': [0.05, 0.08, 0.13, 0.16, 0.16, 0.14, 0.12, 0.09, 0.05, 0.02],
  'sd-amendment-i': [0.34, 0.31, 0.18, 0.09, 0.05, 0.02, 0.01, 0, 0, 0],
};

/** Household-side total change: minus the state budget change (taxes and
 *  refunds), the meal value (ND) or coverage lost (SD). */
/** Current law's Medicaid work requirement: 80 hours a month at $7.25 (from 2027). */
const WORK_REQUIREMENT_EARNINGS = 6_960;

function householdTotal(slug, budget) {
  if (slug === 'nd-measure-2') return 5.9e7;
  if (slug === 'sd-amendment-i') return -1.94e8;
  return -budget;
}

// ── CSV helpers ─────────────────────────────────────────────────────────

const field = (v) => {
  const text = String(v);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const csv = (header, rows) => [header.join(','), ...rows.map((r) => r.map(field).join(','))].join('\n') + '\n';

// ── Statewide files ─────────────────────────────────────────────────────

const metricsRows = [];
// manifest.json diagnostics: the poverty metrics on the model's own SPM
// resources, before the pipeline adds omitted income back (synthetic: the
// current-law rates run 0.6 points higher, the changes match).
const DIAGNOSTICS = {};
const decileRows = [];
const wlRows = [];
const bracketRows = [];
const districtRows = [];

for (const m of REGISTRY.measures) {
  const st = STATE[m.state];
  for (const year of m.years) {
    const p = PROFILES[m.slug][year];
    const rand = rng(hash(`${m.slug}-${year}`));
    const metrics = {};
    const hhTotal = householdTotal(m.slug, p.budget);
    const winners = (st.households * p.winners) / 100;
    const losers = (st.households * p.losers) / 100;

    metrics.households = st.households;
    metrics.sample_households = st.sample;
    metrics.effective_sample_households = Math.round(st.sample * (0.38 + rand() * 0.1));
    const affectedShare = (p.winners + p.losers) / 100;
    metrics.affected_sample_households = Math.max(12, Math.round(st.sample * affectedShare * 0.9));
    metrics.effective_affected_sample_households = Math.max(5, Math.round(metrics.affected_sample_households * 0.35));
    metrics.net_income_change_total = hhTotal;
    metrics.avg_household_net_income_change = hhTotal / st.households;
    metrics.winners = winners;
    metrics.losers = losers;
    metrics.winners_rate = p.winners;
    metrics.losers_rate = p.losers;
    metrics.avg_gain = winners > 0 ? Math.max(0, hhTotal > 0 ? hhTotal / winners : 300) : 0;
    metrics.avg_loss = losers > 0 ? Math.min(0, hhTotal < 0 ? hhTotal / losers : -300) : 0;

    // Poverty (percents); changes follow the household side.
    const direction = Math.sign(hhTotal);
    const povertyShift = { 'nd-measure-2': -0.18, 'sd-amendment-i': 0.32, 'co-prop-nn': 0.03 }[m.slug] ?? 0;
    for (const [key, base] of [
      ['poverty', 9.6],
      ['child_poverty', 8.9],
      ['deep_poverty', 3.4],
      ['deep_child_poverty', 2.6],
    ]) {
      const scale = key.includes('deep') ? 0.5 : 1;
      const change = povertyShift * scale * (key.includes('child') && m.slug === 'sd-amendment-i' ? 0.2 : 1);
      metrics[`${key}_baseline_rate`] = base;
      metrics[`${key}_reform_rate`] = round(base + change, 3);
      metrics[`${key}_rate_change`] = round(change, 3);
      metrics[`${key}_percent_change`] = round((change / base) * 100, 3);
    }
    metrics.people_lifted_out_of_poverty = direction > 0 ? Math.round(st.people * Math.abs(povertyShift) / 100) : 0;
    metrics.people_pushed_into_poverty = direction < 0 ? Math.round(st.people * Math.abs(povertyShift) / 100) : 0;
    metrics.children_lifted_out_of_poverty = Math.round(metrics.people_lifted_out_of_poverty * 0.45);
    metrics.children_pushed_into_poverty = Math.round(metrics.people_pushed_into_poverty * 0.3);

    // Budget block (government's side).
    let stateRevenue = 0;
    let stateSpending = 0;
    let federalRevenue = 0;
    let federalSpending = 0;
    if (m.kind === 'income_tax' || m.kind === 'tabor_refund') stateRevenue = p.budget;
    if (m.kind === 'school_meals') stateSpending = -p.budget;
    if (m.kind === 'medicaid') {
      stateSpending = -p.budget;
      federalSpending = -1.66e8;
    }
    metrics.state_revenue_impact = stateRevenue;
    metrics.state_spending_impact = stateSpending;
    metrics.state_budget_impact = stateRevenue - stateSpending;
    metrics.federal_revenue_impact = federalRevenue;
    metrics.federal_spending_impact = federalSpending;
    metrics.federal_budget_impact = federalRevenue - federalSpending;
    metrics.target_change = m.target_sign * Math.abs(p.budget || 1e6);

    // Kind metrics.
    if (m.kind === 'income_tax') {
      const more = m.slug === 'wa-i-645' ? 0 : Math.round(losers * 1.15);
      const less = m.slug === 'wa-i-645' ? 28_700 + (year - 2028) * 900 : m.slug === 'co-amendment-87' ? Math.round(winners * 1.2) : 0;
      metrics.tax_units_paying_more = more;
      metrics.tax_units_paying_less = less;
      metrics.avg_tax_change_paying_more = more ? p.budget / more : 0;
      metrics.avg_tax_change_paying_less = less ? (m.slug === 'wa-i-645' ? p.budget / less : -325 * 0.62) : 0;
      metrics.revenue_share_agi_1m_plus = m.slug === 'co-amendment-87' ? 0.79 : m.slug === 'ca-prop-3' ? 0.84 : 1;
      metrics.baseline_state_income_tax = { CO: 1.32e10, CA: 1.71e11, WA: 3.5e9 }[m.state] * (1 + (year - 2027) * 0.04);
      // Methodology tab only: revenue scaled to IRS top-income coverage.
      metrics.revenue_coverage_scaled = p.budget * 1.24;
      metrics.soi_coverage_returns_1m_plus = 2.2;
      metrics.soi_coverage_agi_above_1m = 0.6;
    }
    if (m.kind === 'tabor_refund') {
      metrics.refund_total_baseline = p.budget;
      metrics.refund_recipients_baseline = 3_650_000 + (year - 2027) * 40_000;
      metrics.avg_refund_baseline = p.budget / metrics.refund_recipients_baseline;
    }
    if (m.kind === 'school_meals') {
      Object.assign(metrics, {
        k12_children_model: 152_400,
        children_newly_free_model: 98_300,
        meal_value_change_model: 1.12e8,
        meal_value_change_adjusted_low: 5.4e7,
        meal_value_change_adjusted_high: 6.4e7,
        state_cost_adjusted_low: 5.95e7,
        state_cost_adjusted_high: 6.7e7,
        state_cost_biennium_low: 1.193e8,
        state_cost_biennium_high: 1.343e8,
        participation_lunch: 0.79,
        participation_breakfast: 0.29,
        enrollment_scale: 0.69,
      });
    }
    if (m.kind === 'medicaid') {
      // scripts/DATA_SCHEMA.md: the coverage and budget keys are calibrated
      // to administrative enrollment (unsuffixed) and keep the model's value
      // as `<key>_model`; baseline_expansion_enrollees stays the model's.
      const enrolledModel = 56_000;
      const factor = 29_055 / enrolledModel;
      const model = {
        people_losing_medicaid: 54_000,
        losing_below_100fpl: 39_000,
        losing_100_plus_fpl: 15_000,
        gaining_ptc: 3_400,
        medicaid_cost_change: -6.4e8,
        medicaid_state_cost_change: -6.4e7,
        medicaid_federal_cost_change: -5.76e8,
        ptc_change: 3.0e7,
        state_revenue_impact: metrics.state_revenue_impact,
        state_spending_impact: metrics.state_spending_impact,
        state_budget_impact: metrics.state_budget_impact,
        federal_revenue_impact: metrics.federal_revenue_impact,
        federal_spending_impact: metrics.federal_spending_impact,
        federal_budget_impact: metrics.federal_budget_impact,
      };
      for (const [k, v] of Object.entries(model)) {
        metrics[`${k}_model`] = v;
        metrics[k] = v * factor;
      }
      metrics.baseline_expansion_enrollees = enrolledModel;
      metrics.admin_expansion_enrollees = 29_055;
      metrics.enrollment_calibration_factor = factor;
    }
    for (const [metric, value] of Object.entries(metrics)) {
      metricsRows.push([m.slug, year, metric, round(value, 4)]);
    }
    const povertyModel = Object.fromEntries(
      Object.entries(metrics)
        .filter(([k]) => /poverty_(baseline_rate|reform_rate|rate_change|percent_change)$|_(lifted_out_of|pushed_into)_poverty$/.test(k))
        .map(([k, v]) => [k, /_(baseline|reform)_rate$/.test(k) ? round(v + 0.6, 3) : v]),
    );
    DIAGNOSTICS[`${m.slug}:${year}`] = { poverty_model_spm_resources: povertyModel };

    // Deciles (households per decile = households / 10). A shape with mixed
    // signs carries the household-side sign in its weights.
    const shape = DECILE_SHAPES[m.slug];
    const mixed = shape.some((w) => w < 0);
    shape.forEach((w, i) => {
      const total = mixed ? w * Math.abs(hhTotal) : w * hhTotal;
      const avg = total / (st.households / 10);
      const baseIncome = [18_000, 32_000, 45_000, 58_000, 72_000, 88_000, 108_000, 135_000, 180_000, 420_000][i];
      decileRows.push([m.slug, year, i + 1, round(avg, 2), round(avg / baseIncome, 6)]);
    });

    // Winners and losers (person shares).
    const all = { gain: p.winners / 100, lose: p.losers / 100 };
    const shareRow = (decile, gain, lose) => {
      const gainMore = gain * (m.slug === 'nd-measure-2' ? 0.45 : 0.1);
      const loseMore = lose * (m.slug === 'sd-amendment-i' ? 0.6 : 0.05);
      return [
        m.slug,
        year,
        decile,
        round(gainMore, 6),
        round(gain - gainMore, 6),
        round(Math.max(0, 1 - gain - lose), 6),
        round(lose - loseMore, 6),
        round(loseMore, 6),
      ];
    };
    wlRows.push(shareRow('All', all.gain, all.lose));
    shape.forEach((w, i) => {
      let gain;
      let lose;
      if (mixed) {
        gain = w > 0 ? Math.min(0.95, all.gain * 1.1) : all.gain * 0.4;
        lose = w > 0 ? all.lose * 0.3 : Math.min(0.95, all.lose * 4);
      } else {
        const k = Math.abs(w) * 10;
        gain = Math.min(0.95, all.gain * k);
        lose = Math.min(0.95, all.lose * k);
      }
      wlRows.push(shareRow(i + 1, gain, Math.min(lose, 1 - gain)));
    });

    // Income bands.
    const bands = m.income_bands.map(([low, high, label]) => [toNumber(low), toNumber(high), label]);
    const bandWeights = bands.map((_, i) => Math.max(0.02, 0.32 * Math.exp(-0.45 * i)));
    const weightSum = bandWeights.reduce((a, b) => a + b, 0);
    bands.forEach(([low, , label], i) => {
      const households = (st.households * bandWeights[i]) / weightSum;
      let share;
      if (m.kind === 'income_tax') share = low >= 500_000 || (m.state !== 'CO' && low >= 250_000) ? 1 / Math.max(1, bands.filter(([l]) => l >= (m.state === 'CO' ? 500_000 : 250_000)).length) : 0;
      else share = bandWeights[i] / weightSum;
      const total = m.slug === 'co-amendment-87' && low < 500_000 ? 1.4e8 * bandWeights[i] : hhTotal * share;
      const affected = Math.abs(total) > 0 ? households * Math.min(0.95, (p.winners + p.losers) / 100 * 1.4) : 0;
      bracketRows.push([
        m.slug,
        year,
        label,
        round(households, 1),
        round(total > 0 ? affected : 0, 1),
        round(total < 0 ? affected : 0, 1),
        round(total, 2),
        round(total / households, 2),
        round(m.kind === 'school_meals' || m.kind === 'medicaid' ? -total * 0.4 : -total, 2),
      ]);
    });

    // Districts: only the measures the registry shows them for (Colorado's).
    const showDistricts =
      typeof m.show_districts === 'boolean' ? m.show_districts && m.has_districts : m.has_districts && m.state === 'CO';
    if (showDistricts) {
      const n = m.district_count;
      const weights = Array.from({ length: n }, () => 0.6 + rand() * 0.8);
      const wsum = weights.reduce((a, b) => a + b, 0);
      for (let d = 1; d <= n; d++) {
        const households = st.households / n;
        const total = hhTotal * (weights[d - 1] / wsum);
        const avg = total / households;
        districtRows.push([
          m.slug,
          year,
          `${m.state}-${String(d).padStart(2, '0')}`,
          m.state,
          round(households, 1),
          round(avg, 2),
          round(avg / 95_000, 6),
          round(Math.min(1, (p.winners / 100) * (0.7 + rand() * 0.6)), 6),
          round(Math.min(1, (p.losers / 100) * (0.7 + rand() * 0.6)), 6),
          round(-total, 2),
        ]);
      }
    }
  }
}

// ── Example households ──────────────────────────────────────────────────

const CO_TIERS = {
  2027: [[57_000, 43], [117_000, 58], [187_000, 67], [265_000, 79], [349_000, 85], [Infinity, 137]],
  2028: [[59_000, 47], [120_000, 62], [192_000, 71], [272_000, 85], [358_000, 91], [Infinity, 147]],
};
const CO_RATES = [[25_000, 0.037], [100_000, 0.042], [500_000, 0.044], [750_000, 0.074], [1_000_000, 0.079], [Infinity, 0.084]];

function graduated(taxable) {
  let tax = 0;
  let lower = 0;
  for (const [upper, rate] of CO_RATES) {
    if (taxable > lower) tax += (Math.min(taxable, upper) - lower) * rate;
    lower = upper;
  }
  return tax;
}

function exampleResponse(m, year, profile) {
  const married = profile.married;
  const kids = profile.dependents ?? [];
  const adults = married ? 2 : 1;
  const size = adults + kids.length;
  const fpl = 15_650 + 5_500 * (size - 1);
  const top = Math.max(m.sweep_max, profile.income);
  const step = top / 40;
  const grid = Array.from({ length: 41 }, (_, i) => Math.round(i * step));
  const at = profile.income;
  const xs = grid.includes(at) ? grid : [...grid, at].sort((a, b) => a - b);
  const deduction = married ? 32_000 : kids.length ? 24_000 : 16_000;

  const point = (income) => {
    const total = income + (married ? profile.spouse_income ?? 0 : 0);
    const taxable = Math.max(0, total - deduction);
    const federal = Math.max(-3_000 * kids.length, taxable * (taxable > 400_000 ? 0.3 : taxable > 100_000 ? 0.18 : 0.1) - 2_000 * kids.length);
    let stateBase = 0;
    let stateReform = 0;
    const base = { refund: 0, meal_value: 0, free_meals: 0, reduced_price_meals: 0, medicaid: 0, ptc: 0, medicaid_enrolled: 0, marketplace_premium: 0 };
    const reform = { ...base };
    if (m.slug === 'co-amendment-87') {
      stateBase = taxable * 0.044;
      stateReform = graduated(taxable);
    } else if (m.slug === 'co-prop-nn') {
      const amount = CO_TIERS[year].find(([upper]) => total <= upper)[1];
      base.refund = amount * adults;
      stateBase = taxable * 0.044 - base.refund;
      stateReform = taxable * 0.044;
    } else if (m.slug === 'ca-prop-3') {
      const cut = married ? [[892_000, 0.01], [1_486_000, 0.02], [Infinity, 0.03]] : [[446_000, 0.01], [743_000, 0.02], [Infinity, 0.03]];
      const start = married ? 743_000 : 371_000;
      let extra = 0;
      let lower = start;
      for (const [upper, rate] of cut) {
        if (taxable > lower) extra += (Math.min(taxable, upper) - lower) * rate;
        lower = upper;
      }
      stateBase = taxable * 0.08;
      stateReform = stateBase + extra;
    } else if (m.slug === 'wa-i-645') {
      stateBase = Math.max(0, total - 1_000_000) * 0.099;
      stateReform = 0;
    } else if (m.slug === 'nd-measure-2') {
      const schoolKids = kids.filter((a) => a >= 5 && a <= 17).length;
      const ratio = total / fpl;
      const perKid = 1_150;
      const baseValue = ratio <= 1.3 ? perKid : ratio <= 1.85 ? perKid * 0.82 : 0;
      base.meal_value = schoolKids * baseValue;
      base.free_meals = ratio <= 1.3 ? base.meal_value : 0;
      base.reduced_price_meals = ratio > 1.3 && ratio <= 1.85 ? base.meal_value : 0;
      reform.meal_value = schoolKids * perKid;
      reform.free_meals = reform.meal_value;
      stateBase = taxable * 0.01;
      stateReform = stateBase;
    } else if (m.slug === 'sd-amendment-i') {
      const ratio = total / fpl;
      const eligible = ratio <= 1.38 && kids.length === 0;
      // Current law's work requirement (from 2027): 80 hours a month at the federal minimum wage.
      const working = income >= WORK_REQUIREMENT_EARNINGS;
      base.medicaid = eligible && working ? 7_400 * adults : 0;
      base.medicaid_enrolled = eligible && working ? adults : 0;
      reform.ptc = eligible && ratio >= 1 ? 5_900 * adults : ratio > 1.38 && ratio < 4 ? Math.max(0, 5_900 - (ratio - 1.38) * 1_800) * adults : 0;
      base.ptc = ratio > 1.38 && ratio < 4 ? Math.max(0, 5_900 - (ratio - 1.38) * 1_800) * adults : 0;
      reform.marketplace_premium = reform.ptc > 0 ? Math.round(0.03 * total) : 0;
      base.marketplace_premium = base.ptc > 0 ? Math.round(0.03 * total) : 0;
    }
    const netBase = total - federal - stateBase + base.meal_value + base.medicaid + base.ptc - base.marketplace_premium;
    const netReform = total - federal - stateReform + reform.meal_value + reform.medicaid + reform.ptc - reform.marketplace_premium;
    const pick = (values) => {
      const keys = { income_tax: [], tabor_refund: ['refund'], school_meals: ['meal_value', 'free_meals', 'reduced_price_meals'], medicaid: ['medicaid', 'ptc', 'medicaid_enrolled', 'marketplace_premium'] }[m.kind];
      return Object.fromEntries(keys.map((k) => [k, round(values[k], 2)]));
    };
    return {
      baseline: { net_income: round(netBase, 2), state_tax: round(stateBase, 2), federal_tax: round(federal, 2), ...pick(base) },
      reform: { net_income: round(netReform, 2), state_tax: round(stateReform, 2), federal_tax: round(federal, 2), ...pick(reform) },
    };
  };
  // Coverage text and cash income (Medicaid kind), as the household API reports them.
  const status = (values) =>
    values.medicaid_enrolled > 0 ? 'medicaid' : values.ptc > 0 ? 'subsidized_marketplace' : 'no_subsidized_option';
  const reasonFor = (policy, income, values) => {
    if (status(values) !== 'no_subsidized_option') return null;
    const ratio = (income + (married ? profile.spouse_income ?? 0 : 0)) / fpl;
    if (policy === 'baseline' && ratio <= 1.38 && kids.length === 0 && income < WORK_REQUIREMENT_EARNINGS) {
      return 'work_requirement';
    }
    if (ratio < 1) return 'below_poverty_line';
    return ratio >= 4 ? 'above_subsidy_limit' : 'other';
  };
  const withCoverage = (policy, income, values) => ({
    ...values,
    cash_net_income: round(values.net_income - (values.medicaid ?? 0) - (values.ptc ?? 0), 2),
    coverage_status: status(values),
    no_option_reason: reasonFor(policy, income, values),
  });
  const pointWithStatus = (income) => {
    const pt = point(income);
    if (m.kind !== 'medicaid') return pt;
    return { baseline: withCoverage('baseline', income, pt.baseline), reform: withCoverage('reform', income, pt.reform) };
  };

  const points = xs.map(pointWithStatus);
  const series = (policy) => {
    const keys = Object.keys(points[0][policy]);
    return Object.fromEntries(keys.map((k) => [k, points.map((pt) => pt[policy][k])]));
  };
  const index = xs.indexOf(at);
  return {
    measure: m.slug,
    year,
    state: m.state,
    kind: m.kind,
    pin: 'synthetic fixture',
    income: at,
    filing_status: married ? 'JOINT' : kids.length ? 'HEAD_OF_HOUSEHOLD' : 'SINGLE',
    income_range: xs,
    income_index: index,
    sweep: { baseline: series('baseline'), reform: series('reform') },
    at_income: pointWithStatus(at),
  };
}

// Same layout as scripts/compute_example_households.py: every scored year.
const exampleId = (label) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const examples = {
  pin: 'synthetic fixture',
  generated_at_utc: '2026-10-23T00:00:00Z',
  synthetic: true,
  measures: Object.fromEntries(
    REGISTRY.measures.map((m) => [
      m.slug,
      {
        years: Object.fromEntries(
          m.years.map((year) => [
            String(year),
            {
              households: m.example_profiles.map((profile) => {
                const input = {
                  measure: m.slug,
                  year,
                  age_head: profile.age_head,
                  married: profile.married,
                  income: profile.income,
                  dependents: (profile.dependents ?? []).map((age) => ({ age })),
                  ...(profile.married
                    ? { age_spouse: profile.age_head, spouse_income: profile.spouse_income ?? 0 }
                    : {}),
                };
                return {
                  id: exampleId(profile.label),
                  label: profile.label,
                  input,
                  response: exampleResponse(m, year, profile),
                };
              }),
            },
          ]),
        ),
      },
    ]),
  ),
};

/** Synthetic IRS top-income comparison in the shape of scripts/diagnostics/top_tail.json. */
function topTailFixture() {
  // Same layout as the pipeline's manifest: per state code.
  const states = {};
  for (const [code, scale] of [['CO', 1], ['CA', 7.5], ['WA', 1.4]]) {
    const soi = {
      returns: 3_000_000 * scale,
      agi: 3.1e11 * scale,
      returns_500k_1m: 38_000 * scale,
      agi_500k_1m: 2.5e10 * scale,
      returns_1m_plus: 15_600 * scale,
      agi_1m_plus: 4.7e10 * scale,
      agi_above_1m: 3.2e10 * scale,
    };
    const ratio = { returns: 0.93, agi: 1.05, returns_500k_1m: 1.02, agi_500k_1m: 1.1, returns_1m_plus: 2.2, agi_1m_plus: 1.1, agi_above_1m: 0.6 };
    const model = Object.fromEntries(Object.entries(soi).map(([k, v]) => [k, v * ratio[k]]));
    states[code] = { filer_year: 2024, soi_year: 2023, model_filers: model, soi, coverage: ratio, band_scale: {} };
  }
  return states;
}

const manifest = {
  pin: 'synthetic fixture',
  dataset_revision: 'synthetic',
  registry_hash: REGISTRY.registry_hash,
  generated_at_utc: '2026-10-23T00:00:00Z',
  synthetic: true,
  complete: true,
  headline: Object.fromEntries(
    REGISTRY.measures.flatMap((m) =>
      m.years.map((y) => [`${m.slug}:${y}`, { state_budget_impact: PROFILES[m.slug][y].budget }]),
    ),
  ),
  top_tail: topTailFixture(),
  diagnostics: DIAGNOSTICS,
  // Same shape as the pipeline's manifest.
  spm_resources_adjustment: {
    applied: true,
    added_to_spm_resources: ['partnership_s_corp_income', 'farm_rent_income', 'ak_permanent_fund_dividend'],
    not_added: ['debt_relief'],
    description: 'Synthetic fixture.',
  },
};

// ── Write ───────────────────────────────────────────────────────────────

const files = {
  'metrics.csv': csv(['measure', 'year', 'metric', 'value'], metricsRows),
  'distributional_impact.csv': csv(['measure', 'year', 'decile', 'average_change', 'relative_change'], decileRows),
  'winners_losers.csv': csv(
    ['measure', 'year', 'decile', 'gain_more_5pct', 'gain_less_5pct', 'no_change', 'lose_less_5pct', 'lose_more_5pct'],
    wlRows,
  ),
  'income_brackets.csv': csv(
    ['measure', 'year', 'bracket', 'households', 'winners', 'losers', 'total_change', 'average_change', 'state_budget_impact'],
    bracketRows,
  ),
  'congressional_districts.csv': csv(
    [
      'measure',
      'year',
      'district',
      'state',
      'households',
      'average_household_income_change',
      'relative_household_income_change',
      'winners_share',
      'losers_share',
      'state_budget_impact',
    ],
    districtRows,
  ),
  'manifest.json': JSON.stringify(manifest, null, 2) + '\n',
  'example_households.json': JSON.stringify(examples, null, 1) + '\n',
};

for (const dir of OUT_DIRS) {
  if (path.basename(dir) === 'data') throw new Error('Refusing to write synthetic files into public/data/');
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
}
console.log(`Wrote ${Object.keys(files).length} synthetic files to ${OUT_DIRS.map((d) => path.relative(ROOT, d)).join(' and ')}`);
