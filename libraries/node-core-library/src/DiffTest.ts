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
 * @alpha
 */
export class DiffTest {
  private static _packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();

  private static _getNormalizedContent(s: string): string {
    return s.replace(/\r\n/g, '\n').replace(/\r/g, '') // convert to Unix-style newlines
      .replace(/\s+\n/g, '\n') // strip spaces from end of line
      .replace(/\n+$/g, '');  // strip newlines from end of file
  }

  /**
   * Clears the internal file cache.
   * @remarks
   * Call this method if changes have been made to the package.json files on disk.
   */
  public static clearCache(): void {
    this._packageJsonLookup.clearCache();
  }

  /**
   * Returns a folder in the temp directory where the unit test should write its output files
   * to be diffed.
   * @param unitTestDirName - the "__dirname" variable, evaluated in the context of the unit test
   * @param testModule - the name of the class being unit tested
   * @returns A fully qualified path of the folder where the unit test should write its output
   */
  public static getFolderPath(unitTestDirName: string, testModule: string): string {
    const packageJsonFolderPath: string | undefined
      = this._packageJsonLookup.tryFindPackagePathUpwards(unitTestDirName);

    if (packageJsonFolderPath === undefined) {
      throw new Error('Unable to find a package.json in any parent folder of ' + unitTestDirName);
    }

    const diffTestPath: string = path.join(packageJsonFolderPath, 'temp', 'diff-tests', testModule);
    fsx.mkdirsSync(diffTestPath);

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
    const normalizedActual: string = DiffTest._getNormalizedContent(actualContent);
    const normalizedExpected: string = DiffTest._getNormalizedContent(expectedContent);

    if (normalizedActual !== normalizedExpected) {
      throw new Error('The test output file does not match the expected input:\n'
        + actualFilePath);
    }
  }
}
