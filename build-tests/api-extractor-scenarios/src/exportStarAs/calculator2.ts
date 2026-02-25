/**
 * Returns the sum of adding `b` to `a` for large integers
 * @param a - first number
 * @param b - second number
 * @returns Sum of adding `b` to `a`
 * @public
 */
export function add(a: bigint, b: bigint): bigint {
  return a + b;
}

/**
 * Returns the sum of subtracting `b` from `a` for large integers
 * @param a - first number
 * @param b - second number
 * @returns Sum of subtract `b` from `a`
 * @beta
 */
export function subtract(a: bigint, b: bigint): bigint {
  return a - b;
}

export * from './common.ts';
