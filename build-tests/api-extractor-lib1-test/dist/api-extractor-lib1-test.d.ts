/**
 * api-extractor-lib1-test
 *
 * @remarks
 * This library is consumed by api-extractor-scenarios.
 *
 * @packageDocumentation
 */

/** @public */
export declare class Lib1Class extends Lib1ForgottenExport {
    readonly readonlyProperty: string;
    writeableProperty: string;
}

declare class Lib1ForgottenExport {
}

/** @public */
export declare type Lib1GenericType<T1, T2> = {
    one: T1;
    two: T2;
};

/** @alpha */
export declare interface Lib1Interface {
}

/** @public */
export declare namespace Lib1Namespace {
    namespace Inner {
        class X {
        }
    }
    class Y {
    }
}

export { }
