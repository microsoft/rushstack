/** @public */
export declare namespace A {
    class B {
        myMethod(): void;
    }
}

/** @public */
export declare interface A {
    myProperty: string;
}

/**
 * {@link MyNamespace.MyClass.myMethod | the method}
 * @public
 */
export declare function failWithAmbiguity(): void;

/**
 * NOTE: The broken link checker currently is not able to validate references to external packages.
 * Tracked by:  https://github.com/microsoft/rushstack/issues/1195
 * {@link nonexistent#nonexistent}
 * @public
 */
export declare function succeedWithExternalReference(): void;

/**
 * {@link (A:namespace).B.myMethod | the method}
 * {@link (A:interface).myProperty | the property}
 * @public
 */
export declare function succeedWithSelector(): void;

export { }
