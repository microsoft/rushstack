// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as nodeJsPath from 'path';
import importLazy = require('import-lazy');
import * as Resolve from 'resolve';
import nodeModule = require('module');

import { PackageJsonLookup } from './PackageJsonLookup';
import { FileSystem } from './FileSystem';

/**
 * @public
 */
export interface IImportResolveOptions {
  /**
   * The path to resolve.
   */
  resolvePath: string;

  /**
   * The path from which {@link IImportResolveOptions.resolvePath} should be resolved
   */
  baseFolderPath: string;

  /**
   * If true, if the package name matches a Node.js system module, then the return
   * value will be the package name without any path.  This will take precedence over
   * an installed NPM package of the same name.
   *
   * Example:
   * `Import.resolveModulePath({ resolvePath: "fs", basePath: process.cwd() })`
   *  --\> "fs"
   */
  includeSystemModules?: boolean;

  /**
   * If true, then resolvePath is allowed to refer to the package.json of the active project.
   * It will take precedence over any installed dependency with the same name.
   * Note that this requires an additional PackageJsonLookup calculation.
   *
   * Example:
   * `Import.resolveModulePath({ resolvePath: "my-project", basePath: process.cwd(), allowSelfReference: true })`
   *  --\> "path/to/my-project"
   */
  allowSelfReference?: boolean;
}

/**
 * Helpers for resolving and importing Node.js modules.
 * @public
 */
export class Import {
  private static _builtInModules: Set<string> | undefined;

  /**
   * Provides a way to improve process startup times by lazy-loading imported modules.
   *
   * @remarks
   * This is a more structured wrapper for the {@link https://www.npmjs.com/package/import-lazy|import-lazy}
   * package.  It enables you to replace an import like this:
   *
   * ```ts
   * import * as example from 'example'; // <-- 100ms load time
   *
   * if (condition) {
   *   example.doSomething();
   * }
   * ```
   *
   * ...with a pattern like this:
   *
   * ```ts
   * const example: typeof import('example') = Import.lazy('example', require);
   *
   * if (condition) {
   *   example.doSomething(); // <-- 100ms load time occurs here, only if needed
   * }
   * ```
   *
   * The implementation relies on JavaScript's `Proxy` feature to intercept access to object members.  Thus
   * it will only work correctly with certain types of module exports.  If a particular export isn't well behaved,
   * you may need to find (or introduce) some other module in your dependency graph to apply the optimization to.
   *
   * Usage guidelines:
   *
   * - Always specify types using `typeof` as shown above.
   *
   * - Never apply lazy-loading in a way that would convert the module's type to `any`. Losing type safety
   *   seriously impacts the maintainability of the code base.
   *
   * - In cases where the non-runtime types are needed, import them separately using the `Types` suffix:
   *
   * ```ts
   * const example: typeof import('example') = Import.lazy('example', require);
   * import type * as exampleTypes from 'example';
   * ```
   *
   * - If the imported module confusingly has the same name as its export, then use the Module suffix:
   *
   * ```ts
   * const exampleModule: typeof import('../../logic/Example') = Import.lazy(
   *   '../../logic/Example', require);
   * import type * as exampleTypes from '../../logic/Example';
   * ```
   *
   * - If the exports cause a lot of awkwardness (e.g. too many expressions need to have `exampleModule.` inserted
   *   into them), or if some exports cannot be proxied (e.g. `Import.lazy('example', require)` returns a function
   *   signature), then do not lazy-load that module.  Instead, apply lazy-loading to some other module which is
   *   better behaved.
   *
   * - It's recommended to sort imports in a standard ordering:
   *
   * ```ts
   * // 1. external imports
   * import * as path from 'path';
   * import { Import, JsonFile, JsonObject } from '@rushstack/node-core-library';
   *
   * // 2. local imports
   * import { LocalFile } from './path/LocalFile';
   *
   * // 3. lazy-imports (which are technically variables, not imports)
   * const semver: typeof import('semver') = Import.lazy('semver', require);
   * ```
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public static lazy(moduleName: string, require: (id: string) => unknown): any {
    const importLazyLocal: (moduleName: string) => unknown = importLazy(require);
    return importLazyLocal(moduleName);
  }

  /**
   * Resolves a path in a package, relative to another path.
   */
  public static resolve(options: IImportResolveOptions): string {
    const { resolvePath } = options;

    if (nodeJsPath.isAbsolute(resolvePath)) {
      return resolvePath;
    }

    let normalizedRootPath: string = FileSystem.getRealPath(options.baseFolderPath);

    if (resolvePath.startsWith('.')) {
      // This looks like a conventional relative path
      return nodeJsPath.resolve(normalizedRootPath, resolvePath);
    }

    normalizedRootPath =
      PackageJsonLookup.instance.tryGetPackageFolderFor(normalizedRootPath) || normalizedRootPath;

    let slashAfterPackageNameIndex: number;
    if (resolvePath.startsWith('@')) {
      // This looks like a scoped package name
      slashAfterPackageNameIndex = resolvePath.indexOf('/', resolvePath.indexOf('/') + 1);
    } else {
      slashAfterPackageNameIndex = resolvePath.indexOf('/');
    }

    let packageName: string;
    let pathInsidePackage: string | undefined;
    if (slashAfterPackageNameIndex === -1) {
      // This looks like a package name without a path
      packageName = resolvePath;
    } else {
      packageName = resolvePath.substr(0, slashAfterPackageNameIndex);
      pathInsidePackage = resolvePath.substr(slashAfterPackageNameIndex + 1);
    }

    if (options.includeSystemModules === true) {
      if (!Import._builtInModules) {
        Import._builtInModules = new Set<string>(nodeModule.builtinModules);
      }

      // First, check resolvePath because some built-in modules have more than one slash in their name
      if (Import._builtInModules.has(resolvePath)) {
        return resolvePath;
      } else if (Import._builtInModules.has(packageName)) {
        if (pathInsidePackage !== undefined) {
          throw new Error(
            `The package name "${packageName}" resolved to a NodeJS system module, but the ` +
              `path to resolve ("${resolvePath}") contains a path inside the system module, which is not allowed.`
          );
        }

        return packageName;
      }
    }

    let resolvedPackagePath: string | undefined;
    if (options.allowSelfReference === true) {
      // See if we're trying to resolve to the current package
      const ownPackageJsonPath: string | undefined = PackageJsonLookup.instance.tryGetPackageJsonFilePathFor(
        normalizedRootPath
      );
      if (
        ownPackageJsonPath &&
        PackageJsonLookup.instance.loadPackageJson(ownPackageJsonPath).name === packageName
      ) {
        resolvedPackagePath = nodeJsPath.dirname(ownPackageJsonPath);
      }
    }

    if (!resolvedPackagePath) {
      try {
        resolvedPackagePath = nodeJsPath.dirname(
          Resolve.sync(
            // Append a slash to the package name to ensure `resolve.sync` doesn't attempt to return a system package
            `${packageName}/`,
            {
              basedir: normalizedRootPath,
              preserveSymlinks: false,
              packageFilter: (pkg: { main: string }): { main: string } => {
                // In case the "main" property isn't defined, set it to something we know will exist
                pkg.main = 'package.json';
                return pkg;
              }
            }
          )
        );
      } catch (e) {
        throw new Error(`Cannot find module "${packageName}" from "${normalizedRootPath}".`);
      }
    }

    if (pathInsidePackage) {
      return nodeJsPath.resolve(resolvedPackagePath, pathInsidePackage);
    } else {
      return resolvedPackagePath;
    }
  }
}
