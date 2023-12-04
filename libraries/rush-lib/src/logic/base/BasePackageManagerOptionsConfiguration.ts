// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Represents the value of an environment variable, and if the value should be overridden if the variable is set
 * in the parent environment.
 * @public
 */
export interface IConfigurationEnvironmentVariable {
  /**
   * Value of the environment variable
   */
  value: string;

  /**
   * Set to true to override the environment variable even if it is set in the parent environment.
   * The default value is false.
   */
  override?: boolean;
}

/**
 * A collection of environment variables
 * @public
 */
export interface IConfigurationEnvironment {
  /**
   * Environment variables
   */
  [environmentVariableName: string]: IConfigurationEnvironmentVariable;
}

/**
 * Options for the package manager.
 * @public
 */
export interface IPackageManagerOptionsJsonBase {
  /**
   * Environment variables for the package manager
   */
  environmentVariables?: IConfigurationEnvironment;
}

/**
 * Options that all package managers share.
 *
 * @public
 */
export abstract class PackageManagerOptionsConfigurationBase implements IPackageManagerOptionsJsonBase {
  /**
   * Environment variables for the package manager
   */
  public readonly environmentVariables?: IConfigurationEnvironment;

  /** @internal */
  protected constructor(json: IPackageManagerOptionsJsonBase) {
    this.environmentVariables = json.environmentVariables;
  }
}
