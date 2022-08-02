/** @public */
export declare namespace n1 {
    export type SomeType1 = number;
    export function someFunction1(): SomeType1;
    export namespace n2 {
        export type SomeType2 = number;
        export function someFunction2(): SomeType2;
        export function someFunction3(): n2.SomeType2;
        export namespace n3 {
            export type SomeType3 = number;
            export function someFunction4(): n2.n3.SomeType3;
        }
    }
        {};
}

/** @public */
export declare class SomeClass {
    static staticProp: number;
}

/** @public */
export declare enum SomeEnum {
    A = "A",
    B = "B",
    C = "C"
}

/** @public */
export declare function someFunction5(): SomeEnum.A;

/** @public */
export declare function someFunction6(): typeof SomeClass.staticProp;

export { }
