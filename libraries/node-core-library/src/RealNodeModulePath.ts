// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as nodeFs from 'fs';
import * as nodePath from 'path';

/**
 * Arguments used to create a function that resolves symlinked node_modules in a path
 * @public
 */
export interface IRealNodeModulePathResolverOptions {
  fs: Pick<typeof nodeFs, 'lstatSync' | 'readlinkSync'>;
  path: Pick<typeof nodePath, 'isAbsolute' | 'normalize' | 'resolve' | 'sep'>;
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

  private readonly _cache: Map<string, string>;
  private readonly _fs: IRealNodeModulePathResolverOptions['fs'];

  public constructor(
    options: IRealNodeModulePathResolverOptions = {
      fs: nodeFs,
      path: nodePath
    }
  ) {
    const cache: Map<string, string> = (this._cache = new Map());
    const { path, fs } = options;
    const { sep: pathSeparator } = path;
    this._fs = fs;

    const nodeModulesToken: string = `${pathSeparator}node_modules${pathSeparator}`;

    const tryReadLink: (link: string) => string | undefined = this._tryReadLink.bind(this);

    function realNodeModulePathInternal(input: string): string {
      // Find the last node_modules path segment
      const nodeModulesIndex: number = input.lastIndexOf(nodeModulesToken);
      if (nodeModulesIndex < 0) {
        // No node_modules in path, so we assume it is already the real path
        return input;
      }

      // First assume that the next path segment after node_modules is a symlink
      let linkStart: number = nodeModulesIndex + nodeModulesToken.length - 1;
      let linkEnd: number = input.indexOf(pathSeparator, linkStart + 1);
      // If the path segment starts with a '@', then it is a scoped package
      const isScoped: boolean = input.charAt(linkStart + 1) === '@';
      if (isScoped) {
        // For a scoped package, the scope is an ordinary directory, so we need to find the next path segment
        if (linkEnd < 0) {
          // Symlink missing, so see if anything before the last node_modules needs resolving,
          // and preserve the rest of the path
          return `${realNodeModulePathInternal(input.slice(0, nodeModulesIndex))}${input.slice(nodeModulesIndex)}`;
        }

        linkStart = linkEnd;
        linkEnd = input.indexOf(pathSeparator, linkStart + 1);
      }

      // No trailing separator, so the link is the last path segment
      if (linkEnd < 0) {
        linkEnd = input.length;
      }

      const linkCandidate: string = input.slice(0, linkEnd);
      // Check if the link is a symlink
      const linkTarget: string | undefined = tryReadLink(linkCandidate);
      if (linkTarget && path.isAbsolute(linkTarget)) {
        // Absolute path, combine the link target with any remaining path segments
        // Cache the resolution to avoid the readlink call in subsequent calls
        cache.set(linkCandidate, linkTarget);
        cache.set(linkTarget, linkTarget);
        return `${linkTarget}${input.slice(linkEnd)}`;
      }

      // Relative path or does not exist
      // Either way, the path before the last node_modules could itself be in a node_modules folder
      // So resolve the base path to find out what paths are relative to
      const realpathBeforeNodeModules: string = realNodeModulePathInternal(input.slice(0, nodeModulesIndex));
      if (linkTarget) {
        // Relative path in symbolic link. Should be resolved relative to real path of base path.
        const resolvedTarget: string = path.resolve(
          `${realpathBeforeNodeModules}${input.slice(nodeModulesIndex, linkStart)}`,
          linkTarget
        );
        // Cache the result of the combined resolution to avoid the readlink call in subsequent calls
        cache.set(linkCandidate, resolvedTarget);
        cache.set(resolvedTarget, resolvedTarget);
        return `${resolvedTarget}${input.slice(linkEnd)}`;
      }

      // No symlink, so just return the real path before the last node_modules combined with the
      // subsequent path segments
      return `${realpathBeforeNodeModules}${input.slice(nodeModulesIndex)}`;
    }

    this.realNodeModulePath = (input: string) => {
      return realNodeModulePathInternal(path.normalize(input));
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
    const cached: string | undefined = this._cache.get(link);
    if (cached) {
      return cached;
    }

    // On Windows, calling `readlink` on a directory throws an EUNKOWN, not EINVAL, so just pay the cost
    // of an lstat call.
    const stat: nodeFs.Stats | undefined = this._fs.lstatSync(link);
    if (stat.isSymbolicLink()) {
      return this._fs.readlinkSync(link, 'utf8');
    }
  }
}
