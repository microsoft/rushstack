// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as semver1 from 'semver';
import * as semver2 from 'semver';
import * as semver3 from 'semver';

/**
 * This definition references the "semver" module imported from \@types/semver.
 * @public
 */
export function importedModuleAsReturnType(): semver1.SemVer | undefined {
  return undefined;
}

/**
 * An interface with a generic parameter.
 * @public
 */
export interface GenericInterface<T> {
  member: T;
}

/**
 * A generic parameter that references the "semver" module imported from \@types/semver.
 * @public
 */
export function importedModuleAsGenericParameter(): GenericInterface<semver2.SemVer> | undefined {
  return undefined;
}

/**
 * A class that inherits from a type defined in the "semver" module imported from \@types/semver.
 * @public
 */
export class ImportedModuleAsBaseClass extends semver3.SemVer {
}
