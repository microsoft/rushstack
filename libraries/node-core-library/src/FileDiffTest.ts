// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as fsx from 'fs-extra';

import { PackageJsonLookup } from './PackageJsonLookup';

/**
 * Implements a unit testing strategy that generates output files, and then
 * compares them against the expected input.  If the files are different, then
 * the test fails.
 *
 * @public
 */
export class FileDiffTest {
  private static _packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();

  /**
   * Clears the internal file cache.
   * @remarks
   * Call this method if changes have been made to the package.json files on disk.
   */
  public static clearCache(): void {
    this._packageJsonLookup.clearCache();
  }

  /**
   * Sets up a folder in the temp directory where the unit test should write its output files
   * to be diffed.  Any previous contents of the folder will be deleted.
   *
   * @param unitTestDirName - the "__dirname" variable, evaluated in the context of the unit test
   * @param testModule - the name of the class being unit tested; must contain only letters, numbers, and underscores.
   * @returns A fully qualified path of the folder where the unit test should write its output
   */
  public static prepareFolder(unitTestDirName: string, testModule: string): string {
    const packageJsonFolderPath: string | undefined
      = this._packageJsonLookup.tryGetPackageFolder(unitTestDirName);

    if (packageJsonFolderPath === undefined) {
      throw new Error('Unable to find a package.json in any parent folder of ' + unitTestDirName);
    }

    if (!/^[a-zA-Z0-9_]+$/.test(testModule)) {
      throw new Error('Invalid test module name: ' + testModule);
    }

    const diffTestPath: string = path.join(packageJsonFolderPath, 'temp', 'diff-tests', testModule);
    fsx.mkdirsSync(diffTestPath);

    fsx.emptyDirSync(diffTestPath);

    return diffTestPath;
  }

  /**
   * Compares the contents of two files, and returns true if they are equivalent.
   * Note that these files are not normally edited by a human; the "equivalence"
   * comparison here is intended to ignore spurious changes that might be introduced
   * by a tool, e.g. Git newline normalization or an editor that strips
   * whitespace when saving.
   */
  public static assertEqual(actualFilePath: string, expectedFilePath: string): void {
    const actualContent: string = fsx.readFileSync(actualFilePath).toString('utf8');
    const expectedContent: string = fsx.readFileSync(expectedFilePath).toString('utf8');

    // NOTE: "\s" also matches "\r" and "\n"
    const normalizedActual: string = FileDiffTest._getNormalizedContent(actualContent);
    const normalizedExpected: string = FileDiffTest._getNormalizedContent(expectedContent);

    if (normalizedActual !== normalizedExpected) {
      // Copy the expected file into the same folder as the actual file for easier comparisons
      const expectedCopyFilename: string = path.join(path.dirname(actualFilePath), path.basename(expectedFilePath));
      if (fsx.existsSync(expectedCopyFilename)) {
        throw new Error('The FileDiffTest failed, but the expected output cannot be copied because'
          + ' the file already exists:\n' + expectedCopyFilename);
      }
      fsx.copySync(expectedFilePath, expectedCopyFilename);

      throw new Error('The test output file does not match the expected input:\n'
        + actualFilePath);
    }
  }

  private static _getNormalizedContent(s: string): string {
    return s.replace(/\r\n/g, '\n').replace(/\r/g, '') // convert to Unix-style newlines
      .replace(/\s+\n/g, '\n') // strip spaces from end of line
      .replace(/\n+$/g, '');  // strip newlines from end of file
  }
}
