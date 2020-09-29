
/**
 * A function that references its own parameter type.
 */
export declare function f1(x: number): typeof x;

/**
 * A function that indirectly references its own  parameter type.
 */
export declare function f2(x: number): keyof typeof x;

/**
 * A function that  references its own  type.
 */
export declare function f3(): typeof f3 | undefined;

export { }
