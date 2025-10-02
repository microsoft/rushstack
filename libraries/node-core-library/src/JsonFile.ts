// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'node:os';
import * as jju from 'jju';

import type { JsonSchema, IJsonSchemaErrorInfo, IJsonSchemaValidateOptions } from './JsonSchema';
import { Text, type NewlineKind } from './Text';
import { FileSystem } from './FileSystem';

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
 * The Rush Stack lint rules discourage usage of `null`.  However, JSON parsers always return JavaScript's
 * `null` to keep the two syntaxes consistent.  When creating interfaces that describe JSON structures,
 * use `JsonNull` to avoid triggering the lint rule.  Do not use `JsonNull` for any other purpose.
 *
 * @remarks
 * If you are designing a new JSON file format, it's a good idea to avoid `null` entirely.  In most cases
 * there are better representations that convey more information about an item that is unknown, omitted, or disabled.
 *
 * To understand why `null` is deprecated, please see the `@rushstack/eslint-plugin` documentation here:
 *
 * {@link https://www.npmjs.com/package/@rushstack/eslint-plugin#rushstackno-null}
 *
 * @public
 */
// eslint-disable-next-line @rushstack/no-new-null
export type JsonNull = null;

/**
 * Specifies the variant of JSON syntax to be used.
 *
 * @public
 */
export enum JsonSyntax {
  /**
   * Specifies the exact RFC 8259 format as implemented by the `JSON.parse()` system API.
   * This format was designed for machine generated inputs such as an HTTP payload.
   * It is not a recommend choice for human-authored files, because it does not support
   * code comments.
   *
   * @remarks
   *
   * A well-known quote from Douglas Crockford, the inventor of JSON:
   *
   * "I removed comments from JSON because I saw people were using them to hold parsing directives,
   * a practice which would have destroyed interoperability.  I know that the lack of comments makes
   * some people sad, but it shouldn't.  Suppose you are using JSON to keep configuration files,
   * which you would like to annotate.  Go ahead and insert all the comments you like.
   * Then pipe it through JSMin before handing it to your JSON parser."
   *
   * @see {@link https://datatracker.ietf.org/doc/html/rfc8259 | RFC 8259}
   */
  Strict = 'strict',

  /**
   * `JsonSyntax.JsonWithComments` is the recommended format for human-authored config files.
   * It is a minimal extension to `JsonSyntax.Strict` adding support for code comments
   * using `//` and `/*`.
   *
   * @remarks
   *
   * VS Code calls this format `jsonc`, but it should not be confused with unrelated file formats
   * and libraries that also use the name "JSONC".
   *
   * To fix VS Code syntax highlighting, add this setting:
   * `"files.associations": { "*.json": "jsonc" }`
   *
   * To fix GitHub syntax highlighting, add this to your `.gitattributes`:
   * `*.json linguist-language=JSON-with-Comments`
   */
  JsonWithComments = 'jsonWithComments',

  /**
   * JSON5 is a project that proposes a JSON-like format supplemented with ECMAScript 5.1
   * notations for objects, numbers, comments, and more.
   *
   * @remarks
   * Files using this format should use the `.json5` file extension instead of `.json`.
   *
   * JSON5 has substantial differences from JSON: object keys may be unquoted, trailing commas
   * are allowed, and strings may span multiple lines.  Whereas {@link JsonSyntax.JsonWithComments} can
   * be cheaply converted to standard JSON by stripping comments, parsing JSON5 requires a
   * nontrivial algorithm that may not be easily available in some contexts or programming languages.
   *
   * @see {@link https://json5.org/ | JSON5 project website}
   */
  Json5 = 'json5'
}

/**
 * Options for {@link JsonFile.parseString}, {@link JsonFile.load}, and {@link JsonFile.loadAsync}.
 *
 * @public
 */
export interface IJsonFileParseOptions {
  /**
   * Specifies the variant of JSON syntax to be used.
   *
   * @defaultValue
   * {@link JsonSyntax.Json5}
   *
   * NOTE: This default will be changed to `JsonSyntax.JsonWithComments` in a future release.
   */
  jsonSyntax?: JsonSyntax;
}

/**
 * Options for {@link JsonFile.loadAndValidate} and {@link JsonFile.loadAndValidateAsync}
 *
 * @public
 */
export interface IJsonFileLoadAndValidateOptions extends IJsonFileParseOptions, IJsonSchemaValidateOptions {}

/**
 * Options for {@link JsonFile.stringify}
 *
 * @public
 */
export interface IJsonFileStringifyOptions extends IJsonFileParseOptions {
  /**
   * If provided, the specified newline type will be used instead of the default `\r\n`.
   */
  newlineConversion?: NewlineKind;

  /**
   * By default, {@link JsonFile.stringify} validates that the object does not contain any
   * keys whose value is `undefined`.  To disable this validation, set
   * {@link IJsonFileStringifyOptions.ignoreUndefinedValues} to `true`
   * which causes such keys to be silently discarded, consistent with the system `JSON.stringify()`.
   *
   * @remarks
   *
   * The JSON file format can represent `null` values ({@link JsonNull}) but not `undefined` values.
   * In ECMAScript code however, we generally avoid `null` and always represent empty states
   * as `undefined`, because it is the default value of missing/uninitialized variables.
   * (In practice, distinguishing "null" versus "uninitialized" has more drawbacks than benefits.)
   * This poses a problem when serializing ECMAScript objects that contain `undefined` members.
   * As a safeguard, {@link JsonFile} will report an error if any `undefined` values are encountered
   * during serialization.  Set {@link IJsonFileStringifyOptions.ignoreUndefinedValues} to `true`
   * to disable this safeguard.
   */
  ignoreUndefinedValues?: boolean;

  /**
   * If true, then the "jju" library will be used to improve the text formatting.
   * Note that this is slightly slower than the native JSON.stringify() implementation.
   */
  prettyFormatting?: boolean;

  /**
   * If specified, this header will be prepended to the start of the file.  The header must consist
   * of lines prefixed by "//" characters.
   * @remarks
   * When used with {@link IJsonFileSaveOptions.updateExistingFile}
   * or {@link JsonFile.updateString}, the header will ONLY be added for a newly created file.
   */
  headerComment?: string;
}

/**
 * Options for {@link JsonFile.save} and {@link JsonFile.saveAsync}.
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

const DEFAULT_ENCODING: 'utf8' = 'utf8';

/**
 * Utilities for reading/writing JSON files.
 * @public
 */
export class JsonFile {
  /**
   * @internal
   */
  public static _formatPathForError: (path: string) => string = (path: string) => path;

  /**
   * Loads a JSON file.
   */
  public static load(jsonFilename: string, options?: IJsonFileParseOptions): JsonObject {
    try {
      const contents: string = FileSystem.readFile(jsonFilename);
      const parseOptions: jju.ParseOptions = JsonFile._buildJjuParseOptions(options);
      return jju.parse(contents, parseOptions);
    } catch (error) {
      if (FileSystem.isNotExistError(error as Error)) {
        throw error;
      } else {
        throw new Error(
          `Error reading "${JsonFile._formatPathForError(jsonFilename)}":` +
            os.EOL +
            `  ${(error as Error).message}`
        );
      }
    }
  }

  /**
   * An async version of {@link JsonFile.load}.
   */
  public static async loadAsync(jsonFilename: string, options?: IJsonFileParseOptions): Promise<JsonObject> {
    try {
      const contents: string = await FileSystem.readFileAsync(jsonFilename);
      const parseOptions: jju.ParseOptions = JsonFile._buildJjuParseOptions(options);
      return jju.parse(contents, parseOptions);
    } catch (error) {
      if (FileSystem.isNotExistError(error as Error)) {
        throw error;
      } else {
        throw new Error(
          `Error reading "${JsonFile._formatPathForError(jsonFilename)}":` +
            os.EOL +
            `  ${(error as Error).message}`
        );
      }
    }
  }

  /**
   * Parses a JSON file's contents.
   */
  public static parseString(jsonContents: string, options?: IJsonFileParseOptions): JsonObject {
    const parseOptions: jju.ParseOptions = JsonFile._buildJjuParseOptions(options);
    return jju.parse(jsonContents, parseOptions);
  }

  /**
   * Loads a JSON file and validate its schema.
   */
  public static loadAndValidate(
    jsonFilename: string,
    jsonSchema: JsonSchema,
    options?: IJsonFileLoadAndValidateOptions
  ): JsonObject {
    const jsonObject: JsonObject = JsonFile.load(jsonFilename, options);
    jsonSchema.validateObject(jsonObject, jsonFilename, options);

    return jsonObject;
  }

  /**
   * An async version of {@link JsonFile.loadAndValidate}.
   */
  public static async loadAndValidateAsync(
    jsonFilename: string,
    jsonSchema: JsonSchema,
    options?: IJsonFileLoadAndValidateOptions
  ): Promise<JsonObject> {
    const jsonObject: JsonObject = await JsonFile.loadAsync(jsonFilename, options);
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
    errorCallback: (errorInfo: IJsonSchemaErrorInfo) => void,
    options?: IJsonFileLoadAndValidateOptions
  ): JsonObject {
    const jsonObject: JsonObject = JsonFile.load(jsonFilename, options);
    jsonSchema.validateObjectWithCallback(jsonObject, errorCallback);

    return jsonObject;
  }

  /**
   * An async version of {@link JsonFile.loadAndValidateWithCallback}.
   */
  public static async loadAndValidateWithCallbackAsync(
    jsonFilename: string,
    jsonSchema: JsonSchema,
    errorCallback: (errorInfo: IJsonSchemaErrorInfo) => void,
    options?: IJsonFileLoadAndValidateOptions
  ): Promise<JsonObject> {
    const jsonObject: JsonObject = await JsonFile.loadAsync(jsonFilename, options);
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
   * @param previousJson - the previous JSON string, which will be updated
   * @param newJsonObject - the object to be serialized
   * @param options - other settings that control serialization
   * @returns a JSON string, with newlines, and indented with two spaces
   */
  public static updateString(
    previousJson: string,
    newJsonObject: JsonObject,
    options: IJsonFileStringifyOptions = {}
  ): string {
    if (!options.ignoreUndefinedValues) {
      // Standard handling of `undefined` in JSON stringification is to discard the key.
      JsonFile.validateNoUndefinedMembers(newJsonObject);
    }

    let explicitMode: 'json5' | 'json' | 'cjson' | undefined = undefined;
    switch (options.jsonSyntax) {
      case JsonSyntax.Strict:
        explicitMode = 'json';
        break;
      case JsonSyntax.JsonWithComments:
        explicitMode = 'cjson';
        break;
      case JsonSyntax.Json5:
        explicitMode = 'json5';
        break;
    }

    let stringified: string;

    if (previousJson !== '') {
      // NOTE: We don't use mode=json here because comments aren't allowed by strict JSON
      stringified = jju.update(previousJson, newJsonObject, {
        mode: explicitMode ?? JsonSyntax.Json5,
        indent: 2
      });
    } else if (options.prettyFormatting) {
      stringified = jju.stringify(newJsonObject, {
        mode: explicitMode ?? 'json',
        indent: 2
      });

      if (options.headerComment !== undefined) {
        stringified = JsonFile._formatJsonHeaderComment(options.headerComment) + stringified;
      }
    } else {
      stringified = JSON.stringify(newJsonObject, undefined, 2);

      if (options.headerComment !== undefined) {
        stringified = JsonFile._formatJsonHeaderComment(options.headerComment) + stringified;
      }
    }

    // Add the trailing newline
    stringified = Text.ensureTrailingNewline(stringified);

    if (options.newlineConversion) {
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
  public static save(
    jsonObject: JsonObject,
    jsonFilename: string,
    options: IJsonFileSaveOptions = {}
  ): boolean {
    // Do we need to read the previous file contents?
    let oldBuffer: Buffer | undefined = undefined;
    if (options.updateExistingFile || options.onlyIfChanged) {
      try {
        oldBuffer = FileSystem.readFileToBuffer(jsonFilename);
      } catch (error) {
        if (!FileSystem.isNotExistError(error as Error)) {
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

    FileSystem.writeFile(jsonFilename, newBuffer, {
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
   * An async version of {@link JsonFile.save}.
   */
  public static async saveAsync(
    jsonObject: JsonObject,
    jsonFilename: string,
    options: IJsonFileSaveOptions = {}
  ): Promise<boolean> {
    // Do we need to read the previous file contents?
    let oldBuffer: Buffer | undefined = undefined;
    if (options.updateExistingFile || options.onlyIfChanged) {
      try {
        oldBuffer = await FileSystem.readFileToBufferAsync(jsonFilename);
      } catch (error) {
        if (!FileSystem.isNotExistError(error as Error)) {
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

    await FileSystem.writeFileAsync(jsonFilename, newBuffer, {
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
        const escapedKey: string = key
          .replace(/[\\]/g, '\\\\') // escape backslashes
          .replace(/["]/g, '\\'); // escape quotes
        result += `["${escapedKey}"]`;
      }
    }
    return result;
  }

  private static _formatJsonHeaderComment(headerComment: string): string {
    if (headerComment === '') {
      return '';
    }
    const lines: string[] = headerComment.split('\n');
    const result: string[] = [];
    for (const line of lines) {
      if (!/^\s*$/.test(line) && !/^\s*\/\//.test(line)) {
        throw new Error(
          'The headerComment lines must be blank or start with the "//" prefix.\n' +
            'Invalid line' +
            JSON.stringify(line)
        );
      }
      result.push(Text.replaceAll(line, '\r', ''));
    }
    return lines.join('\n') + '\n';
  }

  private static _buildJjuParseOptions(options: IJsonFileParseOptions = {}): jju.ParseOptions {
    const parseOptions: jju.ParseOptions = {
      reserved_keys: 'replace'
    };

    switch (options.jsonSyntax) {
      case JsonSyntax.Strict:
        parseOptions.mode = 'json';
        break;
      case JsonSyntax.JsonWithComments:
        parseOptions.mode = 'cjson';
        break;
      case JsonSyntax.Json5:
      default:
        parseOptions.mode = 'json5';
        break;
    }

    return parseOptions;
  }
}
