// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import * as fs from 'node:fs';

import * as nodeResolve from 'resolve';
import stripJsonComments from 'strip-json-comments';

import { Helpers } from './Helpers';
import type { RigConfiguration as IRigConfigJson } from './schemas/rig.schema.json.d.ts';

/**
 * Represents the literal contents of the `config/rig.json` file.
 *
 * @public
 */
export type { IRigConfigJson };

interface IRigConfigOptions {
  projectFolderPath: string;

  rigFound: boolean;
  filePath: string;
  rigPackageName: string;
  rigProfile?: string;
}

/**
 * Options for {@link RigConfig.loadForProjectFolder}.
 *
 * @public
 */
export interface ILoadForProjectFolderOptions {
  /**
   * The path to the folder of the project to be analyzed.  This folder should contain a `package.json` file.
   */
  projectFolderPath: string;

  /**
   * If specified, instead of loading the `config/rig.json` from disk, this object will be substituted instead.
   */
  overrideRigJsonObject?: IRigConfigJson;

  /**
   * If specified, force a fresh load instead of returning a cached entry, if one existed.
   */
  bypassCache?: boolean;
}

/**
 * This is the main API for loading the `config/rig.json` file format.
 *
 * @public
 */
export interface IRigConfig {
  /**
   * The project folder path that was passed to {@link RigConfig.loadForProjectFolder},
   * which maybe an absolute or relative path.
   *
   * @remarks
   * Example: `.`
   */
  readonly projectFolderOriginalPath: string;

  /**
   * The absolute path for the project folder path that was passed to {@link RigConfig.loadForProjectFolder}.
   *
   * @remarks
   * Example: `/path/to/your-project`
   */
  readonly projectFolderPath: string;

  /**
   * Returns `true` if `config/rig.json` was found, or `false` otherwise.
   */
  readonly rigFound: boolean;

  /**
   * The full path to the `rig.json` file that was found, or `""` if none was found.
   *
   * @remarks
   * Example: `/path/to/your-project/config/rig.json`
   */
  readonly filePath: string;

  /**
   * The `"rigPackageName"` field from `rig.json`, or `""` if the file was not found.
   *
   * @remarks
   * The name must be a valid NPM package name, and must end with the `-rig` suffix.
   *
   * Example: `example-rig`
   */
  readonly rigPackageName: string;

  /**
   * The `"rigProfile"` value that was loaded from `rig.json`, or `""` if the file was not found.
   *
   * @remarks
   * The name must consist of lowercase alphanumeric words separated by hyphens, for example `"sample-profile"`.
   * If the `rig.json` file exists, but the `"rigProfile"` is not specified, then the profile
   * name will be `"default"`.
   *
   * Example: `example-profile`
   */
  readonly rigProfile: string;

  /**
   * The relative path to the rig profile specified by `rig.json`, or `""` if the file was not found.
   *
   * @remarks
   * Example: `profiles/example-profile`
   */
  readonly relativeProfileFolderPath: string;

  /**
   * Performs Node.js module resolution to locate the rig package folder, then returns the absolute path
   * of the rig profile folder specified by `rig.json`.
   *
   * @remarks
   * If no `rig.json` file was found, then this method throws an error.  The first time this method
   * is called, the result is cached and will be returned by all subsequent calls.
   *
   * Example: `/path/to/your-project/node_modules/example-rig/profiles/example-profile`
   */
  getResolvedProfileFolder(): string;

  /**
   * An async variant of {@link IRigConfig.getResolvedProfileFolder}
   */
  getResolvedProfileFolderAsync(): Promise<string>;

  /**
   * This lookup first checks for the specified relative path under `projectFolderPath`; if it does
   * not exist there, then it checks in the resolved rig profile folder.  If the file is found,
   * its absolute path is returned. Otherwise, `undefined` is returned.
   *
   * @remarks
   * For example, suppose the rig profile is:
   *
   * `/path/to/your-project/node_modules/example-rig/profiles/example-profile`
   *
   * And suppose `configFileRelativePath` is `folder/file.json`. Then the following locations will be checked:
   *
   * `/path/to/your-project/folder/file.json`
   *
   * `/path/to/your-project/node_modules/example-rig/profiles/example-profile/folder/file.json`
   */
  tryResolveConfigFilePath(configFileRelativePath: string): string | undefined;

