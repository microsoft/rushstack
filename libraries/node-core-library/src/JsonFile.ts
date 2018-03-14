// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as os from 'os';
import * as jju from 'jju';

import { JsonSchema, IJsonSchemaErrorInfo, IJsonSchemaValidateOptions } from './JsonSchema';
import { Text } from './Text';

/**
 * Options for JsonFile.stringify()
 *
 * @public
 */
export interface IJsonFileStringifyOptions {
  /**
   * If true, then "\n" will be used for newlines instead of the default "\r\n".
   */
  unixNewlines?: boolean;
}

/**
 * Options for JsonFile.saveJsonFile()
 *
 * @public
 */
export interface IJsonFileSaveOptions extends IJsonFileStringifyOptions {
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
export class JsonFile {
  /**
   * Loads a JSON file.
   */
  public static load(jsonFilename: string): any { // tslint:disable-line:no-any
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

  /**
   * Loads a JSON file and validate its schema.
   */
  public static loadAndValidate(jsonFilename: string, jsonSchema: JsonSchema,
    options?: IJsonSchemaValidateOptions): any { // tslint:disable-line:no-any

    const jsonObject: any = JsonFile.load(jsonFilename); // tslint:disable-line:no-any
    jsonSchema.validateObject(jsonObject, jsonFilename, options);

    return jsonObject;
  }

  /**
   * Loads a JSON file and validate its schema, reporting errors using a callback
   * @remarks
   * See JsonSchema.validateObjectWithCallback() for more info.
   */
  public static loadAndValidateWithCallback(jsonFilename: string, jsonSchema: JsonSchema,
    errorCallback: (errorInfo: IJsonSchemaErrorInfo) => void): any { // tslint:disable-line:no-any

    const jsonObject: any = JsonFile.load(jsonFilename); // tslint:disable-line:no-any
    jsonSchema.validateObjectWithCallback(jsonObject, errorCallback);

    return jsonObject;
  }

  /**
   * Serializes the specified JSON object to a string buffer.
   * @param jsonObject - the object to be serialized
   * @param options - other settings that control serialization
   * @returns a JSON string, with newlines, and indented with two spaces
   */
  public static stringify(jsonObject: Object, options?: IJsonFileStringifyOptions): string {
    JsonFile.validateNoUndefinedMembers(jsonObject);
    const stringified: string = JSON.stringify(jsonObject, undefined, 2) + '\n';

    if (options && options.unixNewlines) {
      return stringified;
    } else {
      return Text.convertToCrLf(stringified);
    }

  }

  /**
   * Saves the file to disk.  Returns false if nothing was written due to options.onlyIfChanged.
   * @param jsonObject - the object to be saved
   * @param jsonFilename - the file path to write
   * @param options - other settings that control how the file is saved
   * @returns false if ISaveJsonFileOptions.onlyIfChanged didn't save anything; true otherwise
   */
  public static save(jsonObject: Object, jsonFilename: string, options: IJsonFileSaveOptions = {}): boolean {
    const normalized: string = JsonFile.stringify(jsonObject, options);

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

  /**
   * Used to validate a data structure before writing.  Reports an error if there
   * are any undefined members.
   */
  // tslint:disable-next-line:no-any
  public static validateNoUndefinedMembers(jsonObject: Object): void {
    return JsonFile._validateNoUndefinedMembers(jsonObject, []);
  }

  // Private implementation of validateNoUndefinedMembers()
  private static _validateNoUndefinedMembers(jsonObject: Object, keyPath: string[]): void {
    if (!jsonObject) {
      return;
    }
    if (typeof jsonObject === 'object') {
      for (const key of Object.keys(jsonObject)) {
        keyPath.push(key);

        // tslint:disable-next-line:no-any
        const value: any = jsonObject[key];
        if (value === undefined) {
          const fullPath: string = JsonFile._formatKeyPath(keyPath);
          throw new Error(`The value for ${fullPath} is undefined`);
        }

        JsonFile._validateNoUndefinedMembers(value, keyPath);
        keyPath.pop();
      }
    }
  }

  // Given this input:    ['items', '4', 'syntax', 'parameters', 'string "with" symbols", 'type']
  // Return this string:  items[4].syntax.parameters["string \"with\" symbols"].type
  private static _formatKeyPath(keyPath: string[]): string {
    let result: string = '';

    for (const key of keyPath) {
      if (/^[0-9]+$/.test(key)) {
        // It's an integer, so display like this:  parent[123]
        result += `[${key}]`;
      } else if (/^[a-z_][a-z_0-9]*$/i.test(key)) {
        // It's an alphanumeric identifier, so display like this:  parent.name
        if (result) {
          result += '.';
        }
        result += `${key}`;
      } else {
        // It's a freeform string, so display like this:  parent["A path: \"C:\\file\""]

        // Convert this:     A path: "C:\file"
        // To this:          A path: \"C:\\file\"
        const escapedKey: string = key.replace(/[\\]/g, '\\\\') // escape backslashes
          .replace(/["]/g, '\\'); // escape quotes
        result += `["${escapedKey}"]`;
      }
    }
    return result;
  }
}
