// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { readFile, readFileSync } from 'node:fs';
import { promisify } from 'node:util';

import { parseResolverCache, type IResolverCacheFile } from '@rushstack/resolver-cache';

const readFileAsync: (path: string) => Promise<Buffer> = promisify(readFile) as (
  path: string
) => Promise<Buffer>;

/**
 * Options for {@link loadResolverCacheAsync} and {@link loadResolverCache}.
 *
 * @beta
 */
export interface ILoadResolverCacheOptions {
  /**
   * Paths to candidate cache files, in order of preference.
   *
   * @remarks
   * The first file that exists is used. Each file may be in either the binary format or the legacy
   * monolithic JSON format; the two are distinguished by content, not by file extension. The usual
   * configuration is to list the scoped per-project binary file first and the workspace-wide JSON
   * cache second, so that the JSON cache acts as a fallback for workspaces that have not enabled
   * the newer format.
   */
  filePaths: readonly string[];
}

function isFileNotFound(error: unknown): boolean {
  const code: unknown = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR' || code === 'EISDIR';
}

/**
 * Loads the first available resolver cache file, preferring the binary format and falling back to
 * the legacy monolithic JSON cache.
 *
 * @beta
 */
export async function loadResolverCacheAsync(
  options: ILoadResolverCacheOptions
): Promise<IResolverCacheFile> {
  const { filePaths } = options;

  for (const filePath of filePaths) {
    let data: Buffer;
    try {
      data = await readFileAsync(filePath);
    } catch (error) {
      if (isFileNotFound(error)) {
        continue;
      }
      throw error;
    }

    return parseResolverCache(data);
  }

  throw new Error(`Unable to find a resolver cache file. Tried: ${filePaths.join(', ')}`);
}

/**
 * The synchronous form of {@link loadResolverCacheAsync}.
 *
 * @beta
 */
export function loadResolverCache(options: ILoadResolverCacheOptions): IResolverCacheFile {
  const { filePaths } = options;

  for (const filePath of filePaths) {
    let data: Buffer;
    try {
      data = readFileSync(filePath);
    } catch (error) {
      if (isFileNotFound(error)) {
        continue;
      }
      throw error;
    }

    return parseResolverCache(data);
  }

  throw new Error(`Unable to find a resolver cache file. Tried: ${filePaths.join(', ')}`);
}
