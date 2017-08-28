// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as os from 'os';
import * as jju from 'jju';
import Validator = require('z-schema');

/**
 * Callback function for JsonFile.saveJsonFile()
 * @public
 */
export type ValidateErrorCallback = (errorDescription: string) => void;

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
export class JsonFile {
  /**
   * Loads a JSON file.
   */
  // tslint:disable-next-line:no-any
  public static load(jsonFilename: string): any {
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
   * Serializes the specified JSON object to a string buffer.
   * @param jsonObject - the object to be serialized
   * @returns a JSON string, with newlines, and indented with two spaces
   */
  public static stringify(jsonObject: Object): string {
    JsonFile.validateNoUndefinedMembers(jsonObject);
    const stringified: string = JSON.stringify(jsonObject, undefined, 2) + '\n';
    return JsonFile._getAllReplaced(stringified, '\n', '\r\n');
  }

  /**
   * Saves the file to disk.  Returns false if nothing was written due to options.onlyIfChanged.
   * @param jsonObject - the object to be saved
   * @param jsonFilename - the file path to write
   * @param options - other settings that control how the file is saved
   * @returns false if ISaveJsonFileOptions.onlyIfChanged didn't save anything; true otherwise
   */
  public static save(jsonObject: Object, jsonFilename: string, options: ISaveJsonFileOptions = {}): boolean {
    const normalized: string = JsonFile.stringify(jsonObject);

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
    if (!jsonObject) {
      return;
    }
    if (typeof jsonObject === 'object') {
      for (const key of Object.keys(jsonObject)) {
        // tslint:disable-next-line:no-any
        const value: any = jsonObject[key];
        if (value === undefined) {
          throw new Error(`The key "${key}" is undefined`);
        }
        JsonFile.validateNoUndefinedMembers(value);
      }
    }
  }

  public static validateSchema(jsonObject: Object, jsonSchemaObject: Object,
    errorCallback: ValidateErrorCallback): void {

    if (typeof jsonSchemaObject !== 'object') {
      // Catch common problems with wrong function parameters
      throw new Error('Incorrect jsonSchemaObject parameter type for JsonFile.validateSchema()');
    }

    // Remove the $schema reference that appears in the configuration object (used for IntelliSense),
    // since we are replacing it with the precompiled version.  The validator.setRemoteReference()
    // API is a better way to handle this, but we'd first need to publish the schema file
    // to a public web server where Visual Studio can find it.
    // tslint:disable-next-line:no-string-literal
    delete jsonSchemaObject['$schema'];

    const validator: Validator = new Validator({
      breakOnFirstError: false,
      noTypeless: true,
      noExtraKeywords: true
    });

    if (!validator.validate(jsonObject, jsonSchemaObject)) {
      const errorDetails: Validator.SchemaErrorDetail[] = validator.getLastErrors();

      let buffer: string = 'JSON schema validation failed:';

      buffer = JsonFile._formatErrorDetails(errorDetails, '  ', buffer);
      errorCallback(buffer);
    }
  }

  /**
   * Used by validateSchema() to nicely format the ZSchema error tree.
   */
  private static _formatErrorDetails(errorDetails: Validator.SchemaErrorDetail[], indent: string,
    buffer: string): string {
    for (const errorDetail of errorDetails) {

      buffer += os.EOL + indent + `Error: ${errorDetail.path}`;

      if (errorDetail.description) {
        const MAX_LENGTH: number = 40;
        let truncatedDescription: string = errorDetail.description.trim();
        if (truncatedDescription.length > MAX_LENGTH) {
          truncatedDescription = truncatedDescription.substr(0, MAX_LENGTH - 3)
            + '...';
        }

        buffer += ` (${truncatedDescription})`;
      }

      buffer += os.EOL + indent + `       ${errorDetail.message}`;

      if (errorDetail.inner) {
        buffer = JsonFile._formatErrorDetails(errorDetail.inner, indent + '  ', buffer);
      }
    }

    return buffer;
  }

  /**
   * Returns the same thing as targetString.replace(searchValue, replaceValue), except that
   * all matches are replaced, rather than just the first match.
   * @param targetString  The string to be modified
   * @param searchValue   The value to search for
   * @param replaceValue  The replacement text
   */
  private static _getAllReplaced(targetString: string, searchValue: string, replaceValue: string): string {
    return targetString.split(searchValue).join(replaceValue);
  }
}
