// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import importLazy = require('import-lazy');
import * as Resolve from 'resolve';
import nodeModule = require('module');

import { PackageJsonLookup } from './PackageJsonLookup';
import { FileSystem } from './FileSystem';
import type { IPackageJson } from './IPackageJson';
import { PackageName } from './PackageName';

type RealpathFnType = Parameters<typeof Resolve.default>[1]['realpath'];

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

  /**
   * A function used to resolve the realpath of a provided file path.
   *
   * @remarks
   * This is used to resolve symlinks and other non-standard file paths. By default, this uses the
   * {@link FileSystem.getRealPath} function. However, it can be overridden to use a custom implementation
   * which may be faster, more accurate, or provide support for additional non-standard file paths.
   */
  getRealPath?: (filePath: string) => string;
}

/**
 * Common options shared by {@link IImportResolveModuleAsyncOptions} and {@link IImportResolvePackageAsyncOptions}
 * @public
 */
export interface IImportResolveAsyncOptions extends IImportResolveOptions {
  /**
   * A function used to resolve the realpath of a provided file path.
   *
   * @remarks
   * This is used to resolve symlinks and other non-standard file paths. By default, this uses the
   * {@link FileSystem.getRealPath} function. However, it can be overridden to use a custom implementation
   * which may be faster, more accurate, or provide support for additional non-standard file paths.
   */
  getRealPathAsync?: (filePath: string) => Promise<string>;
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
 * Options for {@link Import.resolveModuleAsync}
 * @public
 */
export interface IImportResolveModuleAsyncOptions extends IImportResolveAsyncOptions {
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

  /**
   * If true, then the module path will be resolved using Node.js's built-in resolution algorithm.
   *
   * @remarks
   * This allows reusing Node's built-in resolver cache.
   * This implies `allowSelfReference: true`. The passed `getRealPath` will only be used on `baseFolderPath`.
   */
  useNodeJSResolver?: boolean;
}

/**
 * Options for {@link Import.resolvePackageAsync}
 * @public
 */
export interface IImportResolvePackageAsyncOptions extends IImportResolveAsyncOptions {
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
    const { modulePath, baseFolderPath, includeSystemModules, allowSelfReference, getRealPath } = options;

    if (path.isAbsolute(modulePath)) {
      return modulePath;
    }

    const normalizedRootPath: string = (getRealPath || FileSystem.getRealPath)(baseFolderPath);

    if (modulePath.startsWith('.')) {
      // This looks like a conventional relative path
      return path.resolve(normalizedRootPath, modulePath);
    }

    // Built-in modules do not have a scope, so if there is a slash, then we need to check
    // against the first path segment
    const slashIndex: number = modulePath.indexOf('/');
    const moduleName: string = slashIndex === -1 ? modulePath : modulePath.slice(0, slashIndex);
    if (!includeSystemModules && Import._builtInModules.has(moduleName)) {
      throw new Error(`Cannot find module "${modulePath}" from "${options.baseFolderPath}".`);
    }

    if (allowSelfReference === true) {
      const ownPackage: IPackageDescriptor | undefined = Import._getPackageName(normalizedRootPath);
      if (
        ownPackage &&
        (modulePath === ownPackage.packageName || modulePath.startsWith(`${ownPackage.packageName}/`))
      ) {
        const packagePath: string = modulePath.slice(ownPackage.packageName.length + 1);
        return path.resolve(ownPackage.packageRootPath, packagePath);
      }
    }

    try {
      return Resolve.sync(modulePath, {
        basedir: normalizedRootPath,
        preserveSymlinks: false,
        realpathSync: getRealPath
      });
    } catch (e: unknown) {
      throw new Error(`Cannot find module "${modulePath}" from "${options.baseFolderPath}": ${e}`);
    }
  }

