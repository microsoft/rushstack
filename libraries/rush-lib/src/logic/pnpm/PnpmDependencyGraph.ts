// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { Import } from '@rushstack/node-core-library';
import type { IResolverCacheFile, ISerializedResolveContext } from '@rushstack/resolver-cache';

import {
  ShrinkwrapFileMajorVersion,
  type IPnpmShrinkwrapDependencyYaml,
  type IPnpmShrinkwrapImporterYaml,
  type IPnpmVersionSpecifier,
  type PnpmShrinkwrapFile
} from './PnpmShrinkwrapFile';

const pnpmKitV8: typeof import('@rushstack/rush-pnpm-kit-v8') = Import.lazy(
  '@rushstack/rush-pnpm-kit-v8',
  require
);
const pnpmKitV9: typeof import('@rushstack/rush-pnpm-kit-v9') = Import.lazy(
  '@rushstack/rush-pnpm-kit-v9',
  require
);
const pnpmKitV10: typeof import('@rushstack/rush-pnpm-kit-v10') = Import.lazy(
  '@rushstack/rush-pnpm-kit-v10',
  require
);

const IS_WINDOWS: boolean = process.platform === 'win32';

/**
 * Options for {@link buildPnpmResolverCache}.
 */
export interface IBuildPnpmResolverCacheOptions {
  /**
   * The lockfile to read the dependency graph from.
   */
  shrinkwrapFile: PnpmShrinkwrapFile;
  /**
   * The absolute, slash-normalized folder that contains the lockfile. Importer keys and virtual
   * store paths are resolved relative to this folder.
   */
  lockfileFolder: string;
  /**
   * The major version of PNPM that produced the lockfile. This selects the virtual store naming
   * scheme, which differs between PNPM 8, 9, and 10.
   */
  pnpmMajorVersion: number;
  /**
   * The absolute, slash-normalized repository root, including a trailing slash. Context root paths
   * are stored relative to this folder so that the resulting file is identical regardless of where
   * the repository happens to be cloned.
   */
  basePath: string;
  /**
   * Maps importer keys to the `name` field of the corresponding project's `package.json`. Importers
   * that are absent fall back to their importer key.
   */
  importerNames?: ReadonlyMap<string, string>;
}

/**
 * A resolver cache built from a lockfile, along with a lookup from context root path to ordinal.
 */
export interface IPnpmResolverCache {
  /**
   * The graph itself, with contexts in sorted root path order.
   */
  cache: IResolverCacheFile;
  /**
   * Maps the root path of each context to its ordinal in `cache.contexts`.
   */
  ordinalByRoot: ReadonlyMap<string, number>;
}

interface IRawContext {
  root: string;
  name: string;
  isProject: boolean;
  dependencies: [string, IPnpmVersionSpecifier][];
}

function getVersionSpecifierString(specifier: IPnpmVersionSpecifier): string {
  return typeof specifier === 'string' ? specifier : specifier.version;
}

function createDepPathToFilename(pnpmMajorVersion: number): (depPath: string) => string {
  if (pnpmMajorVersion >= 10) {
    // The maximum virtual store directory name length defaults to 60 on Windows and 120 elsewhere.
    return (depPath: string) =>
      pnpmKitV10.dependencyPath.depPathToFilename(depPath, IS_WINDOWS ? 60 : 120);
  }
  if (pnpmMajorVersion >= 9) {
    return (depPath: string) => pnpmKitV9.dependencyPath.depPathToFilename(depPath, 120);
  }
  return (depPath: string) => pnpmKitV8.dependencyPath.depPathToFilename(depPath);
}

/**
 * Extracts the package name from a lockfile dependency path, e.g. `/@scope/name@1.0.0(peer@2.0.0)`.
 */
function getPackageNameFromKey(key: string): string {
  const offset: number = key.startsWith('/') ? 1 : 0;
  const versionSeparatorIndex: number = key.indexOf('@', offset + 1);
  if (versionSeparatorIndex < 0) {
    throw new Error(`Unable to determine the package name for lockfile key ${JSON.stringify(key)}`);
  }
  return key.slice(offset, versionSeparatorIndex);
}

/**
 * Collects the declared dependencies of an importer or package entry.
 *
 * @remarks
 * `peerDependencies` are deliberately excluded. They are a constraint to be satisfied by the
 * package manager rather than an edge in the resolved graph; PNPM records the resolution it chose
 * in the peer suffix of the dependency path, which is already part of the context identity.
 */
function collectDependencies(
  entry: IPnpmShrinkwrapImporterYaml | IPnpmShrinkwrapDependencyYaml
): [string, IPnpmVersionSpecifier][] {
  const dependencies: [string, IPnpmVersionSpecifier][] = [];
  for (const collection of [entry.dependencies, entry.optionalDependencies]) {
    if (collection) {
      for (const [name, specifier] of Object.entries(collection)) {
        dependencies.push([name, specifier as IPnpmVersionSpecifier]);
      }
    }
  }
  return dependencies;
}

