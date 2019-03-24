
/**
 * {@inheritDoc MyNamespace.MyClass.nonExistentMethod}
 * @public
 */
export declare function failWithBrokenLink(): void;

/**
 * {@inheritDoc}
 * @public
 */
export declare function failWithMissingReference(): void;

/**
 * @public
 */
export declare namespace MyNamespace {
    export class MyClass {
        /**
         * Summary for myMethod
         * @remarks
         * Remarks for myMethod
         * @param x - the parameter
         * @returns a number
         * @beta
         */
        myMethod(x: number): number;
    }
}

/**
 * {@inheritDoc MyNamespace.MyClass.myMethod}
 * @privateRemarks
 * The MyClass.myMethod documentation content will get copied,
 * but its `@beta` tag will not get copied.
 * @public
 */
export declare function testSimple(): void;

export { }
