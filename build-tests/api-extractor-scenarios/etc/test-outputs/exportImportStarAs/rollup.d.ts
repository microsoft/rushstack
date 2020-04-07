
/**
 * Returns the sum of adding b to a
 * @param a - first number
 * @param b - second number
 * @returns Sum of adding b to a
 */
declare function add(a: number, b: number): number;

declare namespace calculator {
  export {
    add,
    subtract,
  }
}
export { calculator }

/**
 * Returns the sum of subtracting b from a
 * @param a - first number
 * @param b - second number
 * @returns Sum of subtract b from a
 */
declare function subtract(a: number, b: number): number;

export { }
