import * as yaml from 'js-yaml';
import * as os from 'os';
import * as semver from 'semver';
import { FileSystem } from '@microsoft/node-core-library';

import { BaseShrinkwrapFile } from '../base/BaseShrinkwrapFile';
import { DependencySpecifier } from '../DependencySpecifier';

// This is based on PNPM's own configuration:
// https://github.com/pnpm/pnpm-shrinkwrap/blob/master/src/write.ts
const SHRINKWRAP_YAML_FORMAT: yaml.DumpOptions = {
  lineWidth: 1000,
  noCompatMode: true,
  noRefs: true,
  sortKeys: true
};

interface IPnpmShrinkwrapDependencyYaml {
  /** Information about the resolved package */
  resolution: {
    /** The hash of the tarball, to ensure archive integrity */
    integrity: string;
    /** The name of the tarball, if this was from a TGX file */
    tarball?: string;
  };
  /** The list of dependencies and the resolved version */
  dependencies: { [dependency: string]: string };
}

/**
 * This interface represents the raw pnpm-lock.YAML file
 * Example:
 *  {
 *    "dependencies": {
 *      "@rush-temp/project1": "file:./projects/project1.tgz"
 *    },
 *    "packages": {
 *      "file:projects/library1.tgz": {
 *        "dependencies: {
 *          "markdown": "0.5.0"
 *        },
 *        "name": "@rush-temp/library1",
 *        "resolution": {
 *          "tarball": "file:projects/library1.tgz"
 *        },
 *        "version": "0.0.0"
 *      },
 *      "markdown/0.5.0": {
 *        "resolution": {
 *          "integrity": "sha1-KCBbVlqK51kt4gdGPWY33BgnIrI="
 *        }
 *      }
 *    },
 *    "registry": "http://localhost:4873/",
 *    "shrinkwrapVersion": 3,
 *    "specifiers": {
 *      "@rush-temp/project1": "file:./projects/project1.tgz"
 *    }
 *  }
 */
interface IPnpmShrinkwrapYaml {
  /** The list of resolved version numbers for direct dependencies */
  dependencies: { [dependency: string]: string };
  /** The description of the solved graph */
  packages: { [dependencyVersion: string]: IPnpmShrinkwrapDependencyYaml };
  /** URL of the registry which was used */
  registry: string;
  /** The list of specifiers used to resolve direct dependency versions */
  specifiers: { [dependency: string]: string };
}

/**
 * Given an encoded "dependency key" from the PNPM shrinkwrap file, this parses it into an equivalent
 * DependencySpecifier.
 *
 * @returns a SemVer string, or undefined if the version specifier cannot be parsed
 */
export function parsePnpmDependencyKey(dependencyName: string, dependencyKey: string): DependencySpecifier | undefined {
  if (!dependencyKey) {
    return undefined;
  }

  if (/^\w+:/.test(dependencyKey)) {
    // If it starts with an NPM scheme such as "file:projects/my-app.tgz", we don't support that
    return undefined;
  }

  // The package name parsed from the dependency key, or dependencyName if it was omitted.
  // Example: "@scope/depame"
  let parsedPackageName: string;

  // The trailing portion of the dependency key that includes the version and optional peer dependency path.
  // Example: "2.8.0/chai@3.5.0+sinon@1.17.7"
  let parsedInstallPath: string;

  // Example: "path.pkgs.visualstudio.com/@scope/depame/1.4.0"  --> 0="@scope/depame" 1="1.4.0"
  // Example: "/isarray/2.0.1"                                  --> 0="isarray"       1="2.0.1"
  // Example: "/sinon-chai/2.8.0/chai@3.5.0+sinon@1.17.7"       --> 0="sinon-chai"    1="2.8.0/chai@3.5.0+sinon@1.17.7"
  const packageNameMatch: RegExpMatchArray | null = /^[^\/]*\/((?:@[^\/]+\/)?[^\/]+)\/(.*)$/.exec(dependencyKey);
  if (packageNameMatch) {
    parsedPackageName = packageNameMatch[1];
    parsedInstallPath = packageNameMatch[2];
  } else {
    parsedPackageName = dependencyName;

    // Example: "23.6.0_babel-core@6.26.3"
    // Example: "23.6.0"
    parsedInstallPath = dependencyKey;
  }

  // The SemVer value
  // Example: "2.8.0"
  let parsedVersionPart: string;

  // Example: "23.6.0_babel-core@6.26.3" --> "23.6.0"
  // Example: "2.8.0/chai@3.5.0+sinon@1.17.7" --> "2.8.0"
  const versionMatch: RegExpMatchArray | null = /^([^\/_]+)[\/_]/.exec(parsedInstallPath);
  if (versionMatch) {
    parsedVersionPart = versionMatch[1];
  } else {
    // Example: "2.8.0"
    parsedVersionPart = parsedInstallPath;
  }

  // By this point, we expect parsedVersionPart to be a valid SemVer range
  if (!parsedVersionPart) {
    return undefined;
  }

  if (!semver.valid(parsedVersionPart)) {
    return undefined;
  }

  // Is it an alias for a different package?
  if (parsedPackageName === dependencyName) {
    // No, it's a regular dependency
    return new DependencySpecifier(parsedPackageName, parsedVersionPart);
  } else {
    // If the parsed package name is different from the dependencyName, then this is an NPM package alias
    return new DependencySpecifier(dependencyName, `npm:${parsedPackageName}@${parsedVersionPart}`);
  }
}

