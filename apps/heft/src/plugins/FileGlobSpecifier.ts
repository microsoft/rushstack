// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as fs from 'node:fs';
import * as path from 'node:path';

import glob, { type FileSystemAdapter, type Entry } from 'fast-glob';

import { Async } from '@rushstack/node-core-library';

import type { IWatchFileSystemAdapter, IWatchedFileState } from '../utilities/WatchFileSystemAdapter.ts';

/**
 * Used to specify a selection of one or more files.
 *
 * @public
 */
export interface IFileSelectionSpecifier {
  /**
   * Absolute path to the target. The provided sourcePath can be to a file or a folder. If
   * fileExtensions, excludeGlobs, or includeGlobs are specified, the sourcePath is assumed
   * to be a folder. If it is not a folder, an error will be thrown.
   */
  sourcePath?: string;

  /**
   * File extensions that should be included from the source folder. Only supported when the sourcePath
   * is a folder.
   */
  fileExtensions?: string[];

  /**
   * Globs that should be explicitly excluded. This takes precedence over globs listed in "includeGlobs" and
   * files that match the file extensions provided in "fileExtensions". Only supported when the sourcePath
   * is a folder.
   */
  excludeGlobs?: string[];

  /**
   * Globs that should be explicitly included. Only supported when the sourcePath is a folder.
   */
  includeGlobs?: string[];
}

/**
 * A supported subset of options used when globbing files.
 *
 * @public
 */
export interface IGlobOptions {
  /**
   * Current working directory that the glob pattern will be applied to.
   */
  cwd?: string;

  /**
   * Whether or not the returned file paths should be absolute.
   *
   * @defaultValue false
   */
  absolute?: boolean;

  /**
   * Patterns to ignore when globbing.
   */
  ignore?: string[];

  /**
   * Whether or not to include dot files when globbing.
   *
   * @defaultValue false
   */
  dot?: boolean;
}

export interface IGetFileSelectionSpecifierPathsOptions {
  fileGlobSpecifier: IFileSelectionSpecifier;
  includeFolders?: boolean;
  fileSystemAdapter?: FileSystemAdapter;
}

/**
 * Glob a set of files and return a list of paths that match the provided patterns.
 *
 * @param patterns - Glob patterns to match against.
 * @param options - Options that are used when globbing the set of files.
 *
 * @public
 */
export type GlobFn = (pattern: string | string[], options?: IGlobOptions | undefined) => Promise<string[]>;
/**
 * Glob a set of files and return a map of paths that match the provided patterns to their current state in the watcher.
 *
 * @param patterns - Glob patterns to match against.
 * @param options - Options that are used when globbing the set of files.
 *
 * @public
 */
export type WatchGlobFn = (
  pattern: string | string[],
  options?: IGlobOptions | undefined
) => Promise<Map<string, IWatchedFileState>>;

function isWatchFileSystemAdapter(adapter: FileSystemAdapter): adapter is IWatchFileSystemAdapter {
  return !!(adapter as IWatchFileSystemAdapter).getStateAndTrackAsync;
}

export interface IWatchGlobOptions extends IGlobOptions {
  fs: IWatchFileSystemAdapter;
}

export async function watchGlobAsync(
  pattern: string | string[],
  options: IWatchGlobOptions
): Promise<Map<string, IWatchedFileState>> {
  const { fs, cwd, absolute } = options;
  if (!cwd) {
    throw new Error(`"cwd" must be set in the options passed to "watchGlobAsync"`);
  }

  const rawFiles: string[] = await glob(pattern, options);

  const results: Map<string, IWatchedFileState> = new Map();
  await Async.forEachAsync(
    rawFiles,
    async (file: string) => {
      const state: IWatchedFileState = await fs.getStateAndTrackAsync(
        absolute ? path.normalize(file) : path.resolve(cwd, file)
      );
      results.set(file, state);
    },
    {
      concurrency: 20
    }
  );

  return results;
}

export async function getFileSelectionSpecifierPathsAsync(
  options: IGetFileSelectionSpecifierPathsOptions
): Promise<Map<string, fs.Dirent>> {
  const { fileGlobSpecifier, includeFolders, fileSystemAdapter } = options;
  const rawEntries: Entry[] = await glob(fileGlobSpecifier.includeGlobs!, {
    fs: fileSystemAdapter,
    cwd: fileGlobSpecifier.sourcePath,
    ignore: fileGlobSpecifier.excludeGlobs,
    onlyFiles: !includeFolders,
    dot: true,
    absolute: true,
    objectMode: true
  });

  let results: Map<string, fs.Dirent>;
  if (fileSystemAdapter && isWatchFileSystemAdapter(fileSystemAdapter)) {
    results = new Map();
    await Async.forEachAsync(
      rawEntries,
      async (entry: Entry) => {
        const { path: filePath, dirent } = entry;
        if (entry.dirent.isDirectory()) {
          return;
        }
        const state: IWatchedFileState = await fileSystemAdapter.getStateAndTrackAsync(
          path.normalize(filePath)
        );
        if (state.changed) {
          results.set(filePath, dirent as fs.Dirent);
        }
      },
      {
        concurrency: 20
      }
    );
  } else {
    results = new Map(rawEntries.map((entry) => [entry.path, entry.dirent as fs.Dirent]));
  }

  return results;
}

export function asAbsoluteFileSelectionSpecifier<TSpecifier extends IFileSelectionSpecifier>(
  rootPath: string,
  fileGlobSpecifier: TSpecifier
): TSpecifier {
  const { sourcePath } = fileGlobSpecifier;
  return {
    ...fileGlobSpecifier,
    sourcePath: sourcePath ? path.resolve(rootPath, sourcePath) : rootPath,
    includeGlobs: getIncludedGlobPatterns(fileGlobSpecifier),
    fileExtensions: undefined
  };
}

function getIncludedGlobPatterns(fileGlobSpecifier: IFileSelectionSpecifier): string[] {
  const patternsToGlob: Set<string> = new Set<string>();

  // Glob file extensions with a specific glob to increase perf
  const escapedFileExtensions: Set<string> = new Set<string>();
  for (const fileExtension of fileGlobSpecifier.fileExtensions || []) {
    let escapedFileExtension: string;
    if (fileExtension.charAt(0) === '.') {
      escapedFileExtension = fileExtension.slice(1);
    } else {
      escapedFileExtension = fileExtension;
    }

    escapedFileExtension = glob.escapePath(escapedFileExtension);
    escapedFileExtensions.add(escapedFileExtension);
  }

  if (escapedFileExtensions.size > 1) {
    patternsToGlob.add(`**/*.{${[...escapedFileExtensions].join(',')}}`);
  } else if (escapedFileExtensions.size === 1) {
    patternsToGlob.add(`**/*.${[...escapedFileExtensions][0]}`);
  }

  // Now include the other globs as well
  for (const include of fileGlobSpecifier.includeGlobs || []) {
    patternsToGlob.add(include);
  }

  // Include a default glob if none are specified
  if (!patternsToGlob.size) {
    patternsToGlob.add('**/*');
  }

  return [...patternsToGlob];
}
