// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import * as jju from 'jju';

import {
  JsonSchema,
  IJsonSchemaErrorInfo,
  IJsonSchemaValidateOptions
} from './JsonSchema';
import {
  Text,
  NewlineKind
} from './Text';
import { FileSystem } from './FileSystem';
import { FileSystemNotExistError } from './FileSystemNotExistError';

/**
 * Represents a JSON-serializable object whose type has not been determined yet.
 *
 * @remarks
 *
 * This type is similar to `any`, except that it communicates that the object is serializable JSON.
 *
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JsonObject = any;

/**
 * Options for JsonFile.stringify()
 *
 * @public
 */
export interface IJsonFileStringifyOptions {
  /**
   * If provided, the specified newline type will be used instead of the default `\r\n`.
   */
  newlineConversion?: NewlineKind;

  /**
   * If true, then the "jju" library will be used to improve the text formatting.
   * Note that this is slightly slower than the native JSON.stringify() implementation.
   */
  prettyFormatting?: boolean;
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

  /**
   * Creates the folder recursively using FileSystem.ensureFolder()
   * Defaults to false.
   */
  ensureFolderExists?: boolean;

  /**
   * If true, use the "jju" library to preserve the existing JSON formatting:  The file will be loaded
   * from the target filename, the new content will be merged in (preserving whitespace and comments),
   * and then the file will be overwritten with the merged contents.  If the target file does not exist,
   * then the file is saved normally.
   */
  updateExistingFile?: boolean;
}

const DEFAULT_ENCODING: string = 'utf8';

/**
 * Utilities for reading/writing JSON files.
 * @public
 */
export class JsonFile {
  /**
   * Loads a JSON file.
   */
  public static load(jsonFilename: string): JsonObject {
    try {
      const contents: string = FileSystem.readFile(jsonFilename);
      return jju.parse(contents);
    } catch (error) {
      if (error instanceof FileSystemNotExistError) {
        throw error;
      } else {
        throw new Error(`Error reading "${jsonFilename}":` + os.EOL + `  ${error.message}`);
      }
    }
  }

  /**
   * An async version of {@link JsonFile.load}.
   */
  public static async loadAsync(jsonFilename: string): Promise<JsonObject> {
    try {
      const contents: string = await FileSystem.readFileAsync(jsonFilename);
      return jju.parse(contents);
    } catch (error) {
      if (error instanceof FileSystemNotExistError) {
        throw error
      } else {
        throw new Error(`Error reading "${jsonFilename}":` + os.EOL + `  ${error.message}`);
      }
    }
  }

  /**
   * Parses a JSON file's contents.
   */
  public static parseString(jsonContents: string): JsonObject {
    return jju.parse(jsonContents);
  }

  /**
   * Loads a JSON file and validate its schema.
   */
  public static loadAndValidate(
    jsonFilename: string,
    jsonSchema: JsonSchema,
    options?: IJsonSchemaValidateOptions
  ): JsonObject {
    const jsonObject: JsonObject = JsonFile.load(jsonFilename);
    jsonSchema.validateObject(jsonObject, jsonFilename, options);

    return jsonObject;
  }

  /**
   * An async version of {@link JsonFile.loadAndValidate}.
   */
  public static async loadAndValidateAsync(
    jsonFilename: string,
    jsonSchema: JsonSchema,
    options?: IJsonSchemaValidateOptions
  ): Promise<JsonObject> {
    const jsonObject: JsonObject = await JsonFile.loadAsync(jsonFilename);
    jsonSchema.validateObject(jsonObject, jsonFilename, options);

    return jsonObject;
  }

  /**
   * Loads a JSON file and validate its schema, reporting errors using a callback
   * @remarks
   * See JsonSchema.validateObjectWithCallback() for more info.
   */
  public static loadAndValidateWithCallback(
    jsonFilename: string,
    jsonSchema: JsonSchema,
    errorCallback: (errorInfo: IJsonSchemaErrorInfo) => void
  ): JsonObject {
    const jsonObject: JsonObject = JsonFile.load(jsonFilename);
    jsonSchema.validateObjectWithCallback(jsonObject, errorCallback);

    return jsonObject;
  }

  /**
   * An async version of {@link JsonFile.loadAndValidateWithCallback}.
   */
  public static async loadAndValidateWithCallbackAsync(
    jsonFilename: string,
    jsonSchema: JsonSchema,
    errorCallback: (errorInfo: IJsonSchemaErrorInfo) => void
  ): Promise<JsonObject> {
    const jsonObject: JsonObject = await JsonFile.loadAsync(jsonFilename);
    jsonSchema.validateObjectWithCallback(jsonObject, errorCallback);

    return jsonObject;
  }

  /**
   * Serializes the specified JSON object to a string buffer.
   * @param jsonObject - the object to be serialized
   * @param options - other settings that control serialization
   * @returns a JSON string, with newlines, and indented with two spaces
   */
  public static stringify(jsonObject: JsonObject, options?: IJsonFileStringifyOptions): string {
    return JsonFile.updateString('', jsonObject, options);
  }

