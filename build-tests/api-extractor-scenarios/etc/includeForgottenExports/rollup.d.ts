/** {@inheritDoc ForgottenExport} */
declare type AnotherForgottenExport = number;

/** @public */
export declare function anotherFunction(): DuplicateName_2;

/**
 * This type is exported but has the same name as an unexported type in './internal.ts'. This
 * unexported type is also included in the API report and doc model files. The unexported type
 * will be renamed to avoid a name conflict.
 * @public
 */
export declare type DuplicateName = boolean;

declare type DuplicateName_2 = number;

/** This doc comment should be inherited by `AnotherForgottenExport` */
declare class ForgottenExport {
    prop?: AnotherForgottenExport;
    constructor();
}

/** @public */
export declare function someFunction(): ForgottenExport;

export { }
