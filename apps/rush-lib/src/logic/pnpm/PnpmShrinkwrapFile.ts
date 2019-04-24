import * as yaml from 'js-yaml';
import * as os from 'os';
import * as semver from 'semver';
import { PackageName, FileSystem } from '@microsoft/node-core-library';

import { BaseShrinkwrapFile } from '../base/BaseShrinkwrapFile';

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
 * Given an encoded "dependency path" from the PNPM shrinkwrap file, this extracts the version component.
 * @returns a SemVer string, or undefined if the version specifier cannot be parsed
 */
export function extractVersionFromPnpmVersionSpecifier(version: string): string | undefined {
  if (!version) {
    return undefined;
  }

  // Does the string contain any slashes?
  const versionParts: string[] = version.split('/');

  if (versionParts.length === 1) {
    // No slashes

    // Does it contain the V5 underscore delimiter?
    const underscoreIndex: number = version.indexOf('_');
    if (underscoreIndex >= 0) {
      // This form was introduced in PNPM 3 (lockfile version 5):
      //
      // Example: "23.6.0_babel-core@6.26.3"
      // Example: "1.0.7_request@2.88.0"
      // Example: "1.0.3_@pnpm+logger@1.0.2"
      return version.substr(0, underscoreIndex); // e.g. "23.6.0"
    } else {
      // It is a simple version.
      //
      // Example: "0.0.5"
      return version;
    }
  }

  // Does it contain an NPM scope?
  const isScoped: boolean = versionParts[1].indexOf('@') === 0;

  if (versionParts.length === 4 && !isScoped) {
    // Example: "/gulp-karma/0.0.5/karma@0.13.22"
    // Example: "/sinon-chai/2.8.0/chai@3.5.0+sinon@1.17.7")
    return versionParts[2]; // e.g. "0.0.5"
  }

  if (versionParts.length === 5 && isScoped) {
    // Example: "/@ms/sp-client-utilities/3.1.1/foo@13.1.0"
    return versionParts[3]; // e.g. "3.1.1"
  }

  if (semver.valid(versionParts[versionParts.length - 1]) !== null) {
    // Example: "path.pkgs.visualstudio.com/@scope/depame/1.4.0"
    return versionParts[versionParts.length - 1];  // e.g. "1.4.0"
  }

  return undefined;
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
      throw new Error(`Error reading "${shrinkwrapYamlFilename}":` + os.EOL + `  ${error.message}`);
    }
  }

  public getTempProjectNames(): ReadonlyArray<string> {
    return this._getTempProjectNames(this._shrinkwrapJson.dependencies);
  }

  /**
   * Serializes the PNPM Shrinkwrap file
   */
  protected serialize(): string {
    return yaml.safeDump(this._shrinkwrapJson, SHRINKWRAP_YAML_FORMAT);
  }

  /**
   * Gets the version number from the list of top-level dependencies in the "dependencies" section
   * of the shrinkwrap file
   */
  protected getTopLevelDependencyVersion(dependencyName: string): string | undefined {
    return BaseShrinkwrapFile.tryGetValue(this._shrinkwrapJson.dependencies, dependencyName);
  }

  /**
   * Gets the resolved version number of a dependency for a specific temp project.
   * For PNPM, we can reuse the version that another project is using.
   * Note that this function modifies the shrinkwrap data.
   */
  protected tryEnsureDependencyVersion(dependencyName: string,
    tempProjectName: string,
    versionRange: string): string | undefined {
    // PNPM doesn't have the same advantage of NPM, where we can skip generate as long as the
    // shrinkwrap file puts our dependency in either the top of the node_modules folder
    // or underneath the package we are looking at.
    // This is because the PNPM shrinkwrap file describes the exact links that need to be created
    // to recreate the graph..
    // Because of this, we actually need to check for a version that this package is directly
    // linked to.

    const tempProjectDependencyKey: string = this._getTempProjectKey(tempProjectName);
    const packageDescription: IPnpmShrinkwrapDependencyYaml | undefined =
      this._getPackageDescription(tempProjectDependencyKey);
    if (!packageDescription) {
      return undefined;
    }

    if (!packageDescription.dependencies.hasOwnProperty(dependencyName)) {
      if (versionRange) {
        // this means the current temp project doesn't provide this dependency,
        // however, we may be able to use a different version. we prefer the latest version
        let latestVersion: string | undefined = undefined;

        this.getTempProjectNames().forEach((otherTempProject: string) => {
          const otherVersion: string | undefined = this._getDependencyVersion(dependencyName, otherTempProject);
          if (otherVersion && semver.satisfies(otherVersion, versionRange)) {
            if (!latestVersion || semver.gt(otherVersion, latestVersion)) {
              latestVersion = otherVersion;
            }
          }
        });

        if (latestVersion) {
          // go ahead and fixup the shrinkwrap file to point at this
          const dependencies: { [key: string]: string } | undefined =
            this._shrinkwrapJson.packages[tempProjectDependencyKey].dependencies || {};
          dependencies[dependencyName] = latestVersion;
          this._shrinkwrapJson.packages[tempProjectDependencyKey].dependencies = dependencies;

          return latestVersion;
        }
      }

      return undefined;
    }

    return this._normalizeDependencyVersion(dependencyName, packageDescription.dependencies[dependencyName]);
  }

  protected checkValidVersionRange(dependencyVersion: string, versionRange: string): boolean { // override
    // dependencyVersion could be a relative or absolute path, for those cases we
    // need to extract the version from the end of the path.
    return super.checkValidVersionRange(dependencyVersion.split('/').pop()!, versionRange);
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
  private _getDependencyVersion(dependencyName: string, tempProjectName: string): string | undefined {
    const tempProjectDependencyKey: string = this._getTempProjectKey(tempProjectName);
    const packageDescription: IPnpmShrinkwrapDependencyYaml | undefined =
      this._getPackageDescription(tempProjectDependencyKey);
    if (!packageDescription) {
      return undefined;
    }

    if (!packageDescription.dependencies.hasOwnProperty(dependencyName)) {
      return undefined;
    }

    return this._normalizeDependencyVersion(dependencyName, packageDescription.dependencies[dependencyName]);
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

  private _getTempProjectKey(tempProjectName: string): string {
    // Example: "project1"
    const unscopedTempProjectName: string = PackageName.getUnscopedName(tempProjectName);
    return `file:projects/${unscopedTempProjectName}.tgz`;
  }

  private _normalizeDependencyVersion(dependencyName: string, version: string): string | undefined {
    if (version) {
      const extractedVersion: string | undefined = extractVersionFromPnpmVersionSpecifier(version);

      if (!extractedVersion) {
        throw new Error(`Cannot parse pnpm shrinkwrap version specifier: `
          + `"${version}" for "${dependencyName}"`);
      }

      return extractedVersion;
    } else {
      return undefined;
    }
  }
}