/**
 * Builds a resolver cache describing every context in a PNPM lockfile.
 *
 * @remarks
 * A context is identified solely by its root path on disk. PNPM injected dependencies therefore
 * produce contexts that are distinct from the workspace projects they were copied from: an injected
 * copy lives under the consuming subspace's virtual store and resolves its own dependencies to
 * other injected copies, so its dependency graph genuinely differs from that of the source project.
 * The same project can even be injected more than once within a single subspace when consumers
 * require different peer resolutions. Merging contexts by package name and version would silently
 * change module resolution and must never be done.
 */
export function buildPnpmResolverCache(options: IBuildPnpmResolverCacheOptions): IPnpmResolverCache {
  const { shrinkwrapFile, lockfileFolder, pnpmMajorVersion, basePath, importerNames } = options;
  if (!basePath.endsWith('/')) {
    throw new Error('The basePath must end with a trailing slash');
  }
  const depPathToFilename: (depPath: string) => string = createDepPathToFilename(pnpmMajorVersion);
  const isV6: boolean = shrinkwrapFile.shrinkwrapFileMajorVersion === ShrinkwrapFileMajorVersion.V6;

  const rawContexts: Map<string, IRawContext> = new Map();

  function getPackageRoot(key: string, name?: string): string {
    const packageName: string = name ?? getPackageNameFromKey(key);
    return `${lockfileFolder}/node_modules/.pnpm/${depPathToFilename(key)}/node_modules/${packageName}`;
  }

  for (const [importerKey, importer] of shrinkwrapFile.importers) {
    const root: string = path.posix.normalize(path.posix.join(lockfileFolder, importerKey));
    rawContexts.set(root, {
      root,
      name: importerNames?.get(importerKey) ?? importerKey,
      isProject: true,
      dependencies: collectDependencies(importer)
    });
  }

  for (const [packageKey, packageEntry] of shrinkwrapFile.packages) {
    const name: string = packageEntry.name ?? getPackageNameFromKey(packageKey);
    const root: string = getPackageRoot(packageKey, name);
    // A root path collision would mean two different resolutions share a folder, which PNPM does
    // not produce; if it ever happened, silently overwriting would corrupt resolution.
    if (!rawContexts.has(root)) {
      rawContexts.set(root, {
        root,
        name,
        isProject: false,
        dependencies: collectDependencies(packageEntry)
      });
    }
  }

  function resolveDependencyRoot(
    owner: IRawContext,
    dependencyName: string,
    specifier: IPnpmVersionSpecifier
  ): string {
    const version: string = getVersionSpecifierString(specifier);

    if (version.startsWith('link:')) {
      // A `link:` dependency is a symlink relative to the folder that declared it.
      const base: string = owner.isProject ? owner.root : lockfileFolder;
      return path.posix.normalize(path.posix.join(base, version.slice('link:'.length)));
    }

    if (version.startsWith('file:')) {
      // An injected dependency is materialized inside this lockfile's virtual store, so it is a
      // context in its own right rather than a reference to the source project.
      const key: string = shrinkwrapFile.packages.has(version)
        ? version
        : buildDependencyKey(dependencyName, version);
      return getPackageRoot(key, dependencyName);
    }

    const key: string = shrinkwrapFile.packages.has(version)
      ? version
      : buildDependencyKey(dependencyName, version);
    return getPackageRoot(key, dependencyName);
  }

  function buildDependencyKey(name: string, version: string): string {
    return isV6 ? `/${name}@${version}` : `${name}@${version}`;
  }

  // Sorting by root path gives the string table long shared prefixes and keeps dependency ordinals
  // close to the ordinal of the context that references them, so their deltas stay small.
  const sortedRoots: string[] = Array.from(rawContexts.keys()).sort();
  const ordinalByRoot: Map<string, number> = new Map();
  for (let i: number = 0; i < sortedRoots.length; ++i) {
    ordinalByRoot.set(sortedRoots[i], i);
  }

  const contexts: ISerializedResolveContext[] = sortedRoots.map((root: string) => {
    const rawContext: IRawContext = rawContexts.get(root)!;
    // Store paths relative to the repository root so that the encoded file does not depend on the
    // absolute location of the clone.
    const relativeRoot: string = root.startsWith(basePath) ? root.slice(basePath.length) : root;
    const context: ISerializedResolveContext = { root: relativeRoot, name: rawContext.name };

    let deps: Record<string, number> | undefined;
    for (const [dependencyName, specifier] of rawContext.dependencies) {
      const targetRoot: string = resolveDependencyRoot(rawContext, dependencyName, specifier);
      const targetOrdinal: number | undefined = ordinalByRoot.get(targetRoot);
      if (targetOrdinal !== undefined) {
        deps ??= {};
        deps[dependencyName] = targetOrdinal;
      }
    }
    if (deps) {
      context.deps = deps;
    }

    return context;
  });

  return { cache: { basePath, contexts }, ordinalByRoot };
}
