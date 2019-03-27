
/** @public */
export declare namespace A {
    export class B {
        myMethod(): void;
    }
}

export declare interface A {
    myProperty: string;
}

/**
 * {@link MyNamespace.MyClass.myMethod | the method}
 * @public
 */
export declare function failWithAmbiguity(): void;

/**
 * {@link (A:namespace).B.myMethod | the method}
 * {@link (A:interface).myProperty | the property}
 * @public
 */
export declare function success(): void;

export { }
