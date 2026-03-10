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
export interface IYarnOptionsJson extends IPackageManagerOptionsJsonBase {
  /**
   * If true, then Rush will add the "--ignore-engines" option when invoking Yarn.
   * This allows "rush install" to succeed if there are dependencies with engines defined in
   * package.json which do not match the current environment.
   *
   * The default value is false.
   */
  ignoreEngines?: boolean;
}

/**
 * Options that are only used when the yarn package manager is selected.
 *
 * @remarks
 * It is valid to define these options in rush.json even if the yarn package manager
 * is not being used.
 *
 * @public
 */
export class YarnOptionsConfiguration extends PackageManagerOptionsConfigurationBase {
  /**
   * If true, then Rush will add the "--ignore-engines" option when invoking Yarn.
   * This allows "rush install" to succeed if there are dependencies with engines defined in
   * package.json which do not match the current environment.
   *
   * The default value is false.
   */
  public readonly ignoreEngines: boolean;

  /** @internal */
  public constructor(json: IYarnOptionsJson) {
    super(json);
    this.ignoreEngines = !!json.ignoreEngines;
  }
}
