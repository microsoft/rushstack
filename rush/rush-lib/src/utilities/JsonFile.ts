// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as os from 'os';
import * as jju from 'jju';
import Utilities from './Utilities';

/**
 * Utilities for reading/writing JSON files.
 */
export default class JsonFile {

  /* tslint:disable:no-any */ // JSON objects are dynamically typed
  public static loadJsonFile(jsonFilename: string): any {
    if (!fsx.existsSync(jsonFilename)) {
      throw new Error(`Input file not found: ${jsonFilename}`);
    }

    const buffer: Buffer = fsx.readFileSync(jsonFilename);
    try {
      return jju.parse(buffer.toString());
    } catch (error) {
      throw new Error(`Error reading "${jsonFilename}":` + os.EOL + `  ${error.message}`);
    }
  }

  public static saveJsonFile(jsonData: any, jsonFilename: string): void {
    const stringified: string = JSON.stringify(jsonData, undefined, 2) + '\n';
    const normalized: string = Utilities.getAllReplaced(stringified, '\n', '\r\n');
    fsx.writeFileSync(jsonFilename, normalized);
  }
  /* tslint:enable:no-any */
}
