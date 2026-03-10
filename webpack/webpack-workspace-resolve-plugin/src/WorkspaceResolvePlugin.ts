// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { WebpackPluginInstance, Compiler, ResolveOptions } from 'webpack';

import type { WorkspaceLayoutCache } from './WorkspaceLayoutCache.ts';
import { KnownDescriptionFilePlugin } from './KnownDescriptionFilePlugin.ts';
import { KnownPackageDependenciesPlugin } from './KnownPackageDependenciesPlugin.ts';

/**
 * Options for constructing a `WorkspaceResolvePlugin`.
 *
 * @beta
 */
export interface IWorkspaceResolvePluginOptions {
  /**
   * The cache of workspace layout information.
   */
  cache: WorkspaceLayoutCache;

  /**
   * Which webpack resolvers to apply the plugin to.
   * @defaultValue ['normal', 'context', 'loader']
   */
  resolverNames?: Iterable<string>;
}

/**
 * A Webpack plugin that optimizes package.json lookups and resolution of bare specifiers in a monorepo.
 *
 * @beta
 */
export class WorkspaceResolvePlugin implements WebpackPluginInstance {
  private readonly _cache: WorkspaceLayoutCache;
  private readonly _resolverNames: Set<string>;

  public constructor(options: IWorkspaceResolvePluginOptions) {
    this._cache = options.cache;
    this._resolverNames = new Set(options.resolverNames ?? ['normal', 'context', 'loader']);
  }

  public apply(compiler: Compiler): void {
    const cache: WorkspaceLayoutCache = this._cache;

    function handler(resolveOptions: ResolveOptions): ResolveOptions {
      // Omit default `node_modules`
      if (resolveOptions.modules) {
        resolveOptions.modules = resolveOptions.modules.filter((modulePath: string) => {
          return modulePath !== 'node_modules';
        });
      } else {
        resolveOptions.modules = [];
      }

      resolveOptions.plugins ??= [];
      resolveOptions.plugins.push(
        // Optimize identifying the package.json file for the issuer
        new KnownDescriptionFilePlugin(cache, 'before-parsed-resolve', 'described-resolve'),
        // Optimize locating the installed dependencies of the current package
        new KnownPackageDependenciesPlugin(cache, 'before-raw-module', 'resolve-as-module'),
        // Optimize loading the package.json file for the destination package (bare specifier)
        new KnownDescriptionFilePlugin(cache, 'before-resolve-as-module', 'resolve-in-package'),
        // Optimize loading the package.json file for the destination package (relative path)
        new KnownDescriptionFilePlugin(cache, 'before-relative', 'described-relative'),
        // Optimize locating and loading nested package.json for a directory
        new KnownDescriptionFilePlugin(
          cache,
          'before-undescribed-existing-directory',
          'existing-directory',
          true
        ),
        // Optimize locating and loading nested package.json for a file
        new KnownDescriptionFilePlugin(cache, 'before-undescribed-raw-file', 'raw-file')
      );

      return resolveOptions;
    }
    for (const resolverName of this._resolverNames) {
      compiler.resolverFactory.hooks.resolveOptions
        .for(resolverName)
        .tap(WorkspaceResolvePlugin.name, handler);
    }
  }
}
