// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createHash } from 'node:crypto';
import * as path from 'node:path';

import type { ISerializedResolveContext } from '@rushstack/webpack-workspace-resolve-plugin';

import type { IDependencyEntry, IResolverContext } from './types';

const MAX_LENGTH_WITHOUT_HASH: number = 120 - 26 - 1;
const BASE32: string[] = 'abcdefghijklmnopqrstuvwxyz234567'.split('');

// https://github.com/swansontec/rfc4648.js/blob/ead9c9b4b68e5d4a529f32925da02c02984e772c/src/codec.ts#L82-L118
export function createBase32Hash(input: string): string {
  const data: Buffer = createHash('md5').update(input).digest();

  const mask: 0x1f = 0x1f;
  let out: string = '';

  let bits: number = 0; // Number of bits currently in the buffer
  let buffer: number = 0; // Bits waiting to be written out, MSB first
  for (let i: number = 0; i < data.length; ++i) {
    // eslint-disable-next-line no-bitwise
    buffer = (buffer << 8) | (0xff & data[i]);
    bits += 8;

    // Write out as much as we can:
    while (bits > 5) {
      bits -= 5;
      // eslint-disable-next-line no-bitwise
      out += BASE32[mask & (buffer >> bits)];
    }
  }

  // Partial character:
  if (bits) {
    // eslint-disable-next-line no-bitwise
    out += BASE32[mask & (buffer << (5 - bits))];
  }

  return out;
}

// https://github.com/pnpm/pnpm/blob/f394cfccda7bc519ceee8c33fc9b68a0f4235532/packages/dependency-path/src/index.ts#L167-L189
export function depPathToFilename(depPath: string): string {
  let filename: string = depPathToFilenameUnescaped(depPath).replace(/[\\/:*?"<>|]/g, '+');
  if (filename.includes('(')) {
    filename = filename.replace(/(\)\()|\(/g, '_').replace(/\)$/, '');
  }
  if (filename.length > 120 || (filename !== filename.toLowerCase() && !filename.startsWith('file+'))) {
    return `${filename.substring(0, MAX_LENGTH_WITHOUT_HASH)}_${createBase32Hash(filename)}`;
  }
  return filename;
}

/**
 * Computes the root folder for a dependency from a reference to it in another package
 * @param lockfileFolder - The folder that contains the lockfile
 * @param key - The key of the dependency
 * @param specifier - The specifier in the lockfile for the dependency
 * @param context - The owning package
 * @returns The identifier for the dependency
 */
export function resolveDependencyKey(
  lockfileFolder: string,
  key: string,
  specifier: string,
  context: IResolverContext
): string {
  if (specifier.startsWith('/')) {
    return getDescriptionFileRootFromKey(lockfileFolder, specifier);
  } else if (specifier.startsWith('link:')) {
    if (context.isProject) {
      return path.posix.join(context.descriptionFileRoot, specifier.slice(5));
    } else {
      return path.posix.join(lockfileFolder, specifier.slice(5));
    }
  } else if (specifier.startsWith('file:')) {
    return getDescriptionFileRootFromKey(lockfileFolder, specifier, key);
  } else {
    return getDescriptionFileRootFromKey(lockfileFolder, `/${key}@${specifier}`);
  }
}

/**
 * Computes the physical path to a dependency based on its entry
 * @param lockfileFolder - The folder that contains the lockfile during installation
 * @param key - The key of the dependency
 * @param name - The name of the dependency, if provided
 * @returns The physical path to the dependency
 */
export function getDescriptionFileRootFromKey(lockfileFolder: string, key: string, name?: string): string {
  if (!key.startsWith('file:')) {
    name = key.slice(1, key.indexOf('@', 2));
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
  context: IResolverContext
): void {
  for (const [key, value] of Object.entries(collection)) {
    const version: string = typeof value === 'string' ? value : value.version;
    const resolved: string = resolveDependencyKey(lockfileFolder, key, version, context);

    context.deps.set(key, resolved);
  }
}

/**
 *
 * @param depPath - The path to the dependency
 * @returns The folder name for the dependency
 */
export function depPathToFilenameUnescaped(depPath: string): string {
  if (depPath.indexOf('file:') !== 0) {
    if (depPath.startsWith('/')) {
      depPath = depPath.slice(1);
    }
    return depPath;
  }
  return depPath.replace(':', '+');
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
    const { deps } = context;

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

    if (!context.name) {
      throw new Error(`Missing name for ${descriptionFileRoot}`);
    }

    const serializedContext: ISerializedResolveContext = {
      name: context.name,
      root: descriptionFileRoot.slice(commonPathPrefix.length),
      dirInfoFiles: context.nestedPackageDirs?.length ? context.nestedPackageDirs : undefined,
      deps: hasAnyDeps ? serializedDeps : undefined
    };

    return serializedContext;
  };
}
