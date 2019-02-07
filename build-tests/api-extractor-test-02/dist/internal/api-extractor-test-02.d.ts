/**
 * api-extractor-test-02
 *
 * @remarks
 * This library consumes api-extractor-test-01 and is consumed by api-extractor-test-03.
 *
 * @packagedocumentation
 */

import * as * from 'semver';
import { ISimpleInterface } from 'api-extractor-test-01';
import { ReexportedClass as RenamedReexportedClass3 } from 'api-extractor-test-01';

/**
 * An interface with a generic parameter.
 * @public
 */
export declare interface GenericInterface/*R=FIX*/<T/*R=KEEP*/> {
    member/*R=KEEP*/: T/*R=KEEP*/;
}

/** @public */
export declare function importDeduping1/*R=FIX*/(arg1/*R=KEEP*/: ISimpleInterface/*R=KEEP*/, arg2/*R=KEEP*/: ISimpleInterface2/*R=KEEP*/): void;

/** @public */
export declare function importDeduping2/*R=FIX*/(arg1/*R=KEEP*/: ISimpleInterface/*R=KEEP*/, arg2/*R=KEEP*/: ISimpleInterface2/*R=KEEP*/): void;

/**
 * A class that inherits from a type defined in the "semver" module imported from \@types/semver.
 * @public
 */
export declare class ImportedModuleAsBaseClass/*R=FIX*/ extends semver3/*R=KEEP*/.SemVer/*R=KEEP*/ {
}

/**
 * A generic parameter that references the "semver" module imported from \@types/semver.
 * @public
 */
export declare function importedModuleAsGenericParameter/*R=FIX*/(): GenericInterface/*R=FIX*/<semver2/*R=KEEP*/.SemVer/*R=KEEP*/> | undefined;

/**
 * This definition references the "semver" module imported from \@types/semver.
 * @public
 */
export declare function importedModuleAsReturnType/*R=FIX*/(): semver1/*R=KEEP*/.SemVer/*R=KEEP*/ | undefined;
export { RenamedReexportedClass3 }

/**
 * Example of a class that inherits from an externally imported class.
 * @public
 */
export declare class SubclassWithImport/*R=FIX*/ extends RenamedReexportedClass/*R=KEEP*/ implements ISimpleInterface/*R=KEEP*/ {
    test/*R=KEEP*/(): void;
}

export { }
