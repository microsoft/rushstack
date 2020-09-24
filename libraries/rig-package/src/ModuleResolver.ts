// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Options for {@link ModuleResolver}
 *
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
 * A function that implements Node.js module resolution.
 * Used with {@link ILoadForProjectFolderOptions.moduleResolver}.
 *
 * @remarks
 *
 * Here is an example implementation using the {@link https://www.npmjs.com/package/resolve | resolve} library:
 *
 * ```
 * import * as resolve from 'resolve';
 *
 * const rigConfig: RigConfig = RigConfig.loadForProjectFolder({
 *   packageJsonFolderPath: '/path/to/your-project',
 *
 *   moduleResolver: (options: IModuleResolverOptions): string => {
 *     return resolve.sync(options.modulePath, { basedir: options.baseFolderPath });
 *   }
 * });
 * ```
 *
 * @public
 */
export type ModuleResolver = (options: IModuleResolverOptions) => string;