  /**
   * An async variant of {@link IRigConfig.tryResolveConfigFilePath}
   */
  tryResolveConfigFilePathAsync(configFileRelativePath: string): Promise<string | undefined>;
}

/**
 * {@inheritdoc IRigConfig}
 *
 * @public
 */
export class RigConfig implements IRigConfig {
  // For syntax details, see PackageNameParser from @rushstack/node-core-library
  private static readonly _packageNameRegExp: RegExp = /^(@[A-Za-z0-9\-_\.]+\/)?[A-Za-z0-9\-_\.]+$/;

  // Rig package names must have the "-rig" suffix.
  // Also silently accept "-rig-test" for our build test projects.
  private static readonly _rigNameRegExp: RegExp = /-rig(-test)?$/;

  // Profiles must be lowercase alphanumeric words separated by hyphens
  private static readonly _profileNameRegExp: RegExp = /^[a-z0-9_\.]+(\-[a-z0-9_\.]+)*$/;

  /**
   * Returns the absolute path of the `rig.schema.json` JSON schema file for `config/rig.json`,
   * which is bundled with this NPM package.
   *
   * @remarks
   * The `RigConfig` class already performs schema validation when loading `rig.json`; however
   * this schema file may be useful for integration with other validation tools.
   *
   * @public
   */
  public static jsonSchemaPath: string = path.resolve(__dirname, './schemas/rig.schema.json');
  private static _jsonSchemaObject: object | undefined = undefined;

  private static readonly _configCache: Map<string, RigConfig> = new Map();

  /**
   * {@inheritdoc IRigConfig.projectFolderOriginalPath}
   */
  public readonly projectFolderOriginalPath: string;

  /**
   * {@inheritdoc IRigConfig.projectFolderPath}
   */
  public readonly projectFolderPath: string;

  /**
   * {@inheritdoc IRigConfig.rigFound}
   */
  public readonly rigFound: boolean;

  /**
   * {@inheritdoc IRigConfig.filePath}
   */
  public readonly filePath: string;

  /**
   * {@inheritdoc IRigConfig.rigPackageName}
   */
  public readonly rigPackageName: string;

  /**
   * {@inheritdoc IRigConfig.rigProfile}
   */
  public readonly rigProfile: string;

  /**
   * {@inheritdoc IRigConfig.relativeProfileFolderPath}
   */
  public readonly relativeProfileFolderPath: string;

  // Example: /path/to/your-project/node_modules/example-rig/
  // If the value is `undefined`, then getResolvedProfileFolder() has not calculated it yet
  private _resolvedRigPackageFolder: string | undefined;

  // Example: /path/to/your-project/node_modules/example-rig/profiles/example-profile
  // If the value is `undefined`, then getResolvedProfileFolder() has not calculated it yet
  private _resolvedProfileFolder: string | undefined;

  private constructor(options: IRigConfigOptions) {
    const { projectFolderPath, rigFound, filePath, rigPackageName, rigProfile = 'default' } = options;

    this.projectFolderOriginalPath = projectFolderPath;
    this.projectFolderPath = path.resolve(projectFolderPath);

    this.rigFound = rigFound;
    this.filePath = filePath;
    this.rigPackageName = rigPackageName;
    this.rigProfile = rigProfile;

    if (this.rigFound) {
      this.relativeProfileFolderPath = 'profiles/' + this.rigProfile;
    } else {
      this.relativeProfileFolderPath = '';
    }
  }

  /**
   * The JSON contents of the {@link RigConfig.jsonSchemaPath} file.
   *
   * @remarks
   * The JSON object will be lazily loaded when this property getter is accessed, and the result
   * will be cached.
   * Accessing this property may make a synchronous filesystem call.
   */
  public static get jsonSchemaObject(): object {
    if (RigConfig._jsonSchemaObject === undefined) {
      const jsonSchemaContent: string = fs.readFileSync(RigConfig.jsonSchemaPath).toString();
      // Remove nonstandard fields that are not part of the JSON Schema specification
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { 'x-tsdoc-release-tag': _, ...schemaObject } = JSON.parse(jsonSchemaContent);
      RigConfig._jsonSchemaObject = schemaObject;
    }

    return RigConfig._jsonSchemaObject!;
  }

