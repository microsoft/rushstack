// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { builtinModules } from 'node:module';

import { tryParseJsonLean } from './LeanJson';

/**
 * Thrown when the lean implementation cannot guarantee a result identical to the original implementation.
 * Callers catch it and fall back to the original (slower) code path, which produces the canonical result or error.
 */
export class LeanBailError extends Error {}

export function bail(): never {
  throw new LeanBailError();
}

/**
 * Equivalent to `FileSystem.isNotExistError()` from `@rushstack/node-core-library`.
 */
export function isNotExistError(error: unknown): boolean {
  const code: unknown = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/**
 * `stat()` with the error handling of the `resolve` package: missing entries return `undefined`, and any other
 * error bails out.
 */
export function tryStat(filePath: string): fs.Stats | undefined {
  try {
    return fs.statSync(filePath, { throwIfNoEntry: false });
  } catch (e) {
    if (isNotExistError(e)) {
      return undefined;
    }

    bail();
  }
}

function isFileForResolve(filePath: string): boolean {
  const stats: fs.Stats | undefined = tryStat(filePath);
  return !!stats && (stats.isFile() || stats.isFIFO());
}

function isDirectoryForResolve(filePath: string): boolean {
  const stats: fs.Stats | undefined = tryStat(filePath);
  return !!stats && stats.isDirectory();
}

/**
 * Equivalent to `FileSystem.getRealPath()` (which uses fs-extra's `realpathSync`, i.e. the JavaScript
 * implementation of `fs.realpathSync`).
 */
export function getRealPath(linkPath: string): string {
  return fs.realpathSync(linkPath);
}

// The realpath function used by resolve@1.x (`fs.realpathSync.native` except on Windows). A missing file is
// returned unchanged.
const _resolveRealpathSync: (p: string) => string =
  process.platform !== 'win32' && typeof fs.realpathSync.native === 'function'
    ? fs.realpathSync.native
    : fs.realpathSync;

function realpathForResolve(filePath: string): string {
  try {
    return _resolveRealpathSync(filePath);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      bail();
    }

    return filePath;
  }
}

/**
 * Replicates `node-modules-paths` from resolve@1.x (which, unlike Node.js, does not skip `node_modules` folders).
 */
function getNodeModulesPaths(start: string): string[] {
  let prefix: string = '/';
  if (/^([A-Za-z]:)/.test(start)) {
    prefix = '';
  } else if (/^\\\\/.test(start)) {
    prefix = '\\\\';
  }

  const absoluteStart: string = path.resolve(start);
  const paths: string[] = [absoluteStart];
  let parsed: path.ParsedPath = path.parse(absoluteStart);
  while (parsed.dir !== paths[paths.length - 1]) {
    paths.push(parsed.dir);
    parsed = path.parse(parsed.dir);
  }

  return paths.map((aPath: string) => path.resolve(prefix, aPath, 'node_modules'));
}

/**
 * Replicates `resolve.sync(request, { basedir, preserveSymlinks })` from resolve@1.x for a request of the
 * form `<package>/<path to an existing file>`. Bails for anything that would involve extension probing, directory
 * resolution, `package.json` "main" fields, or a missing file.
 */
function resolveNodeModulesFile(request: string, baseFolder: string, preserveSymlinks: boolean = false): string {
  for (const nodeModulesFolder of getNodeModulesPaths(baseFolder)) {
    const candidate: string = path.join(nodeModulesFolder, request);
    if (isDirectoryForResolve(path.dirname(candidate))) {
      if (isFileForResolve(candidate)) {
        return preserveSymlinks ? candidate : realpathForResolve(candidate);
      }

      if (isFileForResolve(`${candidate}.js`) || isDirectoryForResolve(candidate)) {
        // resolve would try harder here
        bail();
      }
    }
  }

  // Not found; let the original implementation produce the error
  bail();
}

const _definitelyValidPackageNameRegExp: RegExp = /^(@[a-z0-9\-_.]+\/)?[A-Za-z0-9\-][A-Za-z0-9\-_.]*$/;

