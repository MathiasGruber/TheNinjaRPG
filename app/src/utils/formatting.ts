/**
 * Formats a number as Ryo currency, with commas and the Ryo suffix
 * @param amount The amount to format
 * @returns Formatted string
 */
export function formatRyo(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(amount) + ' Ryo';
}

/**
 * Formats a number with commas
 * @param num The number to format
 * @returns Formatted string
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(num);
}

/**
 * Formats a number as a percentage
 * @param num The number to format
 * @param decimals Number of decimal places
 * @returns Formatted string
 */
export function formatPercent(num: number, decimals = 0): string {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num / 100);
} 