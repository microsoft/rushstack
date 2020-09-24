// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as fs from 'fs';

interface IRigConfigJson {
  rigPackageName: string;
  rigProfile: string;
}

export interface IRigConfigOptions {
  projectFolderPath: string;

  enabled: boolean;
  filePath: string;
  rigPackageName: string;
  rigProfile: string;
}

/**
 * @public
 */
export interface IModuleResolver {
  resolve(moduleName: string, baseFolder: string): string;
}

/**
 * @public
 */
export class RigConfig {
  // For syntax details, see PackageNameParser from @rushstack/node-core-library
  private static readonly _packageNameRegExp: RegExp = /^(@[A-Za-z0-9\-_\.]+\/)?[A-Za-z0-9\-_\.]+$/;

  // Rig package names must have the "-rig" suffix
  private static readonly _rigNameRegExp: RegExp = /-rig$/;

  public static jsonSchemaPath: string = path.resolve(__dirname, './schemas/rig.schema.json');
  private static _jsonSchemaObject: object | undefined = undefined;

  public readonly projectFolderPath: string;

  public readonly enabled: boolean;
  public readonly filePath: string;

  public readonly rigPackageName: string;
  public readonly rigProfile: string;

  public readonly relativeProfileFolderPath: string;

  /** @internal */
  protected constructor(options: IRigConfigOptions) {
    this.projectFolderPath = options.projectFolderPath;
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

  public static loadForProjectFolder(packageJsonFolderPath: string): RigConfig {
    const rigConfigFilePath: string = path.join(packageJsonFolderPath, 'config/rig.json');
    if (!fs.existsSync(rigConfigFilePath)) {
      return new RigConfig({
        projectFolderPath: packageJsonFolderPath,
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
      projectFolderPath: packageJsonFolderPath,
      enabled: true,
      filePath: rigConfigFilePath,
      rigPackageName: json.rigPackageName,
      rigProfile: json.rigProfile || 'default'
    });
  }

  public resolveRig(resolver: IModuleResolver): ResolvedRigConfig {
    if (!this.enabled) {
      throw new Error('Cannot resolve the rig package because no rig is enabled for this project');
    }

    const resolvedRigPackageJsonPath: string = resolver.resolve(
      this.rigPackageName + '/package.json',
      this.projectFolderPath
    );
    const resolvedRigPackageFolder: string = path.dirname(resolvedRigPackageJsonPath);

    // Circular reference
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return new ResolvedRigConfig({
      projectFolderPath: this.projectFolderPath,
      enabled: this.enabled,
      filePath: this.filePath,
      rigPackageName: this.rigPackageName,
      rigProfile: this.rigProfile,
      resolvedRigPackageFolder
    });
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

import { ResolvedRigConfig } from './ResolvedRigConfig';
