// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  FileSystem,
  type IParsedPackageNameOrError,
  InternalError,
  Import
} from '@rushstack/node-core-library';

import { BaseShrinkwrapFile } from '../base/BaseShrinkwrapFile';
import { RushConstants } from '../RushConstants';
import type { DependencySpecifier } from '../DependencySpecifier';
import { PackageNameParsers } from '../../api/PackageNameParsers';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { BaseProjectShrinkwrapFile } from '../base/BaseProjectShrinkwrapFile';
import type { Subspace } from '../../api/Subspace';

/**
 * @yarnpkg/lockfile doesn't have types
 */
// eslint-disable-next-line
declare module YarnPkgLockfileTypes {
  export class ParseResult {
    public object: IYarnShrinkwrapJson;
  }

  export function parse(shrinkwrapJson: string): ParseResult;

  export function stringify(shrinkwrap: IYarnShrinkwrapJson): string;
}
const lockfileModule: typeof YarnPkgLockfileTypes = Import.lazy('@yarnpkg/lockfile', require);

/**
 * Used with YarnShrinkwrapFile._encodePackageNameAndSemVer() and _decodePackageNameAndSemVer().
 */
interface IPackageNameAndSemVer {
  packageName: string;
  semVerRange: string;
}

/**
 * Part of IYarnShrinkwrapJson
 */
interface IYarnShrinkwrapEntry {
  /**
   * The specific version that was chosen for this entry (i.e. package name and SemVer range)/
   *
   */
  version: string;

  /**
   * The source (e.g. registry tarball URL) of the package that was installed
   * with the integrity hash as a suffix.
   *
   * Examples:
   * https://registry.yarnpkg.com/@pnpm/types/-/types-1.7.0.tgz#9d66a8bed3fabcd80f288b3e7884b7418b05b5a9
   * file:./projects/api-documenter.tgz#d95f9779aa45df3ef1bbd95dec324793540765ba
   */
  resolved: string;

  /**
   * Records the original (unsolved) "dependencies" from the package.json.
   */
  dependencies?: { [dependency: string]: string };

  /**
   * Records the original (unsolved) "optionalDependencies" from the package.json.
   *
   * NOTE: Interestingly "peerDependencies" are apparently not tracked by the shrinkwrap file.
   * The "devDependencies" are not tracked either, because they are always indirect dependencies
   * for the installation.
   */
  optionalDependencies?: { [dependency: string]: string };
}

/**
 * Used by YarnShrinkwrapFile to interpret the `@yarnpkg/lockfile` data structure.
 */
interface IYarnShrinkwrapJson {
  /**
   * Example keys:
   * `js-tokens@^3.0.0 || ^4.0.0`
   * `@rush-temp/api-extractor-test-03@file:./projects/api-extractor-test-03.tgz`
   *
   * The value records how the SemVer range was solved.
   */
  [packageNameAndSemVer: string]: IYarnShrinkwrapEntry;
}

/**
 * Support for consuming the "yarn.lock" file.
 *
 * Yarn refers to its shrinkwrap file as a "lock file", even though it has nothing to do
 * with file locking.  Apparently this was based on a convention of the Ruby bundler.
 * Since Rush has to work interchangeably with 3 different package managers, here we refer
 * generically to yarn.lock as a "shrinkwrap file".
 *
 * If Rush's Yarn support gains popularity, we will try to improve the wording of
 * logging messages to use terminology more consistent with Yarn's own documentation.
 */
export class YarnShrinkwrapFile extends BaseShrinkwrapFile {
  public readonly isWorkspaceCompatible: boolean;

  // Example inputs:
  // "js-tokens@^3.0.0 || ^4.0.0"
  // "@rush-temp/api-extractor-test-03@file:./projects/api-extractor-test-03.tgz"
  private static _packageNameAndSemVerRegExp: RegExp = /^(@?[^@\s]+)(?:@(.*))?$/;

  private _shrinkwrapJson: IYarnShrinkwrapJson;
  private _tempProjectNames: string[];

  private constructor(shrinkwrapJson: IYarnShrinkwrapJson) {
    super();
    this._shrinkwrapJson = shrinkwrapJson;
    this._tempProjectNames = [];

    const seenEntries: Set<string> = new Set();

    for (const key of Object.keys(this._shrinkwrapJson)) {
      // Example key:
      const packageNameAndSemVer: IPackageNameAndSemVer = YarnShrinkwrapFile._decodePackageNameAndSemVer(key);

      // If it starts with @rush-temp, then include it:
      if (
        PackageNameParsers.permissive.getScope(packageNameAndSemVer.packageName) ===
        RushConstants.rushTempNpmScope
      ) {
        if (!/^file:/i.test(packageNameAndSemVer.semVerRange)) {
          // Sanity check to make sure this is a real package.
          // (Nobody should ever have an actual dependency on an "@rush-temp/" package.
          throw new Error(
            'Unexpected package/semver expression found in the Yarn shrinkwrap file (yarn.lock): ' +
              JSON.stringify(key)
          );
        }

        if (!seenEntries.add(packageNameAndSemVer.packageName)) {
          // Sanity check -- this should never happen
          throw new Error(
            'Duplicate @rush-temp package found in the Yarn shrinkwrap file (yarn.lock): ' +
              JSON.stringify(key)
          );
        }

        this._tempProjectNames.push(packageNameAndSemVer.packageName);

        const entry: IYarnShrinkwrapEntry = this._shrinkwrapJson[key];

        // Yarn fails installation if the integrity hash does not match a "file://" reference to a tarball.
        // This is incorrect:  Normally a mismatched integrity hash does indicate a corrupted download,
        // since an NPM registry normally guarantees that a specific version number cannot be republished
        // with different content.  But this is NOT true for a "file://" reference, and there are valid
        // reasons why someone would update the file.  (PNPM handles this correctly, by simply reinstalling
        // the tarball if its hash has changed.)
        //
        // As a workaround, we can simply remove the hashes from the shrinkwrap file.  We will convert this:
        //   "file:./projects/my-project.tgz#80cefe05fd715e65219d1ed481209dc4023408aa"
        // ..to this:
        //   "file:./projects/my-project.tgz"
        const indexOfHash: number = entry.resolved.indexOf('#');
        if (indexOfHash >= 0) {
          entry.resolved = entry.resolved.substring(0, indexOfHash);
        }
      }
    }

    this._tempProjectNames.sort(); // make the result deterministic

    // We don't support Yarn workspaces yet
    this.isWorkspaceCompatible = false;
  }

