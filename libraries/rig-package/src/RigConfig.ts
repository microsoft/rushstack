// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as fs from 'fs';

interface IRigConfigJson {
  rigPackageName: string;
  profile: string | undefined;
}

interface IRigConfigOptions {
  enabled: boolean;
  rigConfigFilePath: string;
  json: IRigConfigJson;
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
  public readonly profile: string | undefined;

  private constructor(options: IRigConfigOptions) {
    this.enabled = options.enabled;
    this.filePath = options.rigConfigFilePath;
    this.rigPackageName = options.json.rigPackageName;
    this.profile = options.json.profile;
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
        json: {
          rigPackageName: '',
          profile: undefined
        }
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
      json
    });
  }

  private static _validateSchema(json: IRigConfigJson): void {
    for (const key of Object.getOwnPropertyNames(json)) {
      switch (key) {
        case '$schema':
        case 'rigPackageName':
        case 'profile':
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