  /**
   * Async version of {@link Import.resolveModule}.
   */
  public static async resolveModuleAsync(options: IImportResolveModuleAsyncOptions): Promise<string> {
    const {
      modulePath,
      baseFolderPath,
      includeSystemModules,
      allowSelfReference,
      getRealPath,
      getRealPathAsync
    } = options;

    if (path.isAbsolute(modulePath)) {
      return modulePath;
    }

    const normalizedRootPath: string = await (getRealPathAsync || getRealPath || FileSystem.getRealPathAsync)(
      baseFolderPath
    );

    if (modulePath.startsWith('.')) {
      // This looks like a conventional relative path
      return path.resolve(normalizedRootPath, modulePath);
    }

    // Built-in modules do not have a scope, so if there is a slash, then we need to check
    // against the first path segment
    const slashIndex: number = modulePath.indexOf('/');
    const moduleName: string = slashIndex === -1 ? modulePath : modulePath.slice(0, slashIndex);
    if (!includeSystemModules && Import._builtInModules.has(moduleName)) {
      throw new Error(`Cannot find module "${modulePath}" from "${options.baseFolderPath}".`);
    }

    if (allowSelfReference === true) {
      const ownPackage: IPackageDescriptor | undefined = Import._getPackageName(normalizedRootPath);
      if (
        ownPackage &&
        (modulePath === ownPackage.packageName || modulePath.startsWith(`${ownPackage.packageName}/`))
      ) {
        const packagePath: string = modulePath.slice(ownPackage.packageName.length + 1);
        return path.resolve(ownPackage.packageRootPath, packagePath);
      }
    }

    try {
      const resolvePromise: Promise<string> = new Promise(
        (resolve: (resolvedPath: string) => void, reject: (error: Error) => void) => {
          const realPathFn: RealpathFnType =
            getRealPathAsync || getRealPath
              ? (filePath: string, callback: (error: Error | null, resolvedPath?: string) => void) => {
                  if (getRealPathAsync) {
                    getRealPathAsync(filePath)
                      .then((resolvedPath) => callback(null, resolvedPath))
                      .catch((error) => callback(error));
                  } else {
                    try {
                      const resolvedPath: string = getRealPath!(filePath);
                      callback(null, resolvedPath);
                    } catch (error: unknown) {
                      callback(error as Error);
                    }
                  }
                }
              : undefined;

          Resolve.default(
            modulePath,
            {
              basedir: normalizedRootPath,
              preserveSymlinks: false,
              realpath: realPathFn
            },
            (error: Error | null, resolvedPath?: string) => {
              if (error) {
                reject(error);
              } else {
                // Resolve docs state that either an error will be returned, or the resolved path.
                // In this case, the resolved path should always be populated.
                resolve(resolvedPath!);
              }
            }
          );
        }
      );
      return await resolvePromise;
    } catch (e: unknown) {
      throw new Error(`Cannot find module "${modulePath}" from "${options.baseFolderPath}": ${e}`);
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
    const {
      packageName,
      includeSystemModules,
      baseFolderPath,
      allowSelfReference,
      getRealPath,
      useNodeJSResolver
    } = options;

    if (includeSystemModules && Import._builtInModules.has(packageName)) {
      return packageName;
    }

    const normalizedRootPath: string = (getRealPath || FileSystem.getRealPath)(baseFolderPath);

    if (allowSelfReference) {
      const ownPackage: IPackageDescriptor | undefined = Import._getPackageName(normalizedRootPath);
      if (ownPackage && ownPackage.packageName === packageName) {
        return ownPackage.packageRootPath;
      }
    }

    PackageName.parse(packageName); // Ensure the package name is valid and doesn't contain a path

    try {
      const resolvedPath: string = useNodeJSResolver
        ? require.resolve(`${packageName}/package.json`, {
            paths: [normalizedRootPath]
          })
        : // Append `/package.json` to ensure `resolve.sync` doesn't attempt to return a system package, and to avoid
          // having to mess with the `packageFilter` option.
          Resolve.sync(`${packageName}/package.json`, {
            basedir: normalizedRootPath,
            preserveSymlinks: false,
            realpathSync: getRealPath
          });

      const packagePath: string = path.dirname(resolvedPath);
      return packagePath;
    } catch (e: unknown) {
      throw new Error(`Cannot find package "${packageName}" from "${baseFolderPath}": ${e}.`);
    }
  }

  /**
   * Async version of {@link Import.resolvePackage}.
   */
  public static async resolvePackageAsync(options: IImportResolvePackageAsyncOptions): Promise<string> {
    const {
      packageName,
      includeSystemModules,
      baseFolderPath,
      allowSelfReference,
      getRealPath,
      getRealPathAsync
    } = options;

    if (includeSystemModules && Import._builtInModules.has(packageName)) {
      return packageName;
    }

    const normalizedRootPath: string = await (getRealPathAsync || getRealPath || FileSystem.getRealPathAsync)(
      baseFolderPath
    );

    if (allowSelfReference) {
      const ownPackage: IPackageDescriptor | undefined = Import._getPackageName(normalizedRootPath);
      if (ownPackage && ownPackage.packageName === packageName) {
        return ownPackage.packageRootPath;
      }
    }

    PackageName.parse(packageName); // Ensure the package name is valid and doesn't contain a path

    try {
      const resolvePromise: Promise<string> = new Promise(
        (resolve: (resolvedPath: string) => void, reject: (error: Error) => void) => {
          const realPathFn: RealpathFnType =
            getRealPathAsync || getRealPath
              ? (filePath: string, callback: (error: Error | null, resolvedPath?: string) => void) => {
                  if (getRealPathAsync) {
                    getRealPathAsync(filePath)
                      .then((resolvedPath) => callback(null, resolvedPath))
                      .catch((error) => callback(error));
                  } else {
                    try {
                      const resolvedPath: string = getRealPath!(filePath);
                      callback(null, resolvedPath);
                    } catch (error: unknown) {
                      callback(error as Error);
                    }
                  }
                }
              : undefined;

          Resolve.default(
            // Append `/package.json` to ensure `resolve` doesn't attempt to return a system package, and to avoid
            // having to mess with the `packageFilter` option.
            `${packageName}/package.json`,
            {
              basedir: normalizedRootPath,
              preserveSymlinks: false,
              realpath: realPathFn
            },
            (error: Error | null, resolvedPath?: string) => {
              if (error) {
                reject(error);
              } else {
                // Resolve docs state that either an error will be returned, or the resolved path.
                // In this case, the resolved path should always be populated.
                resolve(resolvedPath!);
              }
            }
          );
        }
      );
      const resolvedPath: string = await resolvePromise;

      const packagePath: string = path.dirname(resolvedPath);
      return packagePath;
    } catch (e: unknown) {
      throw new Error(`Cannot find package "${packageName}" from "${baseFolderPath}": ${e}`);
    }
  }

  private static _getPackageName(rootPath: string): IPackageDescriptor | undefined {
    const packageJsonPath: string | undefined =
      PackageJsonLookup.instance.tryGetPackageJsonFilePathFor(rootPath);
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
