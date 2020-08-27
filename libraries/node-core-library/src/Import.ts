// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import importLazy = require('import-lazy');
import * as Resolve from 'resolve';
import nodeModule = require('module');

import { PackageJsonLookup } from './PackageJsonLookup';
import { FileSystem } from './FileSystem';
import { IPackageJson } from './IPackageJson';

/**
 * Common options shared by {@link IImportResolveModuleOptions} and {@link IImportResolvePackageOptions}
 * @public
 */
export interface IImportResolveOptions {
  /**
   * The path from which {@link IImportResolveModuleOptions.modulePath} or
   * {@link IImportResolvePackageOptions.packageName} should be resolved.
   */
  baseFolderPath: string;

  /**
   * If true, if the package name matches a Node.js system module, then the return
   * value will be the package name without any path.
   *
   * @remarks
   * This will take precedence over an installed NPM package of the same name.
   *
   * Example:
   * ```ts
   * // Returns the string "fs" indicating the Node.js system module
   * Import.resolveModulePath({
   *   resolvePath: "fs",
   *   basePath: process.cwd()
   * })
   * ```
   */
  includeSystemModules?: boolean;

  /**
   * If true, then resolvePath is allowed to refer to the package.json of the active project.
   *
   * @remarks
   * This will take precedence over any installed dependency with the same name.
   * Note that this requires an additional PackageJsonLookup calculation.
   *
   * Example:
   * ```ts
   * // Returns an absolute path to the current package
   * Import.resolveModulePath({
   *   resolvePath: "current-project",
   *   basePath: process.cwd(),
   *   allowSelfReference: true
   * })
   * ```
   */
  allowSelfReference?: boolean;
}

/**
 * Options for {@link Import.resolveModule}
 * @public
 */
export interface IImportResolveModuleOptions extends IImportResolveOptions {
  /**
   * The module identifier to resolve. For example "\@rushstack/node-core-library" or
   * "\@rushstack/node-core-library/lib/index.js"
   */
  modulePath: string;
}

/**
 * Options for {@link Import.resolvePackage}
 * @public
 */
export interface IImportResolvePackageOptions extends IImportResolveOptions {
  /**
   * The package name to resolve. For example "\@rushstack/node-core-library"
   */
  packageName: string;
}

interface IPackageDescriptor {
  packageRootPath: string;
  packageName: string;
}

/**
 * Helpers for resolving and importing Node.js modules.
 * @public
 */
export class Import {
  private static __builtInModules: Set<string> | undefined;
  private static get _builtInModules(): Set<string> {
    if (!Import.__builtInModules) {
      Import.__builtInModules = new Set<string>(nodeModule.builtinModules);
    }

    return Import.__builtInModules;
  }

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
   * This resolves a module path using similar logic as the Node.js `require.resolve()` API,
   * but supporting extra features such as specifying the base folder.
   *
   * @remarks
   * A module path is a text string that might appear in a statement such as
   * `import { X } from "____";` or `const x = require("___");`.  The implementation is based
   * on the popular `resolve` NPM package.
   *
   * Suppose `example` is an NPM package whose entry point is `lib/index.js`:
   * ```ts
   * // Returns "/path/to/project/node_modules/example/lib/index.js"
   * Import.resolveModule({ modulePath: 'example' });
   *
   * // Returns "/path/to/project/node_modules/example/lib/other.js"
   * Import.resolveModule({ modulePath: 'example/lib/other' });
   * ```
   * If you need to determine the containing package folder
   * (`/path/to/project/node_modules/example`), use {@link Import.resolvePackage} instead.
   *
   * @returns the absolute path of the resolved module.
   * If {@link IImportResolveOptions.includeSystemModules} is specified
   * and a system module is found, then its name is returned without any file path.
   */
  public static resolveModule(options: IImportResolveModuleOptions): string {
    const { modulePath } = options;

    if (path.isAbsolute(modulePath)) {
      return modulePath;
    }

    const normalizedRootPath: string = FileSystem.getRealPath(options.baseFolderPath);

    if (modulePath.startsWith('.')) {
      // This looks like a conventional relative path
      return path.resolve(normalizedRootPath, modulePath);
    }

    if (options.includeSystemModules === true && Import._builtInModules.has(modulePath)) {
      return modulePath;
    }

    if (options.allowSelfReference === true) {
      const ownPackage: IPackageDescriptor | undefined = Import._getPackageName(options.baseFolderPath);
      if (ownPackage && modulePath.startsWith(ownPackage.packageName)) {
        const packagePath: string = modulePath.substr(ownPackage.packageName.length + 1);
        return path.resolve(ownPackage.packageRootPath, packagePath);
      }
    }

    try {
      return Resolve.sync(
        // Append a slash to the package name to ensure `resolve.sync` doesn't attempt to return a system package
        options.includeSystemModules !== true && modulePath.indexOf('/') === -1
          ? `${modulePath}/`
          : modulePath,
        {
          basedir: normalizedRootPath,
          preserveSymlinks: false
        }
      );
    } catch (e) {
      throw new Error(`Cannot find module "${modulePath}" from "${options.baseFolderPath}".`);
    }
  }

