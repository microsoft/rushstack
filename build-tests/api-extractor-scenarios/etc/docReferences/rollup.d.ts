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
    class MyClass {
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
 * {@inheritDoc nonexistent-package#MyNamespace.MyClass.nonExistentMethod}
 *
 * @privateRemarks
 * succeedForNow() should fail due to a broken link, but it's ignored until we fix this issue:
 * https://github.com/microsoft/rushstack/issues/1195
 *
 * @public
 */
export declare function succeedForNow(): void;

/**
 * {@inheritDoc MyNamespace.MyClass.myMethod}
 * @privateRemarks
 * The MyClass.myMethod documentation content will get copied,
 * but its `@beta` tag will not get copied.
 * @public
 */
export declare function testSimple(): void;

export { }
