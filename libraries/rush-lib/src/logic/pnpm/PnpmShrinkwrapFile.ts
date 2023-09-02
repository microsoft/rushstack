// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as semver from 'semver';
import crypto from 'crypto';
import colors from 'colors/safe';
import {
  FileSystem,
  AlreadyReportedError,
  Import,
  Path,
  IPackageJson,
  InternalError
} from '@rushstack/node-core-library';

import { BaseShrinkwrapFile } from '../base/BaseShrinkwrapFile';
import { DependencySpecifier } from '../DependencySpecifier';
import { RushConfiguration } from '../../api/RushConfiguration';
import { IShrinkwrapFilePolicyValidatorOptions } from '../policy/ShrinkwrapFilePolicy';
import { PNPM_SHRINKWRAP_YAML_FORMAT } from './PnpmYamlCommon';
import { RushConstants } from '../RushConstants';
import { IExperimentsJson } from '../../api/ExperimentsConfiguration';
import { DependencyType, PackageJsonDependency, PackageJsonEditor } from '../../api/PackageJsonEditor';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { PnpmfileConfiguration } from './PnpmfileConfiguration';
import { PnpmProjectShrinkwrapFile } from './PnpmProjectShrinkwrapFile';
import { PackageManagerOptionsConfigurationBase } from '../base/BasePackageManagerOptionsConfiguration';
import { PnpmOptionsConfiguration } from './PnpmOptionsConfiguration';

const yamlModule: typeof import('js-yaml') = Import.lazy('js-yaml', require);

export interface IPeerDependenciesMetaYaml {
  optional?: boolean;
}

export type IPnpmV7VersionSpecifier = string;
export interface IPnpmV8VersionSpecifier {
  version: string;
  specifier: string;
}
export type IPnpmVersionSpecifier = IPnpmV7VersionSpecifier | IPnpmV8VersionSpecifier;

export interface IPnpmShrinkwrapDependencyYaml {
  /** Information about the resolved package */
  resolution?: {
    /** The hash of the tarball, to ensure archive integrity */
    integrity: string;
    /** The name of the tarball, if this was from a TGX file */
    tarball?: string;
  };
  /** The list of dependencies and the resolved version */
  dependencies?: Record<string, IPnpmVersionSpecifier>;
  /** The list of optional dependencies and the resolved version */
  optionalDependencies?: Record<string, IPnpmVersionSpecifier>;
  /** The list of peer dependencies and the resolved version */
  peerDependencies?: Record<string, IPnpmVersionSpecifier>;
  /**
   * Used to indicate optional peer dependencies, as described in this RFC:
   * https://github.com/yarnpkg/rfcs/blob/master/accepted/0000-optional-peer-dependencies.md
   */
  peerDependenciesMeta?: Record<string, IPeerDependenciesMetaYaml>;
}

