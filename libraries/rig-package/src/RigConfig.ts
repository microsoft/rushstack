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
 * @public
 */
export interface ILoadForProjectFolderOptions {
  packageJsonFolderPath: string;
  moduleResolver?: ModuleResolver;
}

/**
 * @public
 */
export class RigConfig {
  // For syntax details, see PackageNameParser from @rushstack/node-core-library
  private static readonly _packageNameRegExp: RegExp = /^(@[A-Za-z0-9\-_\.]+\/)?[A-Za-z0-9\-_\.]+$/;

  // Rig package names must have the "-rig" suffix.
  // Also silently accept "-rig-test" for our build test projects.
  private static readonly _rigNameRegExp: RegExp = /-rig(-test)?$/;

  public static jsonSchemaPath: string = path.resolve(__dirname, './schemas/rig.schema.json');
  private static _jsonSchemaObject: object | undefined = undefined;

  public readonly projectFolderPath: string;
  private readonly _moduleResolver: ModuleResolver | undefined;

  public readonly enabled: boolean;
  public readonly filePath: string;

  public readonly rigPackageName: string;
  public readonly rigProfile: string;

  public readonly relativeProfileFolderPath: string;

  public readonly profileFolderPath: string;

  private _resolvedRigPackageFolder: string | undefined;

  private constructor(options: IRigConfigOptions) {
    this.projectFolderPath = options.projectFolderPath;
    this._moduleResolver = options.moduleResolver;

    this.enabled = options.enabled;
    this.filePath = options.filePath;
    this.rigPackageName = options.rigPackageName;
    this.rigProfile = options.rigProfile;

    if (this.enabled) {
      this.relativeProfileFolderPath = 'profile/' + this.rigProfile;
    } else {
      this.relativeProfileFolderPath = '';
    }
  }

  public static get jsonSchemaObject(): object {
    if (RigConfig._jsonSchemaObject === undefined) {
      const jsonSchemaContent: string = fs.readFileSync(RigConfig.jsonSchemaPath).toString();
      RigConfig._jsonSchemaObject = JSON.parse(jsonSchemaContent);
    }
    return RigConfig._jsonSchemaObject!;
  }

  public static loadForProjectFolder(options: ILoadForProjectFolderOptions): RigConfig {
    const rigConfigFilePath: string = path.join(options.packageJsonFolderPath, 'config/rig.json');
    if (!fs.existsSync(rigConfigFilePath)) {
      return new RigConfig({
        projectFolderPath: options.packageJsonFolderPath,
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
      projectFolderPath: options.packageJsonFolderPath,
      moduleResolver: options.moduleResolver,

      enabled: true,
      filePath: rigConfigFilePath,
      rigPackageName: json.rigPackageName,
      rigProfile: json.rigProfile || 'default'
    });
  }

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
