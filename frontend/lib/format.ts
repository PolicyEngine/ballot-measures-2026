/**
 * Shared number formatters.
 *
 * Intl.NumberFormat places the minus sign before the dollar sign
 * (-$1,593), unlike manual "$" + value concatenation which yields the
 * malformed "$-1,593". Always use these helpers instead of prefixing
 * "$" by hand.
 */

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const usdCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const usdCompactPrecise = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const countCompact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** Normalize -0 (and values that round to zero) to 0. */
const clean = (value: number): number => (value === 0 || Object.is(value, -0) ? 0 : value);

/** "$1,593" / "-$1,593" / "$0" (whole dollars; -0 normalized to $0). */
export const formatUSD = (value: number): string => {
  const rounded = Math.round(value);
  return usd.format(rounded === 0 ? 0 : rounded);
};

/** "+$1,593" / "-$1,593" / "$0" — explicit plus on gains. */
export const formatUSDWithSign = (value: number): string => {
  const formatted = formatUSD(value);
  return Math.round(value) > 0 ? `+${formatted}` : formatted;
};

const usdCompactSig3 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumSignificantDigits: 3,
});

/**
 * Compact dollars for aggregates: "$245.3M", "-$1.2B", "$950".
 * `precise` keeps two decimals ("$1.23B"); `sig3` rounds to three
 * significant digits ("$276M", "$1.43B", "$10.1B"), for model estimates.
 */
export const formatCompactUSD = (
  value: number,
  options: { sign?: boolean; precise?: boolean; sig3?: boolean } = {},
): string => {
  const fmt = options.sig3 ? usdCompactSig3 : options.precise ? usdCompactPrecise : usdCompact;
  const v = Math.abs(value) < 0.5 ? 0 : value;
  const formatted = fmt.format(clean(v));
  return options.sign && v > 0 ? `+${formatted}` : formatted;
};

/** A model estimate in compact dollars, three significant digits. */
export const formatModelUSD = (value: number, options: { sign?: boolean } = {}): string =>
  formatCompactUSD(value, { sig3: true, sign: options.sign });

/** A value already in percent units: 12.34 -> "12.3%". */
export const formatPercent = (
  value: number,
  digits = 1,
  options: { sign?: boolean } = {},
): string => {
  const fixed = Number(value.toFixed(digits));
  const text = `${clean(fixed).toFixed(digits)}%`;
  return options.sign && fixed > 0 ? `+${text}` : text;
};

/** A fraction: 0.1234 -> "12.3%". */
export const formatShare = (
  fraction: number,
  digits = 1,
  options: { sign?: boolean } = {},
): string => formatPercent(fraction * 100, digits, options);

/** Percentage points: -1.23 -> "-1.2 pp". */
export const formatPercentagePoints = (value: number, digits = 1): string => {
  const fixed = Number(value.toFixed(digits));
  const text = `${clean(fixed).toFixed(digits)} pp`;
  return fixed > 0 ? `+${text}` : text;
};

/** Whole count with thousands separators: 12345.6 -> "12,346". */
export const formatCount = (value: number): string => {
  const rounded = Math.round(value);
  return integer.format(rounded === 0 ? 0 : rounded);
};

/** Compact count: 31234 -> "31.2K". */
export const formatCompactCount = (value: number): string =>
  countCompact.format(clean(Math.round(value)));

/** Axis tick for incomes: 50000 -> "$50k", 1500 -> "$1.5k", 1500000 -> "$1.5M",
 *  -400000 -> "-$400k". Below $10k, a tenth of a thousand: gridlines every
 *  $500 would otherwise read "$2k" twice. */
export const formatIncomeTick = (value: number): string => {
  const a = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (a >= 1_000_000) return `${sign}$${Number((a / 1_000_000).toFixed(1))}M`;
  if (a >= 10_000) return `${sign}$${Math.round(a / 1_000)}k`;
  if (a >= 1_000) return `${sign}$${Number((a / 1_000).toFixed(1))}k`;
  return formatUSD(value);
};

/** "$5B to $15B" when low and high differ, else one value. `sig3` rounds
 *  each end to three significant digits (model estimates). */
export const formatUSDRange = (low: number, high: number, precise = true, sig3 = false): string =>
  low === high
    ? formatCompactUSD(low, { precise, sig3 })
    : `${formatCompactUSD(low, { precise, sig3 })} to ${formatCompactUSD(high, { precise, sig3 })}`;

/** "about 30,000" style count range. */
export const formatCountRange = (low: number, high: number): string =>
  low === high ? formatCount(low) : `${formatCount(low)} to ${formatCount(high)}`;

/** "October 23, 2026, 14:32 UTC" from an ISO timestamp; the input when unparseable. */
export const formatTimestamp = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const time = date.toISOString().slice(11, 16);
  return `${day}, ${time} UTC`;
};

/** "November 3, 2026" from an ISO date (UTC, so time zones cannot shift the day). */
export const formatLongDate = (iso: string): string => {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
};
