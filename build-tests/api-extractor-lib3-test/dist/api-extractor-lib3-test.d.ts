/**
 * api-extractor-lib3-test
 *
 * @remarks
 * This library is consumed by api-extractor-scenarios.
 *
 * @packageDocumentation
 */

import { Lib1Class } from 'api-extractor-lib1-test';

export { Lib1Class }

/**
 * @internalRemarks Internal remarks
 * @public
 */
export declare class Lib3Class {
    /**
     * I am a documented property!
     * @betaDocumentation My docs include a custom block tag!
     * @virtual @override
     */
    prop: boolean;
}

export { }
