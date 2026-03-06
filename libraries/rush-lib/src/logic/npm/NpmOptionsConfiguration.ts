// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  type IPackageManagerOptionsJsonBase,
  PackageManagerOptionsConfigurationBase
} from '../base/BasePackageManagerOptionsConfiguration.ts';

/**
 * Part of IRushConfigurationJson.
 * @internal
 */
export interface INpmOptionsJson extends IPackageManagerOptionsJsonBase {}

/**
 * Options that are only used when the NPM package manager is selected.
 *
 * @remarks
 * It is valid to define these options in rush.json even if the NPM package manager
 * is not being used.
 *
 * @public
 */
export class NpmOptionsConfiguration extends PackageManagerOptionsConfigurationBase {
  /** @internal */
  public constructor(json: INpmOptionsJson) {
    super(json);
  }
}