  /**
   * Performs module resolution to determine the folder where a package is installed.
   *
   * @remarks
   * Suppose `example` is an NPM package whose entry point is `lib/index.js`:
   * ```ts
   * // Returns "/path/to/project/node_modules/example"
   * Import.resolvePackage({ packageName: 'example' });
   * ```
   *
   * If you need to resolve a module path, use {@link Import.resolveModule} instead:
   * ```ts
   * // Returns "/path/to/project/node_modules/example/lib/index.js"
   * Import.resolveModule({ modulePath: 'example' });
   * ```
   *
   * @returns the absolute path of the package folder.
   * If {@link IImportResolveOptions.includeSystemModules} is specified
   * and a system module is found, then its name is returned without any file path.
   */
  public static resolvePackage(options: IImportResolvePackageOptions): string {
    const { packageName } = options;

    if (options.includeSystemModules && Import._builtInModules.has(packageName)) {
      return packageName;
    }

    const normalizedRootPath: string = FileSystem.getRealPath(options.baseFolderPath);

    if (options.allowSelfReference) {
      const ownPackage: IPackageDescriptor | undefined = Import._getPackageName(options.baseFolderPath);
      if (ownPackage && ownPackage.packageName === packageName) {
        return ownPackage.packageRootPath;
      }
    }

    try {
      const resolvedPath: string = Resolve.sync(packageName, {
        basedir: normalizedRootPath,
        preserveSymlinks: false,
        packageFilter: (pkg: { main: string }): { main: string } => {
          // Hardwire "main" to point to a file that is guaranteed to exist.
          // This helps resolve packages such as @types/node that have no entry point.
          // And then we can use path.dirname() below to locate the package folder,
          // even if the real entry point was in an subfolder with arbitrary nesting.
          pkg.main = 'package.json';
          return pkg;
        }
      });

      const packagePath: string = path.dirname(resolvedPath);
      const packageJson: IPackageJson = PackageJsonLookup.instance.loadPackageJson(
        path.join(packagePath, 'package.json')
      );
      if (packageJson.name === packageName) {
        return packagePath;
      } else {
        throw new Error();
      }
    } catch (e) {
      throw new Error(`Cannot find package "${packageName}" from "${options.baseFolderPath}".`);
    }
  }

  private static _getPackageName(rootPath: string): IPackageDescriptor | undefined {
    const packageJsonPath: string | undefined = PackageJsonLookup.instance.tryGetPackageJsonFilePathFor(
      rootPath
    );
    if (packageJsonPath) {
      const packageJson: IPackageJson = PackageJsonLookup.instance.loadPackageJson(packageJsonPath);
      return {
        packageRootPath: path.dirname(packageJsonPath),
        packageName: packageJson.name
      };
    } else {
      return undefined;
    }
  }
}
