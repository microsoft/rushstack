// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export { WorkspaceResolvePlugin, type IWorkspaceResolvePluginOptions } from './WorkspaceResolvePlugin';
export {
  WorkspaceLayoutCache,
  type IPathNormalizationFunction,
  type IWorkspaceLayoutCacheOptions,
  type IResolveContext
} from './WorkspaceLayoutCache';
export {
  loadResolverCacheAsync,
  loadResolverCache,
  type ILoadResolverCacheOptions
} from './loadResolverCache';

// Re-exported so that consumers of this plugin do not need to take a direct dependency on
// `@rushstack/resolver-cache` merely to describe the cache data they pass in.
export type { ISerializedResolveContext, IResolverCacheFile } from '@rushstack/resolver-cache';
