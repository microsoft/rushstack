import { Lib2Class } from 'api-extractor-lib2-test';

/**
 * Various namespace scenarios.
 * @public
 */
export declare namespace n1 {
    export type SomeType1 = number;
    export function someFunction1(): SomeType1;
    export namespace n2 {
        export type SomeType2 = number;
        export function someFunction2(): SomeType2;
        export namespace n3 {
            export type SomeType3 = number;
            export function someFunction3(): n2.n3.SomeType3;
        }
            {};
    }
        {};
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
export declare function someFunction7(): Promise<void>;

/**
 * External symbol reference.
 * @public
 */
export declare function someFunction8(): Lib2Class;

export { }
