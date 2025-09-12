import { Lib2Class } from 'api-extractor-lib2-test';

/**
 * Various namespace scenarios.
 * @public
 */
export declare namespace n1 {
    type SomeType1 = number;
    export function someFunction1(): SomeType1;
    export namespace n2 {
        type SomeType2 = number;
        export function someFunction2(): SomeType2;
        export namespace n3 {
            type SomeType3 = number;
            function someFunction3(): n2.n3.SomeType3;
        }
        export {};
    }
    export {};
}

/** @public */
export declare class SomeClass1 {
    static staticProp: number;
}

declare class SomeClass2 {
}

/**
 * Unexported symbol reference.
 * @public
 */
export declare class SomeClass3 extends SomeClass2 {
}

/**
 * Reference to a symbol exported from another file, but not exported from the package.
 * @public
 */
export declare class SomeClass4 extends SomeClass5 {
}

declare class SomeClass5 {
}

/** @public */
export declare enum SomeEnum {
    A = "A",
    B = "B",
    C = "C"
}

/**
 * Enum member reference.
 * @public
 */
export declare function someFunction5(): SomeEnum.A;

/**
 * Static class member reference.
 * @public
 */
export declare function someFunction6(): typeof SomeClass1.staticProp;

/**
 * Global symbol reference.
 * @public
 */
export declare function someFunction7({ then: then2 }: Promise<void>): typeof Date.prototype.getDate;

/**
 * External symbol reference.
 * @public
 */
export declare function someFunction8({ prop: prop2 }: Lib2Class): void;

/**
 * Interface member reference.
 * @public
 */
export declare function someFunction9({ prop: prop2 }: SomeInterface1): void;

/** @public */
export declare interface SomeInterface1 {
    prop: number;
}

/**
 * References to computed properties.
 * @public
 */
export declare interface SomeInterface1 {
    [SomeVar1]: () => string;
    [SomeSymbol1]: () => string;
}

/** @public */
export declare const SomeSymbol1: unique symbol;

/** @public */
export declare const SomeVar1 = "ThisIsSomeVar1";

export { }
