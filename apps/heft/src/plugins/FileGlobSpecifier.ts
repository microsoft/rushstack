// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import glob from 'fast-glob';

/**
 * Used to specify a selection of files from a source folder.
 *
 * @public
 */
export interface IFileGlobSpecifier {
  /**
   * Absolute path to the folder from which source files should be located.
   */
  sourceFolder: string;

  /**
   * File extensions that should be included from the source folder.
   */
  fileExtensions?: string[];

  /**
   * Globs that should be explicitly excluded. This takes precedence over globs listed in "includeGlobs" and
   * files that match the file extensions provided in "fileExtensions".
   */
  excludeGlobs?: string[];

  /**
   * Globs that should be explicitly included.
   */
  includeGlobs?: string[];
}

export async function getRelativeFilePathsAsync(fileGlobSpecifier: IFileGlobSpecifier): Promise<Set<string>> {
  return new Set<string>(
    await glob(getIncludedGlobPatterns(fileGlobSpecifier), {
      cwd: fileGlobSpecifier.sourceFolder,
      ignore: fileGlobSpecifier.excludeGlobs,
      dot: true,
      onlyFiles: true
    })
  );
}

function getIncludedGlobPatterns(fileGlobSpecifier: IFileGlobSpecifier): string[] {
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
