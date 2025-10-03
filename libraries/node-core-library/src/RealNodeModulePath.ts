// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as nodeFs from 'node:fs';
import * as nodePath from 'node:path';

/**
 * Arguments used to create a function that resolves symlinked node_modules in a path
 * @public
 */
export interface IRealNodeModulePathResolverOptions {
  fs?: Partial<Pick<typeof nodeFs, 'lstatSync' | 'readlinkSync'>>;
  path?: Partial<Pick<typeof nodePath, 'isAbsolute' | 'join' | 'resolve' | 'sep'>>;
  /**
   * If set to true, the resolver will not throw if part of the path does not exist.
   * @defaultValue false
   */
  ignoreMissingPaths?: boolean;
}

/**
 * This class encapsulates a caching resolver for symlinks in node_modules directories.
 * It assumes that the only symlinks that exist in input paths are those that correspond to
 * npm packages.
 *
 * @remarks
 * In a repository with a symlinked node_modules installation, some symbolic links need to be mapped for
 * node module resolution to produce correct results. However, calling `fs.realpathSync.native` on every path,
 * as is commonly done by most resolvers, involves an enormous number of file system operations (for reference,
 * each invocation of `fs.realpathSync.native` involves a series of `fs.readlinkSync` calls, up to one for each
 * path segment in the input).
 *
 * @public
 */
export class RealNodeModulePathResolver {
  /**
   * Similar in function to `fs.realpathSync.native`, but assumes the only symlinks present are npm packages.
   *
   * @param input - A path to a file or directory, where the path separator is `${require('node:path').sep}`
   * @returns The real path to the input, resolving the node_modules symlinks in the path
   * @public
   */
  public readonly realNodeModulePath: (input: string) => string;

  private readonly _cache: Map<string, string | false>;
  private readonly _errorCache: Map<string, Error>;
  private readonly _fs: Required<NonNullable<IRealNodeModulePathResolverOptions['fs']>>;
  private readonly _path: Required<NonNullable<IRealNodeModulePathResolverOptions['path']>>;
  private readonly _lstatOptions: Pick<nodeFs.StatSyncOptions, 'throwIfNoEntry'>;

  public constructor(options: IRealNodeModulePathResolverOptions = {}) {
    const {
      fs: { lstatSync = nodeFs.lstatSync, readlinkSync = nodeFs.readlinkSync } = nodeFs,
      path: {
        isAbsolute = nodePath.isAbsolute,
        join = nodePath.join,
        resolve = nodePath.resolve,
        sep = nodePath.sep
      } = nodePath,
      ignoreMissingPaths = false
    } = options;
    const cache: Map<string, string> = (this._cache = new Map());
    this._errorCache = new Map();
    this._fs = {
      lstatSync,
      readlinkSync
    };
    this._path = {
      isAbsolute,
      join,
      resolve,
      sep
    };
    this._lstatOptions = {
      throwIfNoEntry: !ignoreMissingPaths
    };

    const nodeModulesToken: string = `${sep}node_modules${sep}`;
    const self: this = this;

    function realNodeModulePathInternal(input: string): string {
      // Find the last node_modules path segment
      const nodeModulesIndex: number = input.lastIndexOf(nodeModulesToken);
      if (nodeModulesIndex < 0) {
        // No node_modules in path, so we assume it is already the real path
        return input;
      }

      // First assume that the next path segment after node_modules is a symlink
      let linkStart: number = nodeModulesIndex + nodeModulesToken.length - 1;
      let linkEnd: number = input.indexOf(sep, linkStart + 1);
      // If the path segment starts with a '@', then it is a scoped package
      const isScoped: boolean = input.charAt(linkStart + 1) === '@';
      if (isScoped) {
        // For a scoped package, the scope is an ordinary directory, so we need to find the next path segment
        if (linkEnd < 0) {
          // Symlink missing, so see if anything before the last node_modules needs resolving,
          // and preserve the rest of the path
          return join(
            realNodeModulePathInternal(input.slice(0, nodeModulesIndex)),
            input.slice(nodeModulesIndex + 1),
            // Joining to `.` will clean up any extraneous trailing slashes
            '.'
          );
        }

        linkStart = linkEnd;
        linkEnd = input.indexOf(sep, linkStart + 1);
      }

      // No trailing separator, so the link is the last path segment
      if (linkEnd < 0) {
        linkEnd = input.length;
      }

      const linkCandidate: string = input.slice(0, linkEnd);
      // Check if the link is a symlink
      const linkTarget: string | undefined = self._tryReadLink(linkCandidate);
      if (linkTarget && isAbsolute(linkTarget)) {
        // Absolute path, combine the link target with any remaining path segments
        // Cache the resolution to avoid the readlink call in subsequent calls
        cache.set(linkCandidate, linkTarget);
        cache.set(linkTarget, linkTarget);
        // Joining to `.` will clean up any extraneous trailing slashes
        return join(linkTarget, input.slice(linkEnd + 1), '.');
      }

      // Relative path or does not exist
      // Either way, the path before the last node_modules could itself be in a node_modules folder
      // So resolve the base path to find out what paths are relative to
      const realpathBeforeNodeModules: string = realNodeModulePathInternal(input.slice(0, nodeModulesIndex));
      if (linkTarget) {
        // Relative path in symbolic link. Should be resolved relative to real path of base path.
        const resolvedTarget: string = resolve(
          realpathBeforeNodeModules,
          input.slice(nodeModulesIndex + 1, linkStart),
          linkTarget
        );
        // Cache the result of the combined resolution to avoid the readlink call in subsequent calls
        cache.set(linkCandidate, resolvedTarget);
        cache.set(resolvedTarget, resolvedTarget);
        // Joining to `.` will clean up any extraneous trailing slashes
        return join(resolvedTarget, input.slice(linkEnd + 1), '.');
      }

      // No symlink, so just return the real path before the last node_modules combined with the
      // subsequent path segments
      // Joining to `.` will clean up any extraneous trailing slashes
      return join(realpathBeforeNodeModules, input.slice(nodeModulesIndex + 1), '.');
    }

    this.realNodeModulePath = (input: string) => {
      return realNodeModulePathInternal(resolve(input));
    };
  }

  /**
   * Clears the cache of resolved symlinks.
   * @public
   */
  public clearCache(): void {
    this._cache.clear();
  }

  /**
   * Tries to read a symbolic link at the specified path.
   * If the input is not a symbolic link, returns undefined.
   * @param link - The link to try to read
   * @returns The target of the symbolic link, or undefined if the input is not a symbolic link
   */
  private _tryReadLink(link: string): string | undefined {
    const cached: string | false | undefined = this._cache.get(link);
    if (cached !== undefined) {
      return cached || undefined;
    }

    const cachedError: Error | undefined = this._errorCache.get(link);
    if (cachedError) {
      // Fill the properties but fix the stack trace.
      throw Object.assign(new Error(cachedError.message), cachedError);
    }

    // On Windows, calling `readlink` on a directory throws an EUNKOWN, not EINVAL, so just pay the cost
    // of an lstat call.
    try {
      const stat: nodeFs.Stats | undefined = this._fs.lstatSync(link, this._lstatOptions);
      if (stat?.isSymbolicLink()) {
        // path.join(x, '.') will trim trailing slashes, if applicable
        const result: string = this._path.join(this._fs.readlinkSync(link, 'utf8'), '.');
        return result;
      }

      // Ensure we cache that this was not a symbolic link.
      this._cache.set(link, false);
    } catch (err) {
      this._errorCache.set(link, err as Error);
    }
  }
}