export class PnpmShrinkwrapFile extends BaseShrinkwrapFile {
  private _shrinkwrapJson: IPnpmShrinkwrapYaml;

  public static loadFromFile(shrinkwrapYamlFilename: string): PnpmShrinkwrapFile | undefined {
    try {
      if (!FileSystem.exists(shrinkwrapYamlFilename)) {
        return undefined; // file does not exist
      }

      // We don't use JsonFile/jju here because shrinkwrap.json is a special NPM file format
      // and typically very large, so we want to load it the same way that NPM does.
      const parsedData: IPnpmShrinkwrapYaml = yaml.safeLoad(FileSystem.readFile(shrinkwrapYamlFilename).toString());

      return new PnpmShrinkwrapFile(parsedData);
    } catch (error) {
      throw new Error(`Error reading "${shrinkwrapYamlFilename}":${os.EOL}  ${error.message}`);
    }
  }

  /** @override */
  public getTempProjectNames(): ReadonlyArray<string> {
    return this._getTempProjectNames(this._shrinkwrapJson.dependencies);
  }

  /**
   * Gets the path to the tarball file if the package is a tarball.
   * Returns undefined if the package entry doesn't exist or the package isn't a tarball.
   * Example of return value: file:projects/build-tools.tgz
   */
  public getTarballPath(packageName: string): string | undefined {
    const dependency: IPnpmShrinkwrapDependencyYaml = this._shrinkwrapJson.packages[packageName];

    if (!dependency) {
      return undefined;
    }

    return dependency.resolution.tarball;
  }

  /**
   * Gets the version number from the list of top-level dependencies in the "dependencies" section
   * of the shrinkwrap file. Sample return values:
   *   '2.1.113'
   *   '1.9.0-dev.27_typescript@2.9.2'
   *   '5.0.0_25c559a5921686293a001a397be4dce0'
   *   'file:projects/empty-webpart-project.tgz'
   *   'file:projects/article-site-demo.tgz_jest@22.4.4+typescript@2.9.2'
   *   'file:projects/i18n-utilities.tgz_462eaf34881863298955eb323c130fc7'
   *   undefined
   *
   * @override
   */
  public getTopLevelDependencyVersion(dependencyName: string): DependencySpecifier | undefined {
    const value: string | undefined = BaseShrinkwrapFile.tryGetValue(this._shrinkwrapJson.dependencies, dependencyName);
    if (value) {
      return new DependencySpecifier(dependencyName, value);
    }
    return undefined;
  }

  /**
   * The PNPM shrinkwrap file has top-level dependencies on the temp projects like this:
   *
   * ```
   * dependencies:
   *   '@rush-temp/my-app': 'file:projects/my-app.tgz'
   * packages:
   *   /@types/node/10.14.15:
   *     dev: false
   *   'file:projects/my-app.tgz':
   *     dev: false
   *     name: '@rush-temp/my-app'
   *     version: 0.0.0
   * ```
   *
   * We refer to "file:projects/my-app.tgz" as the temp project dependency key.
   */
  public getTempProjectDependencyKey(tempProjectName: string): string | undefined {
    const tempProjectSpecifier: DependencySpecifier | undefined = this.getTopLevelDependencyVersion(tempProjectName);
    if (tempProjectSpecifier) {
      return tempProjectSpecifier.versionSpecifier;
    }
    return undefined;
  }

  /**
   * Serializes the PNPM Shrinkwrap file
   *
   * @override
   */
  protected serialize(): string {
    return yaml.safeDump(this._shrinkwrapJson, SHRINKWRAP_YAML_FORMAT);
  }