  public static loadFromFile(shrinkwrapFilename: string): YarnShrinkwrapFile | undefined {
    try {
      const shrinkwrapContent: string = FileSystem.readFile(shrinkwrapFilename);
      return YarnShrinkwrapFile.loadFromString(shrinkwrapContent);
    } catch (error) {
      if (FileSystem.isNotExistError(error as Error)) {
        return undefined; // file does not exist
      }
      throw new Error(`Error reading "${shrinkwrapFilename}":\n  ${(error as Error).message}`);
    }
  }

  public static loadFromString(shrinkwrapContent: string): YarnShrinkwrapFile {
    const shrinkwrapJson: YarnPkgLockfileTypes.ParseResult = lockfileModule.parse(shrinkwrapContent);
    return new YarnShrinkwrapFile(shrinkwrapJson.object);
  }

  /**
   * The `@yarnpkg/lockfile` API only partially deserializes its data, and expects the caller
   * to parse the yarn.lock lookup keys (sometimes called a "pattern").
   *
   * Example input:  "js-tokens@^3.0.0 || ^4.0.0"
   * Example output: { packageName: "js-tokens", semVerRange: "^3.0.0 || ^4.0.0" }
   */
  private static _decodePackageNameAndSemVer(packageNameAndSemVer: string): IPackageNameAndSemVer {
    const result: RegExpExecArray | null =
      YarnShrinkwrapFile._packageNameAndSemVerRegExp.exec(packageNameAndSemVer);
    if (!result) {
      // Sanity check -- this should never happen
      throw new Error(
        'Unable to parse package/semver expression in the Yarn shrinkwrap file (yarn.lock): ' +
          JSON.stringify(packageNameAndSemVer)
      );
    }

    const packageName: string = result[1] || '';
    const parsedPackageName: IParsedPackageNameOrError = PackageNameParsers.permissive.tryParse(packageName);
    if (parsedPackageName.error) {
      // Sanity check -- this should never happen
      throw new Error(
        'Invalid package name the Yarn shrinkwrap file (yarn.lock): ' +
          JSON.stringify(packageNameAndSemVer) +
          '\n' +
          parsedPackageName.error
      );
    }

    return {
      packageName,
      semVerRange: result[2] || ''
    };
  }

  /**
   * This is the inverse of _decodePackageNameAndSemVer():
   * Given an IPackageNameAndSemVer object, recreate the yarn.lock lookup key
   * (sometimes called a "pattern").
   */
  private static _encodePackageNameAndSemVer(packageNameAndSemVer: IPackageNameAndSemVer): string {
    return packageNameAndSemVer.packageName + '@' + packageNameAndSemVer.semVerRange;
  }

  public override getTempProjectNames(): ReadonlyArray<string> {
    return this._tempProjectNames;
  }

  public override async hasCompatibleTopLevelDependencyAsync(
    dependencySpecifier: DependencySpecifier
  ): Promise<boolean> {
    // It seems like we should normalize the key somehow, but Yarn apparently does not
    // do any normalization.
    const key: string = YarnShrinkwrapFile._encodePackageNameAndSemVer({
      packageName: dependencySpecifier.packageName,
      semVerRange: dependencySpecifier.versionSpecifier
    });

    // Check whether this exact key appears in the shrinkwrap file
    return Object.hasOwnProperty.call(this._shrinkwrapJson, key);
  }

  public override async tryEnsureCompatibleDependencyAsync(
    dependencySpecifier: DependencySpecifier,
    tempProjectName: string
  ): Promise<boolean> {
    return this.hasCompatibleTopLevelDependencyAsync(dependencySpecifier);
  }

  protected override serialize(): string {
    return lockfileModule.stringify(this._shrinkwrapJson);
  }

  protected override async getTopLevelDependencyVersionAsync(
    dependencyName: string
  ): Promise<DependencySpecifier | undefined> {
    throw new InternalError('Not implemented');
  }

  protected override async tryEnsureDependencyVersionAsync(
    dependencySpecifier: DependencySpecifier,
    tempProjectName: string
  ): Promise<DependencySpecifier | undefined> {
    throw new InternalError('Not implemented');
  }

  public override getProjectShrinkwrap(
    project: RushConfigurationProject
  ): BaseProjectShrinkwrapFile<YarnShrinkwrapFile> | undefined {
    return undefined;
  }

  public override async isWorkspaceProjectModifiedAsync(
    project: RushConfigurationProject,
    subspace: Subspace
  ): Promise<boolean> {
    throw new InternalError('Not implemented');
  }
}
