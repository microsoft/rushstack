import * as os from 'os';
import * as lockfile from '@yarnpkg/lockfile';
import {
  BaseShrinkwrapFile
} from '../base/BaseShrinkwrapFile';
import { FileSystem, PackageName } from '@microsoft/node-core-library';
import { RushConstants } from '../RushConstants';

interface IPackageNameAndSemVer {
  packageName: string;
  semVerRange: string;
}

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
 * Support for consuming the "yarn.lock" file.  (The Yarn documentation refers to this
 * as a "lock file", but we avoid that terminology because it is inconsistent with decades
 * of industry convention.  Its function is identical to the NPM/PNPM shrinkwrap file.)
 */
export class YarnShrinkwrapFile extends BaseShrinkwrapFile {
  // Example inputs:
  // "js-tokens@^3.0.0 || ^4.0.0"
  // "@rush-temp/api-extractor-test-03@file:./projects/api-extractor-test-03.tgz"
  private static packageNameAndSemVerRegExp: RegExp = /^(@?[^@\s]+)(?:@(.*))?$/;

  private _shrinkwrapJson: IYarnShrinkwrapJson;
  private _tempProjectNames: string[];

  public static loadFromFile(shrinkwrapFilename: string): YarnShrinkwrapFile | undefined {
    let shrinkwrapString: string;
    let shrinkwrapJson: lockfile.ParseResult;
    try {
      if (!FileSystem.exists(shrinkwrapFilename)) {
        return undefined; // file does not exist
      }

      shrinkwrapString = FileSystem.readFile(shrinkwrapFilename);
      shrinkwrapJson = lockfile.parse(shrinkwrapString);
    } catch (error) {
      throw new Error(`Error reading "${shrinkwrapFilename}":` + os.EOL + `  ${error.message}`);
    }

    return new YarnShrinkwrapFile(shrinkwrapJson.object as IYarnShrinkwrapJson);
  }

  private static _decodePackageNameAndSemVer(packageNameAndSemVer: string): IPackageNameAndSemVer {
    const result: RegExpExecArray | null = YarnShrinkwrapFile.packageNameAndSemVerRegExp.exec(packageNameAndSemVer);
    if (!result) {
      // Sanity check -- this should never happen
      throw new Error('Unable to parse package/semver expression in the Yarn shrinkwrap file: '
        + JSON.stringify(packageNameAndSemVer));
    }
    return {
      packageName: result[1] || '',
      semVerRange: result[2] || ''
    };
  }

  private static _encodePackageNameAndSemVer(packageNameAndSemVer: IPackageNameAndSemVer): string {
    return packageNameAndSemVer.packageName + '@' + packageNameAndSemVer.semVerRange;
  }

  public getTempProjectNames(): ReadonlyArray<string> { // abstract
    return this._tempProjectNames;
  }

  /** @override */
  public hasCompatibleTopLevelDependency(dependencyName: string, versionRange: string): boolean {
    // It seems like we should normalize the key somehow, but Yarn apparently does not
    // do any normalization.
    const key: string = YarnShrinkwrapFile._encodePackageNameAndSemVer({
      packageName: dependencyName,
      semVerRange: versionRange
    });

    // Check whether this exact key appears in the shrinkwrap file
    return Object.hasOwnProperty.call(this._shrinkwrapJson, key);
  }

  /** @override */
  public tryEnsureCompatibleDependency(dependencyName: string, versionRange: string, tempProjectName: string): boolean {
    return this.hasCompatibleTopLevelDependency(dependencyName, versionRange);
  }

  /** @override */
  protected serialize(): string { // abstract
    return lockfile.stringify(this._shrinkwrapJson);
  }

  /** @override */
  protected getTopLevelDependencyVersion(dependencyName: string): string | undefined { // abstract
    throw new Error('Not implemented');
  }

  /** @override */
  protected tryEnsureDependencyVersion(dependencyName: string,
    tempProjectName: string,
    versionRange: string): string | undefined { // abstract

    throw new Error('Not implemented');
  }

  private constructor(shrinkwrapJson: IYarnShrinkwrapJson) {
    super();
    this._shrinkwrapJson = shrinkwrapJson;
    this._tempProjectNames = [];

    const seenEntries: Set<string> = new Set();

    for (const key of Object.keys(this._shrinkwrapJson)) {
      // Example key:
      const packageNameAndSemVer: IPackageNameAndSemVer = YarnShrinkwrapFile._decodePackageNameAndSemVer(key);

      // If it starts with @rush-temp, then include it:
      if (PackageName.getScope(packageNameAndSemVer.packageName) === RushConstants.rushTempNpmScope) {
        if (!/^file:/i.test(packageNameAndSemVer.semVerRange)) {
          // Sanity check to make sure this is a real package.
          // (Nobody should ever have an actual dependency on an "@rush-temp/" package.
          throw new Error('Unexpected package/semver expression found in the Yarn shrinkwrap file: '
            + JSON.stringify(key));
        }

        if (!seenEntries.add(packageNameAndSemVer.packageName)) {
          // Sanity check -- this should never happen
          throw new Error('Duplicate @rush-temp package found in the Yarn shrinkwrap file: '
            + JSON.stringify(key));
        }

        this._tempProjectNames.push(packageNameAndSemVer.packageName);

        const entry: IYarnShrinkwrapEntry = this._shrinkwrapJson[key];

        // Yarn wrongly performs integrity checking for tarball references.
        // So we need to transform this:
        //   "file:./projects/my-project.tgz#80cefe05fd715e65219d1ed481209dc4023408aa"
        // ..to this:
        //   "file:./projects/my-project.tgz"
        const indexOfHash: number = entry.resolved.indexOf('#');
        if (indexOfHash >= 0) {
          entry.resolved = entry.resolved.substring(0, indexOfHash);
        }
      }
    }

    this._tempProjectNames.sort();  // make the result deterministic
  }
}
