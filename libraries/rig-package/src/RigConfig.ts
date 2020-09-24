// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as fs from 'fs';

interface IRigConfigJson {
  rigPackageName: string;
  rigProfile: string;
}

interface IRigConfigOptions {
  enabled: boolean;
  rigConfigFilePath: string;
  rigPackageName: string;
  rigProfile: string;
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

  public readonly enabled: boolean;
  public readonly filePath: string;

  public readonly rigPackageName: string;
  public readonly profileName: string;

  private constructor(options: IRigConfigOptions) {
    this.enabled = options.enabled;
    this.filePath = options.rigConfigFilePath;
    this.rigPackageName = options.rigPackageName;
    this.profileName = options.rigProfile;
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
        enabled: false,
        rigConfigFilePath: '',
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
      enabled: true,
      rigConfigFilePath,
      rigPackageName: json.rigPackageName,
      rigProfile: json.rigProfile || 'default'
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