let _builtinModules: Set<string> | undefined;
function isBuiltinModule(moduleName: string): boolean {
  if (!_builtinModules) {
    _builtinModules = new Set(builtinModules);
  }

  return _builtinModules.has(moduleName);
}

/**
 * Equivalent to `RigConfig.getResolvedProfileFolder()` from `@rushstack/rig-package` (which uses
 * `resolve.sync(\`\${rigPackageName}/package.json\`, { basedir: projectFolderPath })`, i.e. with the default
 * `preserveSymlinks: true` of resolve@1.x), without loading the `resolve` package. Bails where the original would
 * throw, or might differ.
 */
export function getRigProfileFolder(rigConfig: {
  readonly rigFound: boolean;
  readonly rigPackageName: string;
  readonly projectFolderPath: string;
  readonly relativeProfileFolderPath: string;
}): string {
  const { rigFound, rigPackageName, projectFolderPath, relativeProfileFolderPath } = rigConfig;
  if (!rigFound || typeof rigPackageName !== 'string' || !_definitelyValidPackageNameRegExp.test(rigPackageName)) {
    bail();
  }

  const rigPackageJsonPath: string = resolveNodeModulesFile(
    `${rigPackageName}/package.json`,
    path.resolve(projectFolderPath),
    true
  );
  const profileFolder: string = path.join(path.dirname(rigPackageJsonPath), relativeProfileFolderPath);
  if (!fs.existsSync(profileFolder)) {
    bail();
  }

  return profileFolder;
}

interface IPackageJsonLike {
  name?: string;
  version?: string;
}

/**
 * Lean equivalent of `PackageJsonLookup` from `@rushstack/node-core-library` with `loadExtraFields: true`
 * (read-only; it does not share the cache of `PackageJsonLookup.instance`). Like the original, loaded package.json
 * objects are frozen and cached by real path.
 */
export class LeanPackageJsonLookup {
  private readonly _packageFolderCache: Map<string, string | undefined> = new Map();
  private readonly _packageJsonCache: Map<string, IPackageJsonLike> = new Map();

  /**
   * Returns the parsed package.json, `undefined` if the file does not exist, or bails if it can't be parsed
   * exactly.
   */
  private _tryLoadPackageJson(packageJsonPath: string): IPackageJsonLike | undefined {
    let realPath: string;
    try {
      realPath = getRealPath(packageJsonPath);
    } catch (e) {
      if (isNotExistError(e)) {
        return undefined;
      }

      bail();
    }

    let packageJson: IPackageJsonLike | undefined = this._packageJsonCache.get(realPath);
    if (!packageJson) {
      let text: string;
      try {
        text = fs.readFileSync(realPath, 'utf8');
      } catch {
        bail();
      }

      const parsed: { value: unknown } | undefined = tryParseJsonLean(text);
      if (!parsed || typeof parsed.value !== 'object' || parsed.value === null) {
        bail();
      }

      packageJson = Object.freeze(parsed.value) as IPackageJsonLike;
      this._packageJsonCache.set(realPath, packageJson);
    }

    return packageJson;
  }

  /**
   * Equivalent to `PackageJsonLookup.tryGetPackageFolderFor()`.
   */
  public tryGetPackageFolderFor(fileOrFolderPath: string): string | undefined {
    const resolvedPath: string = path.resolve(fileOrFolderPath);
    if (this._packageFolderCache.has(resolvedPath)) {
      return this._packageFolderCache.get(resolvedPath);
    }

    const packageJson: IPackageJsonLike | undefined = this._tryLoadPackageJson(`${resolvedPath}/package.json`);
    let result: string | undefined;
    if (packageJson && packageJson.name) {
      result = resolvedPath;
    } else {
      const parentFolder: string = path.dirname(resolvedPath);
      result = !parentFolder || parentFolder === resolvedPath ? undefined : this.tryGetPackageFolderFor(parentFolder);
    }

    this._packageFolderCache.set(resolvedPath, result);
    return result;
  }

