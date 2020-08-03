// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonFile } from '@rushstack/node-core-library';

import { ITypeScriptConfiguration } from '../../stages/BuildStage';

/**
 * Schema for jest-typescript-data.json
 */
export interface IJestTypeScriptDataFileJson {
  /**
   * The "emitFolderPathForJest" from .heft/typescript.json
   */
  emitFolderPathForJest: string;
}

/**
 * Manages loading/saving the "jest-typescript-data.json" data file.  This file communicates
 * configuration information from Heft to jest-build-transform.js.  The jest-build-transform.js script gets
 * loaded dynamically by the Jest engine, so it does not have access to the normal HeftConfiguration objects.
 */
export class JestTypeScriptDataFile {
  /**
   * Called by TypeScriptPlugin to write the file.
   */
  public static saveForProject(
    projectFolder: string,
    typeScriptConfiguration: ITypeScriptConfiguration
  ): void {
    const jsonFilePath: string = JestTypeScriptDataFile.getConfigFilePath(projectFolder);

    const json: IJestTypeScriptDataFileJson = {
      emitFolderPathForJest: typeScriptConfiguration.emitFolderPathForJest || 'lib'
    };
    JsonFile.save(json, jsonFilePath, {
      ensureFolderExists: true,
      onlyIfChanged: true,
      headerComment: '// THIS DATA FILE IS INTERNAL TO HEFT; DO NOT MODIFY IT OR RELY ON ITS CONTENTS'
    });
  }

  /**
   * Called by jest-build-transform.js to read the file.
   */
  public static loadForProject(projectFolder: string): IJestTypeScriptDataFileJson {
    const jsonFilePath: string = JestTypeScriptDataFile.getConfigFilePath(projectFolder);
    return JsonFile.load(jsonFilePath);
  }

  public static getConfigFilePath(projectFolder: string): string {
    return path.join(projectFolder, '.heft', 'build-cache', 'jest-typescript-data.json');
  }
}
