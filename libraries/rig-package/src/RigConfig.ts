// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as fs from 'fs';

import { ModuleResolver } from './ModuleResolver';

interface IRigConfigJson {
  rigPackageName: string;
  rigProfile: string;
}

interface IRigConfigOptions {
  projectFolderPath: string;
  moduleResolver: ModuleResolver | undefined;

  enabled: boolean;
  filePath: string;
  rigPackageName: string;
  rigProfile: string;
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
   * A function that implements Node.js module resolution.  The {@link RigConfig.getResolvedProfileFolder}
   * API cannot be used if this is omitted.
   */
  moduleResolver?: ModuleResolver;
}

/**
 * This is the main API for loading the `config/rig.json` file format.
 *
 * @public
 */
export class RigConfig {
  // For syntax details, see PackageNameParser from @rushstack/node-core-library
  private static readonly _packageNameRegExp: RegExp = /^(@[A-Za-z0-9\-_\.]+\/)?[A-Za-z0-9\-_\.]+$/;

  // Rig package names must have the "-rig" suffix.
  // Also silently accept "-rig-test" for our build test projects.
  private static readonly _rigNameRegExp: RegExp = /-rig(-test)?$/;

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

  /**
   * The project folder path that was passed to {@link RigConfig.loadForProjectFolder}.
   *
   * @remarks
   * Example: `/path/to/your-project`
   */
  public readonly projectFolderPath: string;

  private readonly _moduleResolver: ModuleResolver | undefined;

  /**
   * Returns `true` if `config/rig.json` was found, or `false` otherwise.
   */
  public readonly enabled: boolean;

  /**
   * The full path to the `rig.json` file that was found, or `""` if none was found.
   *
   * @remarks
   * Example: `/path/to/your-project/config/rig.json`
   */
  public readonly filePath: string;

  /**
   * The `"rigPackageName"` field from `rig.json`, or `""` if the file was not found.
   *
   * @remarks
   * The name must be a valid NPM package name, and must end with the `-rig` suffix.
   *
   * Example: `example-rig`
   */
  public readonly rigPackageName: string;

  /**
   * The `"rigProfile"` value that was loaded from `rig.json`, or `""` if the file was not found.
   *
   * @remarks
   * If the `rig.json` file exists, but the `"rigProfile"` is not specified, then the profile
   * name will be `"default"`.
   *
   * Example: `example-profile`
   */
  public readonly rigProfile: string;

  /**
   * The relative path to the rig profile specified by `rig.json`, or `""` if the file was not found.
   *
   * @remarks
   * Example: `profiles/example-profile`
   */
  public readonly relativeProfileFolderPath: string;

  private _resolvedRigPackageFolder: string | undefined;

  private constructor(options: IRigConfigOptions) {
    this.projectFolderPath = options.projectFolderPath;
    this._moduleResolver = options.moduleResolver;

    this.enabled = options.enabled;
    this.filePath = options.filePath;
    this.rigPackageName = options.rigPackageName;
    this.rigProfile = options.rigProfile;

    if (this.enabled) {
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
   */
  public static get jsonSchemaObject(): object {
    if (RigConfig._jsonSchemaObject === undefined) {
      const jsonSchemaContent: string = fs.readFileSync(RigConfig.jsonSchemaPath).toString();
      RigConfig._jsonSchemaObject = JSON.parse(jsonSchemaContent);
    }
    return RigConfig._jsonSchemaObject!;
  }

  /**
   * Use this method to load the `config/rig.json` file for a given project.
   *
   * @remarks
   * If the file cannot be found, an empty `RigConfig` object will be returned with {@link RigConfig.enabled}
   * equal to `false`.
   */
  public static loadForProjectFolder(options: ILoadForProjectFolderOptions): RigConfig {
    const rigConfigFilePath: string = path.join(options.projectFolderPath, 'config/rig.json');
    if (!fs.existsSync(rigConfigFilePath)) {
      return new RigConfig({
        projectFolderPath: options.projectFolderPath,
        moduleResolver: options.moduleResolver,

        enabled: false,
        filePath: '',
        rigPackageName: '',
        rigProfile: ''
      });
    }

    let json: IRigConfigJson;
    try {
      const rigConfigFileContent: string = fs.readFileSync(rigConfigFilePath).toString();
      json = JSON.parse(rigConfigFileContent);
      RigConfig._validateSchema(json);
    } catch (error) {
      throw new Error(error.message + '\nError loading config file: ' + rigConfigFilePath);
    }

    return new RigConfig({
      projectFolderPath: options.projectFolderPath,
      moduleResolver: options.moduleResolver,

      enabled: true,
      filePath: rigConfigFilePath,
      rigPackageName: json.rigPackageName,
      rigProfile: json.rigProfile || 'default'
    });
  }

  /**
   * Performs Node.js module resolution to locate the rig package folder, then returns the absolute path
   * of the rig profile folder specified by `rig.json`.
   *
   * @remarks
   * If no `rig.json` file was found, then this method throws an error.
   *
   * Example: `/path/to/your-project/node_modules/example-rig/profiles/example-profile`
   */
  public getResolvedProfileFolder(): string {
    const resolvedRigPackageFolder: string = this._getResolvedRigPackageFolder();
    return path.join(resolvedRigPackageFolder, this.relativeProfileFolderPath);
  }

  private _getResolvedRigPackageFolder(): string {
    if (this._resolvedRigPackageFolder === undefined) {
      if (!this.enabled) {
        throw new Error('Cannot resolve the rig package because no rig is enabled for this project');
      }

      if (!this._moduleResolver) {
        throw new Error(
          'Cannot resolve because no module resolver was provided to the RigConfig constructor'
        );
      }

      const resolvedRigPackageJsonPath: string = this._moduleResolver({
        modulePath: this.rigPackageName + '/package.json',
        baseFolderPath: this.projectFolderPath
      });

      this._resolvedRigPackageFolder = path.dirname(resolvedRigPackageJsonPath);
    }
    return this._resolvedRigPackageFolder;
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
      throw new Error(`The "rigPackageName" value is missing the "-rig" suffix`);
    }
  }
}