  /**
   * Use this method to load the `config/rig.json` file for a given project.
   *
   * @remarks
   * If the file cannot be found, an empty `RigConfig` object will be returned with {@link RigConfig.rigFound}
   * equal to `false`.
   */
  public static loadForProjectFolder(options: ILoadForProjectFolderOptions): RigConfig {
    const { overrideRigJsonObject, projectFolderPath } = options;

    const fromCache: RigConfig | undefined =
      !options.bypassCache && !overrideRigJsonObject
        ? RigConfig._configCache.get(projectFolderPath)
        : undefined;

    if (fromCache) {
      return fromCache;
    }

    const rigConfigFilePath: string = path.join(projectFolderPath, 'config/rig.json');

    let config: RigConfig | undefined;
    let json: IRigConfigJson | undefined = overrideRigJsonObject;
    try {
      if (!json) {
        const rigConfigFileContent: string = fs.readFileSync(rigConfigFilePath).toString();
        json = JSON.parse(stripJsonComments(rigConfigFileContent)) as IRigConfigJson;
      }
      RigConfig._validateSchema(json);
    } catch (error) {
      config = RigConfig._handleConfigError(error as Error, projectFolderPath, rigConfigFilePath);
    }

    if (!config) {
      config = new RigConfig({
        projectFolderPath: projectFolderPath,

        rigFound: true,
        filePath: rigConfigFilePath,
        rigPackageName: json!.rigPackageName,
        rigProfile: json!.rigProfile
      });
    }

    if (!overrideRigJsonObject) {
      RigConfig._configCache.set(projectFolderPath, config);
    }
    return config;
  }

  /**
   * An async variant of {@link RigConfig.loadForProjectFolder}
   */
  public static async loadForProjectFolderAsync(options: ILoadForProjectFolderOptions): Promise<RigConfig> {
    const { overrideRigJsonObject, projectFolderPath } = options;

    const fromCache: RigConfig | false | undefined =
      !options.bypassCache && !overrideRigJsonObject && RigConfig._configCache.get(projectFolderPath);

    if (fromCache) {
      return fromCache;
    }

    const rigConfigFilePath: string = path.join(projectFolderPath, 'config/rig.json');

    let config: RigConfig | undefined;
    let json: IRigConfigJson | undefined = overrideRigJsonObject;
    try {
      if (!json) {
        const rigConfigFileContent: string = (await fs.promises.readFile(rigConfigFilePath)).toString();
        json = JSON.parse(stripJsonComments(rigConfigFileContent)) as IRigConfigJson;
      }

      RigConfig._validateSchema(json);
    } catch (error) {
      config = RigConfig._handleConfigError(error as Error, projectFolderPath, rigConfigFilePath);
    }

    if (!config) {
      config = new RigConfig({
        projectFolderPath: projectFolderPath,

        rigFound: true,
        filePath: rigConfigFilePath,
        rigPackageName: json!.rigPackageName,
        rigProfile: json!.rigProfile
      });
    }

    if (!overrideRigJsonObject) {
      RigConfig._configCache.set(projectFolderPath, config);
    }
    return config;
  }

  private static _handleConfigError(
    error: NodeJS.ErrnoException,
    projectFolderPath: string,
    rigConfigFilePath: string
  ): RigConfig {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') {
      throw new Error(error.message + '\nError loading config file: ' + rigConfigFilePath);
    }