  /**
   * Serializes the specified JSON object to a string buffer.
   * @param jsonObject - the object to be serialized
   * @param options - other settings that control serialization
   * @returns a JSON string, with newlines, and indented with two spaces
   */
  public static updateString(
    previousJson: string,
    newJsonObject: JsonObject,
    options?: IJsonFileStringifyOptions
  ): string {
    if (!options) {
      options = { };
    }

    JsonFile.validateNoUndefinedMembers(newJsonObject);

    let stringified: string;

    if (previousJson !== '') {
      // NOTE: We don't use mode=json here because comments aren't allowed by strict JSON
      stringified = jju.update(previousJson, newJsonObject, {
        mode: 'cjson',
        indent: 2
      });
    } else if (options.prettyFormatting) {
      stringified = jju.stringify(newJsonObject, {
        mode: 'json',
        indent: 2
      });
    } else {
      stringified = JSON.stringify(newJsonObject, undefined, 2);
    }

    // Add the trailing newline
    stringified = Text.ensureTrailingNewline(stringified);

    if (options && options.newlineConversion) {
      stringified = Text.convertTo(stringified, options.newlineConversion);
    }

    return stringified;
  }

  /**
   * Saves the file to disk.  Returns false if nothing was written due to options.onlyIfChanged.
   * @param jsonObject - the object to be saved
   * @param jsonFilename - the file path to write
   * @param options - other settings that control how the file is saved
   * @returns false if ISaveJsonFileOptions.onlyIfChanged didn't save anything; true otherwise
   */
  public static save(jsonObject: JsonObject, jsonFilename: string, options?: IJsonFileSaveOptions): boolean {
    if (!options) {
      options = { };
    }

    // Do we need to read the previous file contents?
    let oldBuffer: Buffer | undefined = undefined;
    if (options.updateExistingFile || options.onlyIfChanged) {
      try {
        oldBuffer = FileSystem.readFileToBuffer(jsonFilename);
      } catch (error) {
        if (!(error instanceof FileSystemNotExistError)) {
          throw error;
        }
      }
    }

    let jsonToUpdate: string = '';
    if (options.updateExistingFile && oldBuffer) {
      jsonToUpdate = oldBuffer.toString(DEFAULT_ENCODING);
    }

    const newJson: string = JsonFile.updateString(jsonToUpdate, jsonObject, options);

    const newBuffer: Buffer = Buffer.from(newJson, DEFAULT_ENCODING);

    if (options.onlyIfChanged) {
      // Has the file changed?
      if (oldBuffer && Buffer.compare(newBuffer, oldBuffer) === 0) {
        // Nothing has changed, so don't touch the file
        return false;
      }
    }

    FileSystem.writeFile(jsonFilename, newBuffer.toString(DEFAULT_ENCODING), {
      ensureFolderExists: options.ensureFolderExists
    });

    // TEST CODE: Used to verify that onlyIfChanged isn't broken by a hidden transformation during saving.
    /*
    const oldBuffer2: Buffer = FileSystem.readFileToBuffer(jsonFilename);
    if (Buffer.compare(buffer, oldBuffer2) !== 0) {
      console.log('new:' + buffer.toString('hex'));
      console.log('old:' + oldBuffer2.toString('hex'));

      throw new Error('onlyIfChanged logic is broken');
    }
    */
    return true;
  }

  /**
   * An async version of {@link JsonFile.loadAndValidateWithCallback}.
   */
  public static async saveAsync(jsonObject: JsonObject, jsonFilename: string, options?: IJsonFileSaveOptions): Promise<boolean> {
    if (!options) {
      options = { };
    }

    // Do we need to read the previous file contents?
    let oldBuffer: Buffer | undefined = undefined;
    if (options.updateExistingFile || options.onlyIfChanged) {
      try {
        oldBuffer = await FileSystem.readFileToBufferAsync(jsonFilename);
      } catch (error) {
        if (!(error instanceof FileSystemNotExistError)) {
          throw error;
        }
      }
    }

    let jsonToUpdate: string = '';
    if (options.updateExistingFile && oldBuffer) {
      jsonToUpdate = oldBuffer.toString(DEFAULT_ENCODING);
    }

    const newJson: string = JsonFile.updateString(jsonToUpdate, jsonObject, options);

    const newBuffer: Buffer = Buffer.from(newJson, DEFAULT_ENCODING);

    if (options.onlyIfChanged) {
      // Has the file changed?
      if (oldBuffer && Buffer.compare(newBuffer, oldBuffer) === 0) {
        // Nothing has changed, so don't touch the file
        return false;
      }
    }

    await FileSystem.writeFileAsync(jsonFilename, newBuffer.toString(DEFAULT_ENCODING), {
      ensureFolderExists: options.ensureFolderExists
    });

    // TEST CODE: Used to verify that onlyIfChanged isn't broken by a hidden transformation during saving.
    /*
    const oldBuffer2: Buffer = await FileSystem.readFileToBufferAsync(jsonFilename);
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
  public static validateNoUndefinedMembers(jsonObject: JsonObject): void {
    return JsonFile._validateNoUndefinedMembers(jsonObject, []);
  }

  // Private implementation of validateNoUndefinedMembers()
  private static _validateNoUndefinedMembers(jsonObject: JsonObject, keyPath: string[]): void {
    if (!jsonObject) {
      return;
    }
    if (typeof jsonObject === 'object') {
      for (const key of Object.keys(jsonObject)) {
        keyPath.push(key);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const value: any = jsonObject[key];
        if (value === undefined) {
          const fullPath: string = JsonFile._formatKeyPath(keyPath);
          throw new Error(`The value for ${fullPath} is "undefined" and cannot be serialized as JSON`);
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
