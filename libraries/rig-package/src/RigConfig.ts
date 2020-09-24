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
          throw new Error(`Supported field ${JSON.stringify(key)}`);
      }
    }
    if (!json.rigPackageName) {
      throw new Error('Missing required field "rigPackageName"');
    }
  }
}
