// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Fork https://github.com/pnpm/pnpm/blob/main/lockfile/fs/src/lockfileFormatConverters.ts
 *
 * Pnpm lockfile v9 have some breaking changes on the lockfile format. For Example, the "packages" field has been split into "packages" and "snapshots" two parts.
 * Rush should not parse the lockfile by itself, but should rely on pnpm to parse the lockfile.
 * To ensure consistency with pnpm's parsing logic, I copied the relevant logic from @pnpm/lockfile.fs to this file.
 *
 * There are some reasons for copying the relevant logic instead of depending on @pnpm/lockfile.fs directly:
 * 1. @pnpm/lockfile.fs has a exports filed in package.json, which will cause convertLockfileV9ToLockfileObject cannot be imported directly.
 * 2. @pnpm/lockfile.fs only provides asynchronous read methods, while rush requires synchronous reading of the lockfile file.
 * Perhaps this file will be deleted in the future and instead depend on @pnpm/lockfile.fs directly.
 */
import { removeSuffix } from '@pnpm/dependency-path';
import type {
  InlineSpecifiersProjectSnapshot,
  InlineSpecifiersResolvedDependencies,
  Lockfile,
  LockfileFile,
  LockfileFileV9,
  PackageSnapshots,
  ProjectSnapshot,
  ResolvedDependencies
} from '@pnpm/lockfile.types';

import { removeNullishProps } from '../../utilities/objectUtilities';

type DepPath = string & { __brand: 'DepPath' };
// eslint-disable-next-line @typescript-eslint/typedef
const DEPENDENCIES_FIELDS = ['optionalDependencies', 'dependencies', 'devDependencies'] as const;

function revertProjectSnapshot(from: InlineSpecifiersProjectSnapshot): ProjectSnapshot {
  const specifiers: ResolvedDependencies = {};

  function moveSpecifiers(fromDep: InlineSpecifiersResolvedDependencies): ResolvedDependencies {
    const resolvedDependencies: ResolvedDependencies = {};
    for (const [depName, { specifier, version }] of Object.entries(fromDep)) {
      const existingValue: string = specifiers[depName];
      if (existingValue != null && existingValue !== specifier) {
        throw new Error(
          `Project snapshot lists the same dependency more than once with conflicting versions: ${depName}`
        );
      }

      specifiers[depName] = specifier;
      resolvedDependencies[depName] = version;
    }
    return resolvedDependencies;
  }

  const dependencies: ResolvedDependencies | undefined =
    from.dependencies == null ? from.dependencies : moveSpecifiers(from.dependencies);
  const devDependencies: ResolvedDependencies | undefined =
    from.devDependencies == null ? from.devDependencies : moveSpecifiers(from.devDependencies);
  const optionalDependencies: ResolvedDependencies | undefined =
    from.optionalDependencies == null ? from.optionalDependencies : moveSpecifiers(from.optionalDependencies);

  return {
    ...removeNullishProps({
      ...from,
      dependencies,
      devDependencies,
      optionalDependencies
    }),
    specifiers
  };
}

function convertFromLockfileFileMutable(lockfileFile: LockfileFile): LockfileFileV9 {
  if (typeof lockfileFile?.importers === 'undefined') {
    lockfileFile.importers = {
      '.': {
        dependenciesMeta: lockfileFile.dependenciesMeta,
        publishDirectory: lockfileFile.publishDirectory
      }
    };
    for (const depType of DEPENDENCIES_FIELDS) {
      if (lockfileFile[depType] != null) {
        lockfileFile.importers['.'][depType] = lockfileFile[depType];
        delete lockfileFile[depType];
      }
    }
  }
  return lockfileFile as LockfileFileV9;
}

function mapValues<T, U>(obj: Record<string, T>, mapper: (val: T, key: string) => U): Record<string, U> {
  const result: Record<string, U> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = mapper(value, key);
  }
  return result;
}

/**
 * Convert lockfile v9 object to standard lockfile object.
 *
 * This function will mutate the lockfile object. It will:
 * 1. Ensure importers['.'] exists.
 * 2. Merge snapshots and packages into packages.
 * 3. Extract specifier from importers['xxx'] into the specifiers field.
 */
export function convertLockfileV9ToLockfileObject(lockfile: LockfileFileV9): Lockfile {
  const { importers, ...rest } = convertFromLockfileFileMutable(lockfile);

  const packages: PackageSnapshots = {};
  for (const [depPath, pkg] of Object.entries(lockfile.snapshots ?? {})) {
    const pkgId: string = removeSuffix(depPath);
    packages[depPath as DepPath] = Object.assign(pkg, lockfile.packages?.[pkgId]);
  }
  return {
    ...rest,
    packages,
    importers: mapValues(importers ?? {}, revertProjectSnapshot)
  };
}