  /**
   * Gets the resolved version number of a dependency for a specific temp project.
   * For PNPM, we can reuse the version that another project is using.
   * Note that this function modifies the shrinkwrap data.
   *
   * @override
   */
  protected tryEnsureDependencyVersion(dependencySpecifier: DependencySpecifier,
    tempProjectName: string): DependencySpecifier | undefined {

    // PNPM doesn't have the same advantage of NPM, where we can skip generate as long as the
    // shrinkwrap file puts our dependency in either the top of the node_modules folder
    // or underneath the package we are looking at.
    // This is because the PNPM shrinkwrap file describes the exact links that need to be created
    // to recreate the graph..
    // Because of this, we actually need to check for a version that this package is directly
    // linked to.

    const packageName: string = dependencySpecifier.packageName;

    const tempProjectDependencyKey: string | undefined = this.getTempProjectDependencyKey(tempProjectName);
    if (!tempProjectDependencyKey) {
      return undefined;
    }

    const packageDescription: IPnpmShrinkwrapDependencyYaml | undefined =
      this._getPackageDescription(tempProjectDependencyKey);
    if (!packageDescription) {
      return undefined;
    }

    if (!packageDescription.dependencies.hasOwnProperty(packageName)) {
      if (dependencySpecifier.versionSpecifier) {
        // this means the current temp project doesn't provide this dependency,
        // however, we may be able to use a different version. we prefer the latest version
        let latestVersion: string | undefined = undefined;

        for (const otherTempProject of this.getTempProjectNames()) {
          const otherVersionSpecifier: DependencySpecifier | undefined = this._getDependencyVersion(
            dependencySpecifier.packageName, otherTempProject);

          if (otherVersionSpecifier) {
            const otherVersion: string = otherVersionSpecifier.versionSpecifier;

            if (semver.satisfies(otherVersion, dependencySpecifier.versionSpecifier)) {
              if (!latestVersion || semver.gt(otherVersion, latestVersion)) {
                latestVersion = otherVersion;
              }
            }
          }
        }

        if (latestVersion) {
          // go ahead and fixup the shrinkwrap file to point at this
          const dependencies: { [key: string]: string } | undefined =
            this._shrinkwrapJson.packages[tempProjectDependencyKey].dependencies || {};
          dependencies[packageName] = latestVersion;
          this._shrinkwrapJson.packages[tempProjectDependencyKey].dependencies = dependencies;

          return new DependencySpecifier(dependencySpecifier.packageName, latestVersion);
        }
      }

      return undefined;
    }

    const dependencyKey: string = packageDescription.dependencies[packageName];
    return this._parsePnpmDependencyKey(packageName, dependencyKey);
  }

  private constructor(shrinkwrapJson: IPnpmShrinkwrapYaml) {
    super();
    this._shrinkwrapJson = shrinkwrapJson;

    // Normalize the data
    if (!this._shrinkwrapJson.registry) {
      this._shrinkwrapJson.registry = '';
    }
    if (!this._shrinkwrapJson.dependencies) {
      this._shrinkwrapJson.dependencies = { };
    }
    if (!this._shrinkwrapJson.specifiers) {
      this._shrinkwrapJson.specifiers = { };
    }
    if (!this._shrinkwrapJson.packages) {
      this._shrinkwrapJson.packages = { };
    }
  }

  /**
   * Returns the version of a dependency being used by a given project
   */
  private _getDependencyVersion(dependencyName: string, tempProjectName: string): DependencySpecifier | undefined {
    const tempProjectDependencyKey: string | undefined = this.getTempProjectDependencyKey(tempProjectName);
    if (!tempProjectDependencyKey) {
      throw new Error(`Cannot get dependency key for temp project: ${tempProjectName}`);
    }

    const packageDescription: IPnpmShrinkwrapDependencyYaml | undefined =
      this._getPackageDescription(tempProjectDependencyKey);
    if (!packageDescription) {
      return undefined;
    }

    if (!packageDescription.dependencies.hasOwnProperty(dependencyName)) {
      return undefined;
    }

    return this._parsePnpmDependencyKey(dependencyName, packageDescription.dependencies[dependencyName]);
  }

  /**
   * Gets the package description for a tempProject from the shrinkwrap file.
   */
  private _getPackageDescription(tempProjectDependencyKey: string): IPnpmShrinkwrapDependencyYaml | undefined {
    const packageDescription: IPnpmShrinkwrapDependencyYaml | undefined
      = BaseShrinkwrapFile.tryGetValue(this._shrinkwrapJson.packages, tempProjectDependencyKey);

    if (!packageDescription || !packageDescription.dependencies) {
      return undefined;
    }

    return packageDescription;
  }

  private _parsePnpmDependencyKey(dependencyName: string, pnpmDependencyKey: string): DependencySpecifier | undefined {

    if (pnpmDependencyKey) {
      const result: DependencySpecifier | undefined = parsePnpmDependencyKey(dependencyName, pnpmDependencyKey);

      if (!result) {
        throw new Error(`Cannot parse PNPM shrinkwrap version specifier: "${pnpmDependencyKey}"`
          + ` for "${dependencyName}"`);
      }

      return result;
    } else {
      return undefined;
    }
  }
}
