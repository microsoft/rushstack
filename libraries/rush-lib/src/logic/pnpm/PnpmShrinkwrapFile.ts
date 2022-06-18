// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
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
  MapExtensions
} from '@rushstack/node-core-library';

import { BaseShrinkwrapFile } from '../base/BaseShrinkwrapFile';
import { DependencySpecifier } from '../DependencySpecifier';
import {
  PackageManagerOptionsConfigurationBase,
  PnpmOptionsConfiguration,
  RushConfiguration
} from '../../api/RushConfiguration';
import { IShrinkwrapFilePolicyValidatorOptions } from '../policy/ShrinkwrapFilePolicy';
import { PNPM_SHRINKWRAP_YAML_FORMAT } from './PnpmYamlCommon';
import { RushConstants } from '../RushConstants';
import { IExperimentsJson } from '../../api/ExperimentsConfiguration';
import { DependencyType, PackageJsonDependency, PackageJsonEditor } from '../../api/PackageJsonEditor';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { PnpmfileConfiguration } from './PnpmfileConfiguration';
import { PnpmProjectShrinkwrapFile } from './PnpmProjectShrinkwrapFile';
import { SplitWorkspacePnpmfileConfiguration } from './SplitWorkspacePnpmfileConfiguration';

const yamlModule: typeof import('js-yaml') = Import.lazy('js-yaml', require);

export interface IPeerDependenciesMetaYaml {
  optional?: boolean;
}

export interface IPnpmShrinkwrapDependencyYaml {
  /** Information about the resolved package */
  resolution?: {
    /** The hash of the tarball, to ensure archive integrity */
    integrity: string;
    /** The name of the tarball, if this was from a TGX file */
    tarball?: string;
  };
  /** The list of dependencies and the resolved version */
  dependencies?: { [dependency: string]: string };
  /** The list of optional dependencies and the resolved version */
  optionalDependencies?: { [dependency: string]: string };
  /** The list of peer dependencies and the resolved version */
  peerDependencies?: { [dependency: string]: string };
  /**
   * Used to indicate optional peer dependencies, as described in this RFC:
   * https://github.com/yarnpkg/rfcs/blob/master/accepted/0000-optional-peer-dependencies.md
   */
  peerDependenciesMeta?: { [dependency: string]: IPeerDependenciesMetaYaml };
}

