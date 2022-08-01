/**
 * This type is exported but has the same name as an unexported type in './internal.ts'. This
 * unexported type is also included in the API report and doc model files. The unexported type
 * will be renamed to avoid a name conflict.
 * @public
 */
export declare type DuplicateName = boolean;

/**
 * Will be renamed to avoid a name conflict with the exported `DuplicateName` from
 * index.ts.
 */
declare type DuplicateName_2 = number;

/** This doc comment should be inherited by `ForgottenExport2` */
declare class ForgottenExport1 {
    prop?: ForgottenExport2;
    constructor();
}

/** {@inheritDoc ForgottenExport1} */
declare type ForgottenExport2 = number;

declare namespace ForgottenExport4 {
    class ForgottenExport5 {
    }
}

declare class ForgottenExport6 {
}

declare namespace internal2 {
    export {
        ForgottenExport6
    }
}

/** @public */
export declare function someFunction1(): ForgottenExport1;

/** @public */
export declare function someFunction2(): DuplicateName_2;

/** @public */
export declare function someFunction4(): ForgottenExport4.ForgottenExport5;

/** @public */
export declare function someFunction5(): internal2.ForgottenExport6;

/** @public */
export declare namespace SomeNamespace1 {
    export class ForgottenExport3 {
    }
    export function someFunction3(): ForgottenExport3;
        {};
}

export { }
