// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type { ISerializedResolveContext } from '@rushstack/webpack-workspace-resolve-plugin';

import type { IDependencyEntry, IResolverContext } from './types';
import type { IPnpmVersionHelpers } from './pnpm/pnpmVersionHelpers';

/**
 * Computes the root folder for a dependency from a reference to it in another package
 * @param lockfileFolder - The folder that contains the lockfile
 * @param key - The key of the dependency
 * @param specifier - The specifier in the lockfile for the dependency
 * @param context - The owning package
 * @param helpers - Version-specific pnpm helpers
 * @returns The identifier for the dependency
 */
export function resolveDependencyKey(
  lockfileFolder: string,
  key: string,
  specifier: string,
  context: IResolverContext,
  helpers: IPnpmVersionHelpers,
  packageKeys?: { has(key: string): boolean }
): string {
  if (specifier.startsWith('link:')) {
    return path.posix.join(
      context.isProject ? context.descriptionFileRoot : lockfileFolder,
      specifier.slice(5)
    );
  } else if (specifier.startsWith('file:')) {
    return getDescriptionFileRootFromKey(lockfileFolder, specifier, helpers.depPathToFilename, key);
  } else {
    const resolvedKey: string = packageKeys?.has(specifier)
      ? specifier
      : helpers.buildDependencyKey(key, specifier);
    return getDescriptionFileRootFromKey(lockfileFolder, resolvedKey, helpers.depPathToFilename);
  }
}

/**
 * Computes the physical path to a dependency based on its entry
 * @param lockfileFolder - The folder that contains the lockfile during installation
 * @param key - The key of the dependency
 * @param depPathToFilename - Version-specific function to convert dep paths to filenames
 * @param name - The name of the dependency, if provided
 * @returns The physical path to the dependency
 */
export function getDescriptionFileRootFromKey(
  lockfileFolder: string,
  key: string,
  depPathToFilename: (depPath: string) => string,
  name?: string
): string {
  if (!key.startsWith('file:') && !name) {
    const offset: number = key.startsWith('/') ? 1 : 0;
    name = key.slice(offset, key.indexOf('@', offset + 1));
  }
  if (!name) {
    throw new Error(`Missing package name for ${key}`);
  }

  const originFolder: string = `${lockfileFolder}/node_modules/.pnpm/${depPathToFilename(key)}/node_modules`;
  const descriptionFileRoot: string = `${originFolder}/${name}`;
  return descriptionFileRoot;
}

export function resolveDependencies(
  lockfileFolder: string,
  collection: Record<string, IDependencyEntry>,
  context: IResolverContext,
  helpers: IPnpmVersionHelpers,
  packageKeys?: { has(key: string): boolean }
): void {
  for (const [key, value] of Object.entries(collection)) {
    const version: string = typeof value === 'string' ? value : value.version;
    const resolved: string = resolveDependencyKey(
      lockfileFolder,
      key,
      version,
      context,
      helpers,
      packageKeys
    );

    context.deps.set(key, resolved);
  }
}

/**
 * Extracts the package name and version from a lockfile package key.
 * @param key - The lockfile package key (e.g. '/autoprefixer\@9.8.8', '\@scope/name\@1.0.0(peer\@2.0.0)')
 * @returns The extracted name and version, or undefined for file: keys
 */
export function extractNameAndVersionFromKey(key: string): { name: string; version: string } | undefined {
  if (key.startsWith('file:')) {
    return undefined;
  }
  const offset: number = key.startsWith('/') ? 1 : 0;
  const versionAtIndex: number = key.indexOf('@', offset + 1);
  if (versionAtIndex === -1) {
    return undefined;
  }
  const name: string = key.slice(offset, versionAtIndex);
  const parenIndex: number = key.indexOf('(', versionAtIndex);
  const version: string =
    parenIndex !== -1 ? key.slice(versionAtIndex + 1, parenIndex) : key.slice(versionAtIndex + 1);
  return { name, version };
}

/**
 *
 * @param missingOptionalDependencies - The set of optional dependencies that were not installed
 * @param contexts - The map of context roots to their respective contexts
 * @param commonPathPrefix - The common root path to trim
 * @returns A function that serializes a context into a format that can be written to disk
 */
export function createContextSerializer(
  missingOptionalDependencies: Set<string>,
  contexts: Map<string, IResolverContext>,
  commonPathPrefix: string
): (entry: [string, IResolverContext]) => ISerializedResolveContext {
  return ([descriptionFileRoot, context]: [string, IResolverContext]): ISerializedResolveContext => {
    const { deps, name, nestedPackageDirs } = context;

    let hasAnyDeps: boolean = false;
    const serializedDeps: ISerializedResolveContext['deps'] = {};
    for (const [key, contextRoot] of deps) {
      if (missingOptionalDependencies.has(contextRoot)) {
        continue;
      }

      const resolutionContext: IResolverContext | undefined = contexts.get(contextRoot);
      if (!resolutionContext) {
        throw new Error(`Missing context for ${contextRoot}!`);
      }
      serializedDeps[key] = resolutionContext.ordinal;
      hasAnyDeps = true;
    }

    if (!name) {
      throw new Error(`Missing name for ${descriptionFileRoot}`);
    }

    const serializedContext: ISerializedResolveContext = {
      name,
      root: descriptionFileRoot.slice(commonPathPrefix.length),
      dirInfoFiles: nestedPackageDirs?.length ? nestedPackageDirs : undefined,
      deps: hasAnyDeps ? serializedDeps : undefined
    };

    return serializedContext;
  };
}
