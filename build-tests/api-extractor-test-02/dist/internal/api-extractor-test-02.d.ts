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
export declare interface GenericInterface<T> {
    member: T;
}

/** @public */
export declare function importDeduping1(arg1: ISimpleInterface, arg2: ISimpleInterface): void;

/** @public */
export declare function importDeduping2(arg1: ISimpleInterface, arg2: ISimpleInterface): void;

/**
 * A class that inherits from a type defined in the "semver" module imported from \@types/semver.
 * @public
 */
export declare class ImportedModuleAsBaseClass extends *.SemVer {
}

/**
 * A generic parameter that references the "semver" module imported from \@types/semver.
 * @public
 */
export declare function importedModuleAsGenericParameter(): GenericInterface<*.SemVer> | undefined;

/**
 * This definition references the "semver" module imported from \@types/semver.
 * @public
 */
export declare function importedModuleAsReturnType(): *.SemVer | undefined;
export { RenamedReexportedClass3 }

/**
 * Example of a class that inherits from an externally imported class.
 * @public
 */
export declare class SubclassWithImport extends RenamedReexportedClass3 implements ISimpleInterface {
    test(): void;
}

export { }
