// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import glob from 'fast-glob';

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
  sourcePath: string;

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

export async function getRelativeFilePathsAsync(
  fileGlobSpecifier: IFileSelectionSpecifier
): Promise<Set<string>> {
  return new Set<string>(
    await glob(getIncludedGlobPatterns(fileGlobSpecifier), {
      cwd: fileGlobSpecifier.sourcePath,
      ignore: fileGlobSpecifier.excludeGlobs,
      dot: true,
      onlyFiles: true
    })
  );
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
