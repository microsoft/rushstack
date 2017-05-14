// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as os from 'os';
import * as jju from 'jju';
import Utilities from './Utilities';

/**
 * Options for JsonFile.saveJsonFile()
 *
 * @public
 */
export interface ISaveJsonFileOptions {
  /**
   * If there is an existing file, and the contents have not changed, then
   * don't write anything; this preserves the old timestamp.
   */
  onlyIfChanged?: boolean;
}

/**
 * Utilities for reading/writing JSON files.
 * @public
 */
export default class JsonFile {
  /**
   * Loads a JSON file.
   */
  // tslint:disable-next-line:no-any
  public static loadJsonFile(jsonFilename: string): any {
    if (!fsx.existsSync(jsonFilename)) {
      throw new Error(`Input file not found: ${jsonFilename}`);
    }

    const buffer: Buffer = fsx.readFileSync(jsonFilename);
    try {
      const jsonData: Object = jju.parse(buffer.toString());
      return jsonData;
    } catch (error) {
      throw new Error(`Error reading "${jsonFilename}":` + os.EOL + `  ${error.message}`);
    }
  }

  /**
   * Saves the file to disk.  Returns false if nothing was written due to options.onlyIfChanged.
   */
  // tslint:disable-next-line:no-any
  public static saveJsonFile(jsonData: any, jsonFilename: string, options: ISaveJsonFileOptions = {}): boolean {
    const stringified: string = JSON.stringify(jsonData, undefined, 2) + '\n';
    const normalized: string = Utilities.getAllReplaced(stringified, '\n', '\r\n');

    const buffer: Buffer = new Buffer(normalized); // utf8 encoding happens here

    if (options.onlyIfChanged) {
      // Has the file changed?
      if (fsx.existsSync(jsonFilename)) {
        try {
          const oldBuffer: Buffer = fsx.readFileSync(jsonFilename);
          if (Buffer.compare(buffer, oldBuffer) === 0) {
            // Nothing has changed, so don't touch the file
            return false;
          }
        } catch (error) {
          // Ignore this error, and try writing a new file.  If that fails, then we should report that
          // error instead.
        }
      }
    }

    fsx.writeFileSync(jsonFilename, buffer);

    // TEST CODE: Used to verify that onlyIfChanged isn't broken by a hidden transformation during saving.
    /*
    const oldBuffer2: Buffer = fsx.readFileSync(jsonFilename);
    if (Buffer.compare(buffer, oldBuffer2) !== 0) {
      console.log('new:' + buffer.toString('hex'));
      console.log('old:' + oldBuffer2.toString('hex'));

      throw new Error('onlyIfChanged logic is broken');
    }
    */

    return true;
  }
}
