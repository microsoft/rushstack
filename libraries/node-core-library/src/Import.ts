// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as nodeJsPath from 'path';
import importLazy = require('import-lazy');
import * as Resolve from 'resolve';

import { PackageJsonLookup } from './PackageJsonLookup';
import { FileSystem } from './FileSystem';

/**
 * @alpha
 */
export interface IResolveOptions {
  doNotResolveSymlinks: boolean;
}

/**
 * Helpers for resolving and importing Node.js modules.
 * @public
 */
export class Import {
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
  public static resolve(path: string, rootPath: string, options?: Partial<IResolveOptions>): string {
    options = {
      doNotResolveSymlinks: false,
      ...options
    };

    if (nodeJsPath.isAbsolute(path)) {
      return path;
    }

    let normalizedRootPath: string = options.doNotResolveSymlinks
      ? rootPath
      : FileSystem.getRealPath(rootPath);

    if (path.startsWith('.')) {
      // This looks like a conventional relative path
      return nodeJsPath.resolve(normalizedRootPath, path);
    }

    normalizedRootPath =
      PackageJsonLookup.instance.tryGetPackageFolderFor(normalizedRootPath) || normalizedRootPath;

    let slashAfterPackageNameIndex: number;
    if (path.startsWith('@')) {
      // This looks like a scoped package name
      slashAfterPackageNameIndex = path.indexOf('/', path.indexOf('/') + 1);
    } else {
      slashAfterPackageNameIndex = path.indexOf('/');
    }

    let packageName: string;
    let pathInsidePackage: string;
    if (slashAfterPackageNameIndex === -1) {
      // This looks like a package name without a path
      packageName = path;
      pathInsidePackage = '';
    } else {
      packageName = path.substr(0, slashAfterPackageNameIndex);
      pathInsidePackage = path.substr(slashAfterPackageNameIndex + 1);
    }

    let resolvedPackagePath: string;
    try {
      resolvedPackagePath = nodeJsPath.dirname(
        Resolve.sync(packageName, {
          basedir: normalizedRootPath,
          packageFilter: (pkg: { main: string }): { main: string } => {
            // In case the "main" property isn't defined, set it to something we know will exist
            pkg.main = 'package.json';
            return pkg;
          }
        })
      );
    } catch (e) {
      // If we fail, see if we're trying to resolve to the current package
      const ownPackageJsonPath: string | undefined = PackageJsonLookup.instance.tryGetPackageJsonFilePathFor(
        normalizedRootPath
      );
      if (
        ownPackageJsonPath &&
        PackageJsonLookup.instance.loadPackageJson(ownPackageJsonPath).name === packageName
      ) {
        resolvedPackagePath = nodeJsPath.dirname(ownPackageJsonPath);
      } else {
        throw e;
      }
    }

    return nodeJsPath.resolve(resolvedPackagePath, pathInsidePackage);
  }
}