  /**
   * Equivalent to `PackageJsonLookup.tryLoadPackageJsonFor()`. Throws the original error if the "version" field is
   * missing; bails for the other conditions in which the original implementation throws.
   */
  public tryLoadPackageJsonFor(fileOrFolderPath: string): IPackageJsonLike | undefined {
    const packageFolder: string | undefined = this.tryGetPackageFolderFor(fileOrFolderPath);
    if (!packageFolder) {
      return undefined;
    }

    const jsonFilename: string = path.join(packageFolder, 'package.json');
    const packageJson: IPackageJsonLike | undefined = this._tryLoadPackageJson(jsonFilename);
    if (!packageJson || !packageJson.name) {
      bail();
    }

    if (!packageJson.version) {
      // The same error as PackageJsonLookup.loadPackageJson()
      throw new Error(`Error reading "${jsonFilename}":\n  The required field "version" was not found`);
    }

    return packageJson;
  }

  /**
   * Equivalent to `PackageJsonLookup.loadPackageJson(path.join(packageFolder, 'package.json'))`, bailing where
   * that would throw.
   */
  public loadPackageJsonForFolder(packageFolder: string): IPackageJsonLike {
    const packageJson: IPackageJsonLike | undefined = this._tryLoadPackageJson(
      path.join(packageFolder, 'package.json')
    );
    if (!packageJson || !packageJson.name || !packageJson.version) {
      bail();
    }

    return packageJson;
  }

  /**
   * Equivalent to `Import.resolvePackage({ packageName, baseFolderPath, allowSelfReference })`.
   */
  public resolvePackage(packageName: string, baseFolderPath: string, allowSelfReference: boolean): string {
    let normalizedRootPath: string;
    try {
      normalizedRootPath = getRealPath(baseFolderPath);
    } catch {
      bail();
    }

    if (allowSelfReference) {
      const ownPackageFolder: string | undefined = this.tryGetPackageFolderFor(normalizedRootPath);
      if (ownPackageFolder) {
        const ownPackageJson: IPackageJsonLike = this.loadPackageJsonForFolder(ownPackageFolder);
        if (ownPackageJson.name === packageName) {
          return path.dirname(path.join(ownPackageFolder, 'package.json'));
        }
      }
    }

    if (
      typeof packageName !== 'string' ||
      packageName.length > 214 ||
      !_definitelyValidPackageNameRegExp.test(packageName) ||
      packageName.split('/').some((segment: string) => segment === '.' || segment === '..')
    ) {
      // Let PackageName.parse() produce the error
      bail();
    }

    return path.dirname(resolveNodeModulesFile(`${packageName}/package.json`, normalizedRootPath));
  }

  /**
   * Equivalent to `Import.resolveModule({ modulePath, baseFolderPath })` / `Import.resolveModuleAsync()` for paths
   * that refer to an existing file.
   */
  public resolveModule(modulePath: string, baseFolderPath: string): string {
    if (typeof modulePath !== 'string') {
      bail();
    }

    if (path.isAbsolute(modulePath)) {
      return modulePath;
    }

    let normalizedRootPath: string;
    try {
      normalizedRootPath = getRealPath(baseFolderPath);
    } catch {
      bail();
    }

    if (modulePath.startsWith('.')) {
      return path.resolve(normalizedRootPath, modulePath);
    }

    const slashIndex: number = modulePath.indexOf('/');
    const moduleName: string = slashIndex === -1 ? modulePath : modulePath.slice(0, slashIndex);
    if (isBuiltinModule(moduleName) || modulePath.indexOf('\\') !== -1 || modulePath.indexOf(':') !== -1) {
      bail();
    }

    return resolveNodeModulesFile(modulePath, normalizedRootPath);
  }
}

let _sharedPackageJsonLookup: LeanPackageJsonLookup | undefined;

/**
 * The lean equivalent of `PackageJsonLookup.instance`: Heft's own package.json lookups share this cache for the
 * lifetime of the process (like the original implementation), so that e.g. watch mode sees the same package.json
 * contents as it did at startup.
 */
export function getSharedLeanPackageJsonLookup(): LeanPackageJsonLookup {
  if (!_sharedPackageJsonLookup) {
    _sharedPackageJsonLookup = new LeanPackageJsonLookup();
  }

  return _sharedPackageJsonLookup;
}
