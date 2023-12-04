import { Lib1Class } from 'api-extractor-lib1-test';

/**
 * Reference Lib1Class via "typeof"
 * @public
 */
export declare function f(): typeof Lib1Class | undefined;

declare class ForgottenExport {
}

/**
 * Reference IForgottenExport via "typeof"
 * @public
 */
export declare function g(): typeof ForgottenExport | undefined;

export { }