export interface IPnpmShrinkwrapImporterYaml {
  /** The list of resolved version numbers for direct dependencies */
  dependencies?: { [dependency: string]: string };
  /** The list of resolved version numbers for dev dependencies */
  devDependencies?: { [dependency: string]: string };
  /** The list of resolved version numbers for optional dependencies */
  optionalDependencies?: { [dependency: string]: string };
  /** The list of specifiers used to resolve dependency versions */
  specifiers: { [dependency: string]: string };
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
  /** The list of resolved version numbers for direct dependencies */
  dependencies: { [dependency: string]: string };
  /** The list of resolved version numbers for develop dependencies */
  devDependencies: { [dependency: string]: string };
  /** The list of resolved version numbers for optional dependencies */
  optionalDependencies: { [dependency: string]: string };
  /** The list of importers for local workspace projects */
  importers: { [relativePath: string]: IPnpmShrinkwrapImporterYaml };
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
export function parsePnpmDependencyKey(
  dependencyName: string,
  dependencyKey: string
): DependencySpecifier | undefined {
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
  const packageNameMatch: RegExpMatchArray | null = /^[^\/]*\/((?:@[^\/]+\/)?[^\/]+)\/(.*)$/.exec(
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

export class PnpmShrinkwrapFile extends BaseShrinkwrapFile {
  public readonly isWorkspaceCompatible: boolean;
  public readonly registry: string;
  public readonly dependencies: ReadonlyMap<string, string>;
  public readonly devDependencies: ReadonlyMap<string, string>;
  public readonly optionalDependencies: ReadonlyMap<string, string>;
  public readonly importers: ReadonlyMap<string, IPnpmShrinkwrapImporterYaml>;
  public readonly specifiers: ReadonlyMap<string, string>;
  public readonly packages: ReadonlyMap<string, IPnpmShrinkwrapDependencyYaml>;

  private readonly _shrinkwrapJson: IPnpmShrinkwrapYaml;
  private readonly _integrities: Map<string, Map<string, string>>;
  private _pnpmfileConfiguration: PnpmfileConfiguration | undefined;
  private _splitWorkspaceGlobalPnpmfileConfiguration: SplitWorkspacePnpmfileConfiguration | undefined;
  private _individualPackageName: string | undefined;
  private _individualShrinkwrapImporter: IPnpmShrinkwrapImporterYaml | undefined;

  private constructor(shrinkwrapJson: IPnpmShrinkwrapYaml) {
    super();
    this._shrinkwrapJson = shrinkwrapJson;

    // Normalize the data
    this.registry = shrinkwrapJson.registry || '';
    this.dependencies = new Map(Object.entries(shrinkwrapJson.dependencies || {}));
    this.devDependencies = new Map(Object.entries(shrinkwrapJson.devDependencies || {}));
    this.optionalDependencies = new Map(Object.entries(shrinkwrapJson.optionalDependencies || {}));
    this.importers = new Map(Object.entries(shrinkwrapJson.importers || {}));
    this.specifiers = new Map(Object.entries(shrinkwrapJson.specifiers || {}));
    this.packages = new Map(Object.entries(shrinkwrapJson.packages || {}));

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
      throw new Error(`Error reading "${shrinkwrapYamlFilename}":${os.EOL}  ${(error as Error).message}`);
    }
  }

  public static loadFromString(shrinkwrapContent: string): PnpmShrinkwrapFile {
    const parsedData: IPnpmShrinkwrapYaml = yamlModule.safeLoad(shrinkwrapContent);
    return new PnpmShrinkwrapFile(parsedData);
  }

  public setIndividualPackage(packageName: string): void {
    this._individualPackageName = packageName;
  }

  public get isIndividual(): boolean {
    return this._individualPackageName !== undefined;
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
          ) + os.EOL
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
            ) + os.EOL
          );
          throw new AlreadyReportedError();
        }

        if (this.getShrinkwrapHash(experimentsConfig) !== policyOptions.repoState.pnpmShrinkwrapHash) {
          console.log(
            colors.red(
              'The shrinkwrap file hash does not match the expected hash. Please run "rush update" to ensure the ' +
                'shrinkwrap file is up to date. See the "preventManualShrinkwrapChanges" setting documentation for ' +
                'details.'
            ) + os.EOL
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

  public getTopLevelDependencyKey(dependencyName: string): string | undefined {
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
    let value: string | undefined = this.dependencies.get(dependencyName);
    if (value) {
      // Getting the top level dependency version from a PNPM lockfile version 5.1
      // --------------------------------------------------------------------------
      //
      // 1) Top-level tarball dependency entries in pnpm-lock.yaml look like:
      //    '@rush-temp/sp-filepicker': 'file:projects/sp-filepicker.tgz_0ec79d3b08edd81ebf49cd19ca50b3f5'

      //    Then, it would be defined below:
      //    'file:projects/sp-filepicker.tgz_0ec79d3b08edd81ebf49cd19ca50b3f5':
      //      dependencies:
      //       '@microsoft/load-themed-styles': 1.10.7
      //       ...
      //      resolution:
      //       integrity: sha512-guuoFIc**==
      //       tarball: 'file:projects/sp-filepicker.tgz'

      //    Here, we are interested in the part 'file:projects/sp-filepicker.tgz'. Splitting by underscores is not the
      //    best way to get this because file names could have underscores in them. Instead, we could use the tarball
      //    field in the resolution section.

      // 2) Top-level non-tarball dependency entries in pnpm-lock.yaml would look like:
      //    '@rushstack/set-webpack-public-path-plugin': 2.1.133
      //    @microsoft/sp-build-node': 1.9.0-dev.27_typescript@2.9.2

      //    Here, we could just split by underscores and take the first part.

      // The below code is also compatible with lockfile versions < 5.1

      const dependency: IPnpmShrinkwrapDependencyYaml | undefined = this.packages.get(value);
      if (dependency?.resolution?.tarball && value.startsWith(dependency.resolution.tarball)) {
        return new DependencySpecifier(dependencyName, dependency.resolution.tarball);
      } else {
        const underscoreIndex: number = value.indexOf('_');
        if (underscoreIndex >= 0) {
          value = value.substr(0, underscoreIndex);
        }
      }

      return new DependencySpecifier(dependencyName, value);
    }
    return undefined;
  }

  /**
   * The PNPM shrinkwrap file has top-level dependencies on the temp projects like this:
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
   * We refer to 'file:projects/my-app.tgz_25c559a5921686293a001a397be4dce0' as the temp project dependency key
   * of the temp project '@rush-temp/my-app'.
   */
  public getTempProjectDependencyKey(tempProjectName: string): string | undefined {
    const tempProjectDependencyKey: string | undefined = this.dependencies.get(tempProjectName);
    return tempProjectDependencyKey ? tempProjectDependencyKey : undefined;
  }

  public getShrinkwrapEntryFromTempProjectDependencyKey(
    tempProjectDependencyKey: string
  ): IPnpmShrinkwrapDependencyYaml | undefined {
    return this.packages.get(tempProjectDependencyKey);
  }

  public getShrinkwrapEntry(name: string, version: string): IPnpmShrinkwrapDependencyYaml | undefined {
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

    const dependencyKey: string = packageDescription.dependencies[packageName];
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

        const externalFilter: (name: string, version: string) => boolean = (
          name: string,
          version: string
        ): boolean => {
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

  public getIntegrityForIndividualProject(): Map<string, string> {
    const packageName: string | undefined = this._individualPackageName;
    if (undefined === packageName) {
      throw new Error(`Can not generate integrities for shared shrinkwrap file`);
    }
    let integrityMap: Map<string, string> | undefined = this._integrities.get(packageName);
    if (!integrityMap) {
      integrityMap = new Map<string, string>();
      this._integrities.set(packageName, integrityMap);
      const shrinkwrapHash: string = this.getShrinkwrapHash();
      const selfIntegrity: string = `${packageName}:${shrinkwrapHash}:`;
      integrityMap.set(packageName, selfIntegrity);

      const { dependencies, devDependencies, optionalDependencies } = this.getIndividualShrinkwrapImporter();

      const externalFilter: (name: string, version: string) => boolean = (
        name: string,
        version: string
      ): boolean => {
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
    return integrityMap;
  }

  /** @override */
  public isWorkspaceProjectModified(project: RushConfigurationProject, variant?: string): boolean {
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
      this._pnpmfileConfiguration = new PnpmfileConfiguration(project.rushConfiguration, { variant });
    }

    // Use a new PackageJsonEditor since it will classify each dependency type, making tracking the
    // found versions much simpler.
    const transformedPackageJsonEditor: PackageJsonEditor = PackageJsonEditor.fromObject(
      this._pnpmfileConfiguration.transform(packageJson),
      project.packageJsonEditor.filePath
    );

    return this._isProjectModified(transformedPackageJsonEditor, importer);
  }

  public isSplitWorkspaceProjectModified(project: RushConfigurationProject): boolean {
    const importerKey: string = this.getImporterKeyByPath(
      project.rushConfiguration.commonTempSplitFolder,
      project.projectFolder
    );

    const importer: IPnpmShrinkwrapImporterYaml | undefined = this.getImporter(importerKey);
    if (!importer) {
      return true;
    }

    if (!this._splitWorkspaceGlobalPnpmfileConfiguration) {
      this._splitWorkspaceGlobalPnpmfileConfiguration = new SplitWorkspacePnpmfileConfiguration(
        project.rushConfiguration
      );
    }

    const packageJson: IPackageJson = project.packageJsonEditor.saveToObject();

    // Use a new PackageJsonEditor since it will classify each dependency type, making tracking the
    // found versions much simpler.
    const transformedPackageJsonEditor: PackageJsonEditor = PackageJsonEditor.fromObject(
      this._splitWorkspaceGlobalPnpmfileConfiguration.transform(packageJson),
      project.packageJsonEditor.filePath
    );

    return this._isProjectModified(transformedPackageJsonEditor, importer);
  }

  public isSplitWorkspaceIndividualProjectModified(project: RushConfigurationProject): boolean {
    if (!this.isIndividual) {
      throw new Error(`Can not calculate modified for shared workspace shrinkwrap file`);
    }

    if (!this._splitWorkspaceGlobalPnpmfileConfiguration) {
      this._splitWorkspaceGlobalPnpmfileConfiguration = new SplitWorkspacePnpmfileConfiguration(
        project.rushConfiguration
      );
    }

    const packageJson: IPackageJson = project.packageJsonEditor.saveToObject();

    // Use a new PackageJsonEditor since it will classify each dependency type, making tracking the
    // found versions much simpler.
    const transformedPackageJsonEditor: PackageJsonEditor = PackageJsonEditor.fromObject(
      this._splitWorkspaceGlobalPnpmfileConfiguration.transform(packageJson),
      project.packageJsonEditor.filePath
    );

    return this._isProjectModified(transformedPackageJsonEditor, this.getIndividualShrinkwrapImporter());
  }

  private _isProjectModified(
    packageJsonEditor: PackageJsonEditor,
    projectShrinkwrap: IPnpmShrinkwrapImporterYaml
  ): boolean {
    const { dependencyList, devDependencyList } = packageJsonEditor;

    // Then get the unique package names and map them to package versions.
    const dependencyVersions: Map<string, PackageJsonDependency> = new Map();
    for (const packageDependency of [...dependencyList, ...devDependencyList]) {
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
    for (const dependencyVersion of dependencyVersions.values()) {
      switch (dependencyVersion.dependencyType) {
        case DependencyType.Optional:
          if (
            !projectShrinkwrap.optionalDependencies ||
            !projectShrinkwrap.optionalDependencies[dependencyVersion.name]
          )
            return true;
          break;
        case DependencyType.Regular:
          if (!projectShrinkwrap.dependencies || !projectShrinkwrap.dependencies[dependencyVersion.name])
            return true;
          break;
        case DependencyType.Dev:
          if (
            !projectShrinkwrap.devDependencies ||
            !projectShrinkwrap.devDependencies[dependencyVersion.name]
          )
            return true;
          break;
      }
    }

    // Then validate the length matches between the importer and the dependency list, since duplicates are
    // a valid use-case. Importers will only take one of these values, so no need to do more work here.
    if (dependencyVersions.size !== Object.keys(projectShrinkwrap.specifiers).length) {
      return true;
    }

    // Finally, validate that all values in the importer are also present in the dependency list.
    for (const [importerPackageName, importerVersionSpecifier] of Object.entries(
      projectShrinkwrap.specifiers
    )) {
      const foundDependency: PackageJsonDependency | undefined = dependencyVersions.get(importerPackageName);
      if (!foundDependency || foundDependency.version !== importerVersionSpecifier) {
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
    collection: Record<string, string>,
    optional: boolean,
    filter?: (name: string, version: string) => boolean
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

  private _getPackageId(name: string, version: string): string {
    // Version can sometimes be in the form of a path that's already in the /name/version format.
    const packageId: string = version.indexOf('/') !== -1 ? version : `/${name}/${version}`;
    return packageId;
  }

  private _parsePnpmDependencyKey(
    dependencyName: string,
    pnpmDependencyKey: string
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

  private getIndividualShrinkwrapImporter(): IPnpmShrinkwrapImporterYaml {
    if (!this._individualShrinkwrapImporter) {
      const dependencies: Record<string, string> = MapExtensions.toObject(
        this.dependencies as Map<string, string>
      );
      const devDependencies: Record<string, string> = MapExtensions.toObject(
        this.devDependencies as Map<string, string>
      );
      const optionalDependencies: Record<string, string> = MapExtensions.toObject(
        this.optionalDependencies as Map<string, string>
      );
      const specifiers: Record<string, string> = MapExtensions.toObject(
        this.specifiers as Map<string, string>
      );
      this._individualShrinkwrapImporter = {
        dependencies,
        devDependencies,
        optionalDependencies,
        specifiers
      };
    }
    return this._individualShrinkwrapImporter;
  }
}
