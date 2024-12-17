// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { WebpackPluginInstance, Compiler } from 'webpack';

import type { WorkspaceLayoutCache } from './WorkspaceLayoutCache';
import { KnownDescriptionFilePlugin } from './KnownDescriptionFilePlugin';
import { KnownPackageDependenciesPlugin } from './KnownPackageDependenciesPlugin';

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
}

/**
 * A Webpack plugin that optimizes package.json lookups and resolution of bare specifiers in a monorepo.
 *
 * @beta
 */
export class WorkspaceResolvePlugin implements WebpackPluginInstance {
  private readonly _cache: WorkspaceLayoutCache;

  public constructor(cache: WorkspaceLayoutCache) {
    this._cache = cache;
  }

  public apply(compiler: Compiler): void {
    compiler.resolverFactory.hooks.resolveOptions
      .for('normal')
      .tap(WorkspaceResolvePlugin.name, (resolveOptions) => {
        // Omit default `node_modules`
        if (resolveOptions.modules) {
          resolveOptions.modules = resolveOptions.modules.filter((modulePath: string) => {
            return modulePath !== 'node_modules';
          });
        } else {
          resolveOptions.modules = [];
        }

        const cache: WorkspaceLayoutCache = this._cache;

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
      });
  }
}
