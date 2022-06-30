/** @public */
export declare class MyClass {
    get _onlyGetter(): string;
    readonly readonlyModifier: string;
    /** @readonly */
    tsDocReadonly: string;
}

/** @public */
export declare interface MyInterface {
    get _onlyGetter(): string;
    readonly readonlyModifier: string;
    /** @readonly */
    set tsDocReadonly(value: string);
    readonly [x: number]: void;
}

/** @public */
export declare const READONLY_VARIABLE = "Hello world!";

/**
 * @public
 * @readonly
 */
export declare let TSDOC_READONLY_VARIABLE: string;

export { }