    // File not found, i.e. no rig config
    return new RigConfig({
      projectFolderPath,

      rigFound: false,
      filePath: '',
      rigPackageName: '',
      rigProfile: ''
    });
  }

  /**
   * {@inheritdoc IRigConfig.getResolvedProfileFolder}
   */
  public getResolvedProfileFolder(): string {
    if (this._resolvedRigPackageFolder === undefined) {
      if (!this.rigFound) {
        throw new Error('Cannot resolve the rig package because no rig was specified for this project');
      }

      const rigPackageJsonModuleSpecifier: string = `${this.rigPackageName}/package.json`;
      const resolveOptions: nodeResolve.Opts = { basedir: this.projectFolderPath };
      const resolvedRigPackageJsonPath: string = nodeResolve.sync(
        rigPackageJsonModuleSpecifier,
        resolveOptions
      );

      this._resolvedRigPackageFolder = path.dirname(resolvedRigPackageJsonPath);
    }

    if (this._resolvedProfileFolder === undefined) {
      this._resolvedProfileFolder = path.join(this._resolvedRigPackageFolder, this.relativeProfileFolderPath);

      if (!fs.existsSync(this._resolvedProfileFolder)) {
        throw new Error(
          `The rig profile "${this.rigProfile}" is not defined` +
            ` by the rig package "${this.rigPackageName}"`
        );
      }
    }

    return this._resolvedProfileFolder;
  }

  /**
   * {@inheritdoc IRigConfig.getResolvedProfileFolderAsync}
   */
  public async getResolvedProfileFolderAsync(): Promise<string> {
    if (this._resolvedRigPackageFolder === undefined) {
      if (!this.rigFound) {
        throw new Error('Cannot resolve the rig package because no rig was specified for this project');
      }

      const rigPackageJsonModuleSpecifier: string = `${this.rigPackageName}/package.json`;
      const resolveOptions: nodeResolve.Opts = { basedir: this.projectFolderPath };
      const resolvedRigPackageJsonPath: string = await Helpers.nodeResolveAsync(
        rigPackageJsonModuleSpecifier,
        resolveOptions
      );

      this._resolvedRigPackageFolder = path.dirname(resolvedRigPackageJsonPath);
    }

    if (this._resolvedProfileFolder === undefined) {
      this._resolvedProfileFolder = path.join(this._resolvedRigPackageFolder, this.relativeProfileFolderPath);

      if (!(await Helpers.fsExistsAsync(this._resolvedProfileFolder))) {
        throw new Error(
          `The rig profile "${this.rigProfile}" is not defined` +
            ` by the rig package "${this.rigPackageName}"`
        );
      }
    }

    return this._resolvedProfileFolder;
  }

  /**
   * {@inheritdoc IRigConfig.tryResolveConfigFilePath}
   */
  public tryResolveConfigFilePath(configFileRelativePath: string): string | undefined {
    if (!Helpers.isDownwardRelative(configFileRelativePath)) {
      throw new Error('The configFileRelativePath is not a relative path: ' + configFileRelativePath);
    }

    const localPath: string = path.join(this.projectFolderPath, configFileRelativePath);
    if (fs.existsSync(localPath)) {
      return localPath;
    }
    if (this.rigFound) {
      const riggedPath: string = path.join(this.getResolvedProfileFolder(), configFileRelativePath);
      if (fs.existsSync(riggedPath)) {
        return riggedPath;
      }
    }
    return undefined;
  }

  /**
   * {@inheritdoc IRigConfig.tryResolveConfigFilePathAsync}
   */
  public async tryResolveConfigFilePathAsync(configFileRelativePath: string): Promise<string | undefined> {
    if (!Helpers.isDownwardRelative(configFileRelativePath)) {
      throw new Error('The configFileRelativePath is not a relative path: ' + configFileRelativePath);
    }

    const localPath: string = path.join(this.projectFolderPath, configFileRelativePath);
    if (await Helpers.fsExistsAsync(localPath)) {
      return localPath;
    }
    if (this.rigFound) {
      const riggedPath: string = path.join(
        await this.getResolvedProfileFolderAsync(),
        configFileRelativePath
      );
      if (await Helpers.fsExistsAsync(riggedPath)) {
        return riggedPath;
      }
    }
    return undefined;
  }

  private static _validateSchema(json: IRigConfigJson): void {
    for (const key of Object.getOwnPropertyNames(json)) {
      switch (key) {
        case '$schema':
        case 'rigPackageName':
        case 'rigProfile':
          break;
        default:
          throw new Error(`Unsupported field ${JSON.stringify(key)}`);
      }
    }

    if (!json.rigPackageName) {
      throw new Error('Missing required field "rigPackageName"');
    }

    if (!RigConfig._packageNameRegExp.test(json.rigPackageName)) {
      throw new Error(
        `The "rigPackageName" value is not a valid NPM package name: ${JSON.stringify(json.rigPackageName)}`
      );
    }

    if (!RigConfig._rigNameRegExp.test(json.rigPackageName)) {
      throw new Error(
        `The "rigPackageName" value is missing the "-rig" suffix: ` + JSON.stringify(json.rigProfile)
      );
    }

    if (json.rigProfile !== undefined) {
      if (!RigConfig._profileNameRegExp.test(json.rigProfile)) {
        throw new Error(
          `The profile name must consist of lowercase alphanumeric words separated by hyphens: ` +
            JSON.stringify(json.rigProfile)
        );
      }
    }
  }
}
