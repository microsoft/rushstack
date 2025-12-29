/**
 * This forgotten item has the same name as another forgotten item in another
 * file. They should be given unique names.
 * @public
 */
declare class AnotherDuplicateName {
}

/** @public */
declare class AnotherDuplicateName_2 {
}

/**
 * This type is exported but has the same name as a forgotten type in './internal.ts'. This
 * forgotten type is also included in the API report and doc model files. The forgotten type
 * will be renamed to avoid a name conflict.
 * @public
 */
export declare type DuplicateName = boolean;

/**
 * Will be renamed to avoid a name conflict with the exported `DuplicateName` from
 * index.ts.
 * @public
 */
declare type DuplicateName_2 = number;

/**
 * `ForgottenExport2` wants to inherit this doc comment, but unfortunately this isn't
 * supported yet
 * @public
 */
declare class ForgottenExport1 {
    prop?: ForgottenExport2;
    constructor();
}

/**
 * @public
 * {@inheritDoc ForgottenExport1}
 */
declare type ForgottenExport2 = number;

/** @public */
declare namespace ForgottenExport4 {
    class ForgottenExport5 {
    }
}

/** @public */
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
export declare function someFunction6(): AnotherDuplicateName;

/** @public */
export declare function someFunction7(): AnotherDuplicateName_2;

/** @public */
export declare namespace SomeNamespace1 {
    class ForgottenExport3 {
    }
    export function someFunction3(): ForgottenExport3;
    export {};
}

export { }
