/**
 * @alpha
 */
export declare function combine(x: boolean, y: boolean): boolean;

/**
 * @beta
 */
export declare function combine(x: string, y: string): string;

/**
 * @public
 */
export declare function combine(x: number, y: number): number;

/**
 * @beta
 */
export declare function _combine(x: string, y: string): string;

/* Excluded declaration from this release type: _combine */

/**
 * @public
 */
export declare class Combiner {
    /**
     * @alpha
     */
    combine(x: boolean, y: boolean): boolean;
    /**
     * @beta
     */
    combine(x: string, y: string): string;
    /**
     * @public
     */
    combine(x: number, y: number): number;
}

export { }
