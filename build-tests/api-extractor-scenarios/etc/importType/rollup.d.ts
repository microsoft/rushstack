/** @ts-ignore */
import { Invalid as Invalid_2 } from 'maybe-invalid-import';
import type { Lib1Class } from 'api-extractor-lib1-test';
import { Lib1Interface } from 'api-extractor-lib1-test';

/** @public */
export declare interface A extends Lib1Class {
}

/** @public */
export declare interface B extends Lib1Interface {
}

/** @public */
export declare interface C extends Lib1Interface {
}

/** @ts-ignore */
declare type Invalid = Invalid_2;

/** @public */
export declare type MaybeImported = [0] extends [1 & Invalid] ? never : Invalid;

export { }
