// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
/**
 * @public
 */
export interface IModuleResolverOptions {
  /**
   * The path from which `modulePath` should be resolved.
   */
  baseFolderPath: string;

  /**
   * The module identifier to resolve. For example "\@rushstack/node-core-library" or
   * "\@rushstack/node-core-library/lib/index.js"
   */
  modulePath: string;
}

/**
 * @public
 */
export type ModuleResolver = (options: IModuleResolverOptions) => string;
