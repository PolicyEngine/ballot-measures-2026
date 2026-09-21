/**
 * Shared currency formatters.
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