export interface IPnpmShrinkwrapImporterYaml {
  /** The list of resolved version numbers for direct dependencies */
  dependencies?: Record<string, IPnpmVersionSpecifier>;
  /** The list of resolved version numbers for dev dependencies */
  devDependencies?: Record<string, IPnpmVersionSpecifier>;
  /** The list of resolved version numbers for optional dependencies */
  optionalDependencies?: Record<string, IPnpmVersionSpecifier>;
  /**
   * The list of specifiers used to resolve dependency versions
   *
   * @remarks
   * This has been removed in PNPM v8
   */
  specifiers?: Record<string, IPnpmVersionSpecifier>;
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
export interface IPnpmShrinkwrapYaml {
  /** The version of the lockfile format */
  lockfileVersion?: string | number;
  /** The list of resolved version numbers for direct dependencies */
  dependencies: Record<string, string>;
  /** The list of importers for local workspace projects */
  importers: Record<string, IPnpmShrinkwrapImporterYaml>;
  /** The description of the solved graph */
  packages: Record<string, IPnpmShrinkwrapDependencyYaml>;
  /** URL of the registry which was used */
  registry: string;
  /** The list of specifiers used to resolve direct dependency versions */
  specifiers: Record<string, string>;
  /** The list of override version number for dependencies */
  overrides?: { [dependency: string]: string };
}

/**
 * Given an encoded "dependency key" from the PNPM shrinkwrap file, this parses it into an equivalent
 * DependencySpecifier.
 *
 * @returns a SemVer string, or undefined if the version specifier cannot be parsed
 */
export function parsePnpmDependencyKey(
  dependencyName: string,
  versionSpecifier: IPnpmVersionSpecifier
): DependencySpecifier | undefined {
  if (!versionSpecifier) {
    return undefined;
  }

  const dependencyKey: string = normalizePnpmVersionSpecifier(versionSpecifier);

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
  // Example: "/typescript@5.1.6"                               --> 0=typescript      1="5.1.6"
  // Example: 1.2.3_peer-dependency@.4.5.6                      --> no match
  // Example: 1.2.3_@scope+peer-dependency@.4.5.6               --> no match
  // Example: 1.2.3(peer-dependency@.4.5.6)                     --> no match
  // Example: 1.2.3(@scope/peer-dependency@.4.5.6)              --> no match
  const packageNameMatch: RegExpMatchArray | null = /^[^\/(]*\/((?:@[^\/(]+\/)?[^\/(]+)[\/@](.*)$/.exec(
    dependencyKey
  );
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
  // Example: "0.53.1(@types/node@14.18.36)" --> "0.53.1"
  const versionMatch: RegExpMatchArray | null = /^([^\(\/_]+)[(\/_]/.exec(parsedInstallPath);
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
    const urlRegex: RegExp =
      /^(git@|@)?([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}(\/|\+)([^\/\\]+\/?)*([^\/\\]+)$/i;
    // Test for urls:
    // Examples:
    //     @github.com/abc/def/188ed64efd5218beda276e02f2277bf3a6b745b2
    //     github.com/abc/def/188ed64efd5218beda276e02f2277bf3a6b745b2
    //     github.com.au/abc/def/188ed64efd5218beda276e02f2277bf3a6b745b2
    //     bitbucket.com/abc/def/188ed64efd5218beda276e02f2277bf3a6b745b2
    //     bitbucket.com+abc/def/188ed64efd5218beda276e02f2277bf3a6b745b2
    //     git@bitbucket.com+abc/def/188ed64efd5218beda276e02f2277bf3a6b745b2
    //     bitbucket.co.in/abc/def/188ed64efd5218beda276e02f2277bf3a6b745b2
    if (urlRegex.test(dependencyKey)) {
      const dependencySpecifier: DependencySpecifier = new DependencySpecifier(dependencyName, dependencyKey);
      return dependencySpecifier;
    } else {
      return undefined;
    }
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

export function normalizePnpmVersionSpecifier(versionSpecifier: IPnpmVersionSpecifier): string {
  if (typeof versionSpecifier === 'string') {
    return versionSpecifier;
  } else {
    return versionSpecifier.version;
  }
}

export class PnpmShrinkwrapFile extends BaseShrinkwrapFile {
  public readonly shrinkwrapFileMajorVersion: number;
  public readonly isWorkspaceCompatible: boolean;
  public readonly registry: string;
  public readonly dependencies: ReadonlyMap<string, IPnpmVersionSpecifier>;
  public readonly importers: ReadonlyMap<string, IPnpmShrinkwrapImporterYaml>;
  public readonly specifiers: ReadonlyMap<string, string>;
  public readonly packages: ReadonlyMap<string, IPnpmShrinkwrapDependencyYaml>;
  public readonly overrides: ReadonlyMap<string, string>;

  private readonly _shrinkwrapJson: IPnpmShrinkwrapYaml;
  private readonly _integrities: Map<string, Map<string, string>>;
  private _pnpmfileConfiguration: PnpmfileConfiguration | undefined;

  private constructor(shrinkwrapJson: IPnpmShrinkwrapYaml) {
    super();
    this._shrinkwrapJson = shrinkwrapJson;

    // Normalize the data
    const lockfileVersion: string | number | undefined = shrinkwrapJson.lockfileVersion;
    if (typeof lockfileVersion === 'string') {
      this.shrinkwrapFileMajorVersion = parseInt(
        lockfileVersion.substring(0, lockfileVersion.indexOf('.')),
        10
      );
    } else if (typeof lockfileVersion === 'number') {
      this.shrinkwrapFileMajorVersion = lockfileVersion;
    } else {
      this.shrinkwrapFileMajorVersion = 0;
    }

    this.registry = shrinkwrapJson.registry || '';
    this.dependencies = new Map(Object.entries(shrinkwrapJson.dependencies || {}));
    this.importers = new Map(Object.entries(shrinkwrapJson.importers || {}));
    this.specifiers = new Map(Object.entries(shrinkwrapJson.specifiers || {}));
    this.packages = new Map(Object.entries(shrinkwrapJson.packages || {}));
    this.overrides = new Map(Object.entries(shrinkwrapJson.overrides || {}));

    // Importers only exist in workspaces
    this.isWorkspaceCompatible = this.importers.size > 0;

    this._integrities = new Map();
  }

  public static loadFromFile(shrinkwrapYamlFilename: string): PnpmShrinkwrapFile | undefined {
    try {
      const shrinkwrapContent: string = FileSystem.readFile(shrinkwrapYamlFilename);
      return PnpmShrinkwrapFile.loadFromString(shrinkwrapContent);
    } catch (error) {
      if (FileSystem.isNotExistError(error as Error)) {
        return undefined; // file does not exist
      }
      throw new Error(`Error reading "${shrinkwrapYamlFilename}":\n  ${(error as Error).message}`);
    }
  }

  public static loadFromString(shrinkwrapContent: string): PnpmShrinkwrapFile {
    const parsedData: IPnpmShrinkwrapYaml = yamlModule.safeLoad(shrinkwrapContent);
    return new PnpmShrinkwrapFile(parsedData);
  }

  public getShrinkwrapHash(experimentsConfig?: IExperimentsJson): string {
    // The 'omitImportersFromPreventManualShrinkwrapChanges' experiment skips the 'importers' section
    // when computing the hash, since the main concern is changes to the overall external dependency footprint
    const { omitImportersFromPreventManualShrinkwrapChanges } = experimentsConfig || {};

    const shrinkwrapContent: string = this._serializeInternal(
      omitImportersFromPreventManualShrinkwrapChanges
    );
    return crypto.createHash('sha1').update(shrinkwrapContent).digest('hex');
  }

  /** @override */
  public validate(
    packageManagerOptionsConfig: PackageManagerOptionsConfigurationBase,
    policyOptions: IShrinkwrapFilePolicyValidatorOptions,
    experimentsConfig?: IExperimentsJson
  ): void {
    super.validate(packageManagerOptionsConfig, policyOptions);
    if (!(packageManagerOptionsConfig instanceof PnpmOptionsConfiguration)) {
      throw new Error('The provided package manager options are not valid for PNPM shrinkwrap files.');
    }

    if (!policyOptions.allowShrinkwrapUpdates) {
      if (!policyOptions.repoState.isValid) {
        console.log(
          colors.red(
            `The ${RushConstants.repoStateFilename} file is invalid. There may be a merge conflict marker ` +
              'in the file. You may need to run "rush update" to refresh its contents.'
          ) + '\n'
        );
        throw new AlreadyReportedError();
      }

      // Only check the hash if allowShrinkwrapUpdates is false. If true, the shrinkwrap file
      // may have changed and the hash could be invalid.
      if (packageManagerOptionsConfig.preventManualShrinkwrapChanges) {
        if (!policyOptions.repoState.pnpmShrinkwrapHash) {
          console.log(
            colors.red(
              'The existing shrinkwrap file hash could not be found. You may need to run "rush update" to ' +
                'populate the hash. See the "preventManualShrinkwrapChanges" setting documentation for details.'
            ) + '\n'
          );
          throw new AlreadyReportedError();
        }

        if (this.getShrinkwrapHash(experimentsConfig) !== policyOptions.repoState.pnpmShrinkwrapHash) {
          console.log(
            colors.red(
              'The shrinkwrap file hash does not match the expected hash. Please run "rush update" to ensure the ' +
                'shrinkwrap file is up to date. See the "preventManualShrinkwrapChanges" setting documentation for ' +
                'details.'
            ) + '\n'
          );
          throw new AlreadyReportedError();
        }
      }
    }
  }

  /** @override */
  public getTempProjectNames(): ReadonlyArray<string> {
    return this._getTempProjectNames(this._shrinkwrapJson.dependencies || {});
  }

  /**
   * Gets the path to the tarball file if the package is a tarball.
   * Returns undefined if the package entry doesn't exist or the package isn't a tarball.
   * Example of return value: file:projects/build-tools.tgz
   */
  public getTarballPath(packageName: string): string | undefined {
    const dependency: IPnpmShrinkwrapDependencyYaml | undefined = this.packages.get(packageName);
    return dependency?.resolution?.tarball;
  }

  public getTopLevelDependencyKey(dependencyName: string): IPnpmVersionSpecifier | undefined {
    return this.dependencies.get(dependencyName);
  }

  /**
   * Gets the version number from the list of top-level dependencies in the "dependencies" section
   * of the shrinkwrap file. Sample return values:
   *   '2.1.113'
   *   '1.9.0-dev.27'
   *   'file:projects/empty-webpart-project.tgz'
   *   undefined
   *
   * @override
   */
  public getTopLevelDependencyVersion(dependencyName: string): DependencySpecifier | undefined {
    let value: IPnpmVersionSpecifier | undefined = this.dependencies.get(dependencyName);
    if (value) {
      value = normalizePnpmVersionSpecifier(value);

      // Getting the top level dependency version from a PNPM lockfile version 5.x or 6.1
      // --------------------------------------------------------------------------
      //
      // 1) Top-level tarball dependency entries in pnpm-lock.yaml look like in 5.x:
      //    ```
      //    '@rush-temp/sp-filepicker': 'file:projects/sp-filepicker.tgz_0ec79d3b08edd81ebf49cd19ca50b3f5'
      //    ```
      //    And in version 6.1, they look like:
      //    ```
      //    '@rush-temp/sp-filepicker':
      //      specifier: file:./projects/generate-api-docs.tgz
      //      version: file:projects/generate-api-docs.tgz
      //    ```

      //    Then, it would be defined below (version 5.x):
      //    ```
      //    'file:projects/sp-filepicker.tgz_0ec79d3b08edd81ebf49cd19ca50b3f5':
      //      dependencies:
      //       '@microsoft/load-themed-styles': 1.10.7
      //       ...
      //      resolution:
      //       integrity: sha512-guuoFIc**==
      //       tarball: 'file:projects/sp-filepicker.tgz'
      //    ```
      //    Or in version 6.1:
      //    ```
      //    file:projects/sp-filepicker.tgz:
      //      resolution: {integrity: sha512-guuoFIc**==, tarball: file:projects/sp-filepicker.tgz}
      //      name: '@rush-temp/sp-filepicker'
      //      version: 0.0.0
      //      dependencies:
      //        '@microsoft/load-themed-styles': 1.10.7
      //        ...
      //      dev: false
      //    ```

      //    Here, we are interested in the part 'file:projects/sp-filepicker.tgz'. Splitting by underscores is not the
      //    best way to get this because file names could have underscores in them. Instead, we could use the tarball
      //    field in the resolution section.

      // 2) Top-level non-tarball dependency entries in pnpm-lock.yaml would look like in 5.x:
      //    ```
      //    '@rushstack/set-webpack-public-path-plugin': 2.1.133
      //    @microsoft/sp-build-node': 1.9.0-dev.27_typescript@2.9.2
      //    ```
      //    And in version 6.1, they look like:
      //    ```
      //    '@rushstack/set-webpack-public-path-plugin':
      //      specifier: ^2.1.133
      //      version: 2.1.133
      //    '@microsoft/sp-build-node':
      //      specifier: 1.9.0-dev.27
      //      version: 1.9.0-dev.27(typescript@2.9.2)
      //    ```

      //    Here, we could either just split by underscores and take the first part (5.x) or use the specifier field
      //    (6.1).

      // The below code is also compatible with lockfile versions < 5.1

      const dependency: IPnpmShrinkwrapDependencyYaml | undefined = this.packages.get(value);
      if (dependency?.resolution?.tarball && value.startsWith(dependency.resolution.tarball)) {
        return new DependencySpecifier(dependencyName, dependency.resolution.tarball);
      } else {
        let underscoreOrParenthesisIndex: number = value.indexOf('_');
        if (underscoreOrParenthesisIndex < 0) {
          underscoreOrParenthesisIndex = value.indexOf('(');
        }

        if (underscoreOrParenthesisIndex >= 0) {
          value = value.substring(0, underscoreOrParenthesisIndex);
        }
      }

      return new DependencySpecifier(dependencyName, value);
    }
    return undefined;
  }

  /**
   * The PNPM shrinkwrap file has top-level dependencies on the temp projects like this (version 5.x):
   *
   * ```
   * dependencies:
   *   '@rush-temp/my-app': 'file:projects/my-app.tgz_25c559a5921686293a001a397be4dce0'
   * packages:
   *   /@types/node/10.14.15:
   *     dev: false
   *   'file:projects/my-app.tgz_25c559a5921686293a001a397be4dce0':
   *     dev: false
   *     name: '@rush-temp/my-app'
   *     version: 0.0.0
   * ```
   *
   * or in version 6.1, like this:
   * ```
   * dependencies:
   *  '@rush-temp/my-app':
   *    specifier: file:./projects/my-app.tgz
   *    version: file:projects/my-app.tgz
   *  packages:
   *    /@types/node@10.14.15:
   *      resolution: {integrity: sha512-iAB+**==}
   *      dev: false
   *    file:projects/my-app.tgz
   *      resolution: {integrity: sha512-guuoFIc**==, tarball: file:projects/sp-filepicker.tgz}
   *      name: '@rush-temp/my-app'
   *      version: 0.0.0
   *      dependencies:
   *        '@microsoft/load-themed-styles': 1.10.7
   *        ...
   *      dev: false
   * ```
   *
   * We refer to 'file:projects/my-app.tgz_25c559a5921686293a001a397be4dce0' or 'file:projects/my-app.tgz' as
   * the temp project dependency key of the temp project '@rush-temp/my-app'.
   */
  public getTempProjectDependencyKey(tempProjectName: string): string | undefined {
    const tempProjectDependencyKey: IPnpmVersionSpecifier | undefined =
      this.dependencies.get(tempProjectName);
    return tempProjectDependencyKey ? normalizePnpmVersionSpecifier(tempProjectDependencyKey) : undefined;
  }

  public getShrinkwrapEntryFromTempProjectDependencyKey(
    tempProjectDependencyKey: string
  ): IPnpmShrinkwrapDependencyYaml | undefined {
    return this.packages.get(tempProjectDependencyKey);
  }

  public getShrinkwrapEntry(
    name: string,
    version: IPnpmVersionSpecifier
  ): IPnpmShrinkwrapDependencyYaml | undefined {
    const packageId: string = this._getPackageId(name, version);
    return this.packages.get(packageId);
  }

  /**
   * Serializes the PNPM Shrinkwrap file
   *
   * @override
   */
  protected serialize(): string {
    return this._serializeInternal(false);
  }

  /**
   * Gets the resolved version number of a dependency for a specific temp project.
   * For PNPM, we can reuse the version that another project is using.
   * Note that this function modifies the shrinkwrap data if tryReusingPackageVersionsFromShrinkwrap is set to true.
   *
   * @override
   */
  protected tryEnsureDependencyVersion(
    dependencySpecifier: DependencySpecifier,
    tempProjectName: string
  ): DependencySpecifier | undefined {
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
    if (
      !packageDescription ||
      !packageDescription.dependencies ||
      !packageDescription.dependencies.hasOwnProperty(packageName)
    ) {
      return undefined;
    }

    const dependencyKey: IPnpmVersionSpecifier = packageDescription.dependencies[packageName];
    return this._parsePnpmDependencyKey(packageName, dependencyKey);
  }

  /** @override */
  public findOrphanedProjects(rushConfiguration: RushConfiguration): ReadonlyArray<string> {
    // The base shrinkwrap handles orphaned projects the same across all package managers,
    // but this is only valid for non-workspace installs
    if (!this.isWorkspaceCompatible) {
      return super.findOrphanedProjects(rushConfiguration);
    }

    const orphanedProjectPaths: string[] = [];
    for (const importerKey of this.getImporterKeys()) {
      // PNPM importer keys are relative paths from the workspace root, which is the common temp folder
      const rushProjectPath: string = path.resolve(rushConfiguration.commonTempFolder, importerKey);
      if (!rushConfiguration.tryGetProjectForPath(rushProjectPath)) {
        orphanedProjectPaths.push(rushProjectPath);
      }
    }
    return orphanedProjectPaths;
  }

  /** @override */
  public getProjectShrinkwrap(project: RushConfigurationProject): PnpmProjectShrinkwrapFile {
    return new PnpmProjectShrinkwrapFile(this, project);
  }

  public *getImporterKeys(): Iterable<string> {
    // Filter out the root importer used for the generated package.json in the root
    // of the install, since we do not use this.
    for (const key of this.importers.keys()) {
      if (key !== '.') {
        yield key;
      }
    }
  }

  public getImporterKeyByPath(workspaceRoot: string, projectFolder: string): string {
    return Path.convertToSlashes(path.relative(workspaceRoot, projectFolder));
  }

  public getImporter(importerKey: string): IPnpmShrinkwrapImporterYaml | undefined {
    return this.importers.get(importerKey);
  }

  public getIntegrityForImporter(importerKey: string): Map<string, string> | undefined {
    // This logic formerly lived in PnpmProjectShrinkwrapFile. Moving it here allows caching of the external
    // dependency integrity relationships across projects
    let integrityMap: Map<string, string> | undefined = this._integrities.get(importerKey);
    if (!integrityMap) {
      const importer: IPnpmShrinkwrapImporterYaml | undefined = this.getImporter(importerKey);
      if (importer) {
        integrityMap = new Map();
        this._integrities.set(importerKey, integrityMap);

        const sha256Digest: string = crypto
          .createHash('sha256')
          .update(JSON.stringify(importer))
          .digest('base64');
        const selfIntegrity: string = `${importerKey}:${sha256Digest}:`;
        integrityMap.set(importerKey, selfIntegrity);

        const { dependencies, devDependencies, optionalDependencies } = importer;

        const externalFilter: (name: string, version: IPnpmVersionSpecifier) => boolean = (
          name: string,
          versionSpecifier: IPnpmVersionSpecifier
        ): boolean => {
          const version: string = normalizePnpmVersionSpecifier(versionSpecifier);
          return !version.includes('link:');
        };

        if (dependencies) {
          this._addIntegrities(integrityMap, dependencies, false, externalFilter);
        }

        if (devDependencies) {
          this._addIntegrities(integrityMap, devDependencies, false, externalFilter);
        }

        if (optionalDependencies) {
          this._addIntegrities(integrityMap, optionalDependencies, true, externalFilter);
        }
      }
    }

    return integrityMap;
  }

  /** @override */
  public async isWorkspaceProjectModifiedAsync(
    project: RushConfigurationProject,
    variant?: string
  ): Promise<boolean> {
    const importerKey: string = this.getImporterKeyByPath(
      project.rushConfiguration.commonTempFolder,
      project.projectFolder
    );
    const importer: IPnpmShrinkwrapImporterYaml | undefined = this.getImporter(importerKey);
    if (!importer) {
      return true;
    }

    // First, let's transform the package.json using the pnpmfile
    const packageJson: IPackageJson = project.packageJsonEditor.saveToObject();

    // Initialize the pnpmfile if it doesn't exist
    if (!this._pnpmfileConfiguration) {
      this._pnpmfileConfiguration = await PnpmfileConfiguration.initializeAsync(project.rushConfiguration, {
        variant
      });
    }

    // Use a new PackageJsonEditor since it will classify each dependency type, making tracking the
    // found versions much simpler.
    const { dependencyList, devDependencyList } = PackageJsonEditor.fromObject(
      this._pnpmfileConfiguration.transform(packageJson),
      project.packageJsonEditor.filePath
    );

    const allDependencies: PackageJsonDependency[] = [...dependencyList, ...devDependencyList];

    if (this.shrinkwrapFileMajorVersion < 6) {
      // PNPM <= v7

      // Then get the unique package names and map them to package versions.
      const dependencyVersions: Map<string, PackageJsonDependency> = new Map();
      for (const packageDependency of allDependencies) {
        // We will also filter out peer dependencies since these are not installed at development time.
        if (packageDependency.dependencyType === DependencyType.Peer) {
          continue;
        }

        const foundDependency: PackageJsonDependency | undefined = dependencyVersions.get(
          packageDependency.name
        );
        if (!foundDependency) {
          dependencyVersions.set(packageDependency.name, packageDependency);
        } else {
          // Shrinkwrap will prioritize optional dependencies, followed by regular dependencies, with dev being
          // the least prioritized. We will only keep the most prioritized option.
          // See: https://github.com/pnpm/pnpm/blob/main/packages/lockfile-utils/src/satisfiesPackageManifest.ts
          switch (foundDependency.dependencyType) {
            case DependencyType.Optional:
              break;
            case DependencyType.Regular:
              if (packageDependency.dependencyType === DependencyType.Optional) {
                dependencyVersions.set(packageDependency.name, packageDependency);
              }
              break;
            case DependencyType.Dev:
              dependencyVersions.set(packageDependency.name, packageDependency);
              break;
          }
        }
      }

      // Then validate that the dependency fields are as expected in the shrinkwrap to avoid false-negatives
      // when moving a package from one field to the other.
      for (const { dependencyType, name } of dependencyVersions.values()) {
        switch (dependencyType) {
          case DependencyType.Optional:
            if (!importer.optionalDependencies?.[name]) return true;
            break;
          case DependencyType.Regular:
            if (!importer.dependencies?.[name]) return true;
            break;
          case DependencyType.Dev:
            if (!importer.devDependencies?.[name]) return true;
            break;
        }
      }

      const specifiers: Record<string, IPnpmVersionSpecifier> | undefined = importer.specifiers;
      if (!specifiers) {
        throw new InternalError('Expected specifiers to be defined, but is expected in lockfile version 5');
      }

      // Then validate the length matches between the importer and the dependency list, since duplicates are
      // a valid use-case. Importers will only take one of these values, so no need to do more work here.
      if (dependencyVersions.size !== Object.keys(specifiers).length) {
        return true;
      }

      // Finally, validate that all values in the importer are also present in the dependency list.
      for (const [importerPackageName, importerVersionSpecifier] of Object.entries(specifiers)) {
        const foundDependency: PackageJsonDependency | undefined =
          dependencyVersions.get(importerPackageName);
        if (!foundDependency) {
          return true;
        }
        const resolvedVersion: string = this.overrides.get(importerPackageName) ?? foundDependency.version;
        if (resolvedVersion !== importerVersionSpecifier) {
          return true;
        }
      }
    } else {
      // PNPM v8
      const importerOptionalDependencies: Set<string> = new Set(
        Object.keys(importer.optionalDependencies ?? {})
      );
      const importerDependencies: Set<string> = new Set(Object.keys(importer.dependencies ?? {}));
      const importerDevDependencies: Set<string> = new Set(Object.keys(importer.devDependencies ?? {}));

      for (const { dependencyType, name, version } of allDependencies) {
        let isOptional: boolean = false;
        let specifierFromLockfile: IPnpmVersionSpecifier | undefined;
        let isDevDepFallThrough: boolean = false;
        switch (dependencyType) {
          case DependencyType.Optional: {
            specifierFromLockfile = importer.optionalDependencies?.[name];
            importerOptionalDependencies.delete(name);
            break;
          }

          case DependencyType.Peer: {
            // Peer dependencies of workspace projects may be installed as regular dependencies
            isOptional = true; // fall through
          }

          case DependencyType.Dev: {
            specifierFromLockfile = importer.devDependencies?.[name];
            if (specifierFromLockfile) {
              // If the dev dependency is not found, it may be installed as a regular dependency,
              // so fall through
              importerDevDependencies.delete(name);
              break;
            }
            // If fall through, there is a chance the package declares an inconsistent version, ignore it.
            isDevDepFallThrough = true;
          }

          // eslint-disable-next-line no-fallthrough
          case DependencyType.Regular:
            specifierFromLockfile = importer.dependencies?.[name];
            importerDependencies.delete(name);
            break;
        }

        if (!specifierFromLockfile) {
          if (!isOptional) {
            return true;
          }
        } else {
          if (typeof specifierFromLockfile === 'string') {
            throw new Error(
              `The PNPM lockfile is in an unexpected format. The "${name}" package is specified as ` +
                `"${specifierFromLockfile}" instead of an object.`
            );
          } else {
            // TODO: Emit an error message when someone tries to override a version of something in one of their
            // local repo packages.
            const resolvedVersion: string = this.overrides.get(name) ?? version;
            if (specifierFromLockfile.specifier !== resolvedVersion && !isDevDepFallThrough && !isOptional) {
              return true;
            }
          }
        }
      }

      // Finally, validate that all values in the importer are also present in the dependency list.
      if (
        importerOptionalDependencies.size > 0 ||
        importerDependencies.size > 0 ||
        importerDevDependencies.size > 0
      ) {
        return true;
      }
    }

    return false;
  }

  private _getIntegrityForPackage(specifier: string, optional: boolean): Map<string, string> {
    const integrities: Map<string, Map<string, string>> = this._integrities;

    let integrityMap: Map<string, string> | undefined = integrities.get(specifier);
    if (integrityMap) {
      return integrityMap;
    }

    integrityMap = new Map();
    integrities.set(specifier, integrityMap);

    const shrinkwrapEntry: IPnpmShrinkwrapDependencyYaml | undefined = this.packages.get(specifier);
    if (!shrinkwrapEntry) {
      if (!optional) {
        // This algorithm heeds to be robust against missing shrinkwrap entries, so we can't just throw
        // Instead set it to a value which will not match any valid shrinkwrap record
        integrityMap.set(specifier, 'Missing shrinkwrap entry!');
      }

      // Indicate an empty entry
      return integrityMap;
    }

    let selfIntegrity: string | undefined = shrinkwrapEntry.resolution?.integrity;
    if (!selfIntegrity) {
      // git dependency specifiers do not have an integrity entry. Instead, they specify the tarball field.
      // So instead, we will hash the contents of the dependency entry and use that as the integrity hash.
      // Ex:
      // github.com/chfritz/node-xmlrpc/948db2fbd0260e5d56ed5ba58df0f5b6599bbe38:
      //   ...
      //   resolution:
      //     tarball: 'https://codeload.github.com/chfritz/node-xmlrpc/tar.gz/948db2fbd0260e5d56ed5ba58df0f5b6599bbe38'
      const sha256Digest: string = crypto
        .createHash('sha256')
        .update(JSON.stringify(shrinkwrapEntry))
        .digest('base64');
      selfIntegrity = `${specifier}:${sha256Digest}:`;
    }

    integrityMap.set(specifier, selfIntegrity);
    const { dependencies, optionalDependencies } = shrinkwrapEntry;

    if (dependencies) {
      this._addIntegrities(integrityMap, dependencies, false);
    }

    if (optionalDependencies) {
      this._addIntegrities(integrityMap, optionalDependencies, true);
    }

    return integrityMap;
  }

  private _addIntegrities(
    integrityMap: Map<string, string>,
    collection: Record<string, IPnpmVersionSpecifier>,
    optional: boolean,
    filter?: (name: string, version: IPnpmVersionSpecifier) => boolean
  ): void {
    for (const [name, version] of Object.entries(collection)) {
      if (filter && !filter(name, version)) {
        continue;
      }

      const packageId: string = this._getPackageId(name, version);
      if (integrityMap.has(packageId)) {
        // The entry could already have been added as a nested dependency
        continue;
      }

      const contribution: Map<string, string> = this._getIntegrityForPackage(packageId, optional);
      for (const [dep, integrity] of contribution) {
        integrityMap.set(dep, integrity);
      }
    }
  }

  /**
   * Gets the package description for a tempProject from the shrinkwrap file.
   */
  private _getPackageDescription(
    tempProjectDependencyKey: string
  ): IPnpmShrinkwrapDependencyYaml | undefined {
    const packageDescription: IPnpmShrinkwrapDependencyYaml | undefined =
      this.packages.get(tempProjectDependencyKey);

    return packageDescription && packageDescription.dependencies ? packageDescription : undefined;
  }

  private _getPackageId(name: string, versionSpecifier: IPnpmVersionSpecifier): string {
    const version: string = normalizePnpmVersionSpecifier(versionSpecifier);
    if (this.shrinkwrapFileMajorVersion >= 6) {
      if (version.startsWith('@github')) {
        // This is a github repo reference
        return version;
      } else {
        return version.startsWith('/') ? version : `/${name}@${version}`;
      }
    } else {
      // Version can sometimes be in the form of a path that's already in the /name/version format.
      return version.indexOf('/') !== -1 ? version : `/${name}/${version}`;
    }
  }

  private _parsePnpmDependencyKey(
    dependencyName: string,
    pnpmDependencyKey: IPnpmVersionSpecifier
  ): DependencySpecifier | undefined {
    if (pnpmDependencyKey) {
      const result: DependencySpecifier | undefined = parsePnpmDependencyKey(
        dependencyName,
        pnpmDependencyKey
      );

      if (!result) {
        throw new Error(
          `Cannot parse PNPM shrinkwrap version specifier: "${pnpmDependencyKey}"` +
            ` for "${dependencyName}"`
        );
      }

      return result;
    } else {
      return undefined;
    }
  }

  private _serializeInternal(omitImporters: boolean = false): string {
    // Ensure that if any of the top-level properties are provided but empty are removed. We populate the object
    // properties when we read the shrinkwrap but PNPM does not set these top-level properties unless they are present.
    const shrinkwrapToSerialize: { [key: string]: unknown } = {};
    for (const [key, value] of Object.entries(this._shrinkwrapJson)) {
      if (omitImporters && key === 'importers') {
        continue;
      }

      if (!value || typeof value !== 'object' || Object.keys(value).length > 0) {
        shrinkwrapToSerialize[key] = value;
      }
    }

    return yamlModule.safeDump(shrinkwrapToSerialize, PNPM_SHRINKWRAP_YAML_FORMAT);
  }
}
