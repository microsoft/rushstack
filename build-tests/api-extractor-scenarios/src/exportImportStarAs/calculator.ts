/**
 * Returns the sum of adding `b` to `a`
 * @param a - first number
 * @param b - second number
 * @returns Sum of adding `b` to `a`
 * @public
 */
export function add(a: number, b: number): number {
  return a + b;
}

/**
 * Returns the sum of subtracting `b` from `a`
 * @param a - first number
 * @param b - second number
 * @returns Sum of subtract `b` from `a`
 * @beta
 */
export function subtract(a: number, b: number): number {
  return a - b;
}

export * from './common.ts';
