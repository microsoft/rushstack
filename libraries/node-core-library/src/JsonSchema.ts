// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'node:os';
import * as path from 'node:path';

import Ajv, { type Options as AjvOptions, type ErrorObject, type ValidateFunction } from 'ajv';
import AjvDraft04 from 'ajv-draft-04';
import addFormats from 'ajv-formats';

import { JsonFile, type JsonObject } from './JsonFile.ts';
import { FileSystem } from './FileSystem.ts';

/**
 * Pattern matching JSON Schema vendor extension keywords in the form `x-<vendor>-<keyword>`,
 * where `<vendor>` is alphanumeric and `<keyword>` is kebab-case alphanumeric.
 * @example `x-tsdoc-release-tag`, `x-myvendor-description`
 */
const VENDOR_EXTENSION_KEY_PATTERN: RegExp = /^x-[a-z0-9]+-[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Collects top-level property keys from a JSON object that match the vendor extension
 * pattern `x-<vendor>-<keyword>`.  Only root-level keys are inspected for performance.
 */
function _collectVendorExtensionKeywords(obj: unknown, keywords: Set<string>): void {
  if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      if (VENDOR_EXTENSION_KEY_PATTERN.test(key)) {
        keywords.add(key);
      }
    }
  }
}

interface ISchemaWithId {
  // draft-04 uses "id"
  id: string | undefined;
  // draft-06 and higher uses "$id"
  $id: string | undefined;
}

/**
 * Specifies the version of json-schema to be validated against.
 * https://json-schema.org/specification
 * @public
 */
export type JsonSchemaVersion = 'draft-04' | 'draft-07';

/**
 * A definition for a custom format to consider during validation.
 * @public
 */
export interface IJsonSchemaCustomFormat<T extends string | number> {
  /**
   * The base JSON type.
   */
  type: T extends string ? 'string' : T extends number ? 'number' : never;

  /**
   * A validation function for the format.
   * @param data - The raw field data to validate.
   * @returns whether the data is valid according to the format.
   */
  validate: (data: T) => boolean;
}

/**
 * Callback function arguments for {@link JsonSchema.validateObjectWithCallback}
 * @public
 */
export interface IJsonSchemaErrorInfo {
  /**
   * The ajv error list, formatted as an indented text string.
   */
  details: string;
}

/**
 * Options for {@link JsonSchema.validateObjectWithCallback}
 * @public
 */
export interface IJsonSchemaValidateObjectWithOptions {
  /**
   * If true, the root-level `$schema` property in a JSON object being validated will be ignored during validation.
   * If this is set to `true` and the schema requires a `$schema` property, validation will fail.
   */
  ignoreSchemaField?: boolean;
}

/**
 * Options for {@link JsonSchema.validateObject}
 * @public
 */
export interface IJsonSchemaValidateOptions extends IJsonSchemaValidateObjectWithOptions {
  /**
   * A custom header that will be used to report schema errors.
   * @remarks
   * If omitted, the default header is "JSON validation failed:".  The error message starts with
   * the header, followed by the full input filename, followed by the ajv error list.
   * If you wish to customize all aspects of the error message, use JsonFile.loadAndValidateWithCallback()
   * or JsonSchema.validateObjectWithCallback().
   */
  customErrorHeader?: string;
}

/**
 * Options for {@link JsonSchema.fromFile} and {@link JsonSchema.fromLoadedObject}
 * @public
 */
export interface IJsonSchemaLoadOptions {
  /**
   * Other schemas that this schema references, e.g. via the "$ref" directive.
   * @remarks
   * The tree of dependent schemas may reference the same schema more than once.
   * However, if the same schema "$id" is used by two different JsonSchema instances,
   * an error will be reported.  This means you cannot load the same filename twice
   * and use them both together, and you cannot have diamond dependencies on different
   * versions of the same schema.  Although technically this would be possible to support,
   * it normally indicates an error or design problem.
   *
   * JsonSchema also does not allow circular references between schema dependencies.
   */
  dependentSchemas?: JsonSchema[];

  /**
   * The json-schema version to target for validation.
   *
   * @defaultValue draft-07
   *
   * @remarks
   * If the a version is not explicitly set, the schema object's `$schema` property
   * will be inspected to determine the version. If a `$schema` property is not found
   * or does not match an expected URL, the default version will be used.
   */
  schemaVersion?: JsonSchemaVersion;

  /**
   * Any custom formats to consider during validation. Some standard formats are supported
   * out-of-the-box (e.g. emails, uris), but additional formats can be defined here. You could
   * for example define generic numeric formats (e.g. uint8) or domain-specific formats.
   */
  customFormats?: Record<string, IJsonSchemaCustomFormat<string> | IJsonSchemaCustomFormat<number>>;

  /**
   * If true, the AJV validator will reject JSON Schema vendor extension keywords
   * matching the pattern `x-<vendor>-<keyword>` as unknown keywords.
   *
   * @remarks
   * The JSON Schema specification allows vendor-specific extensions using the `x-` prefix.
   * For example, `x-tsdoc-release-tag` is used by `@rushstack/heft-json-schema-typings-plugin`.
   * Other tools may define their own extensions such as `x-myvendor-html-description`.
   *
   * By default, the schema tree is scanned for any keys matching the `x-<vendor>-<keyword>`
   * pattern, and those keys are registered as custom AJV keywords so that strict mode validation
   * succeeds.  Set this option to `true` to disable this behavior and treat vendor extension
   * keywords as unknown (which causes AJV strict mode to reject them).
   *
   * @defaultValue false
   * @beta
   */
  rejectVendorExtensionKeywords?: boolean;
}

/**
 * Options for {@link JsonSchema.fromFile}
 * @public
 */
export type IJsonSchemaFromFileOptions = IJsonSchemaLoadOptions;

/**
 * Options for {@link JsonSchema.fromLoadedObject}
 * @public
 */
export type IJsonSchemaFromObjectOptions = IJsonSchemaLoadOptions;

const JSON_SCHEMA_URL_PREFIX_BY_JSON_SCHEMA_VERSION: Map<JsonSchemaVersion, string> = new Map([
  ['draft-04', 'http://json-schema.org/draft-04/schema'],
  ['draft-07', 'http://json-schema.org/draft-07/schema']
]);

/**
 * Helper function to determine the json-schema version to target for validation.
 */
function _inferJsonSchemaVersion({ $schema }: JsonObject): JsonSchemaVersion | undefined {
  if ($schema) {
    for (const [jsonSchemaVersion, urlPrefix] of JSON_SCHEMA_URL_PREFIX_BY_JSON_SCHEMA_VERSION) {
      if ($schema.startsWith(urlPrefix)) {
        return jsonSchemaVersion;
      }
    }
  }
}

/**
 * Represents a JSON schema that can be used to validate JSON data files loaded by the JsonFile class.
 * @remarks
 * The schema itself is normally loaded and compiled later, only if it is actually required to validate
 * an input.  To avoid schema errors at runtime, it's recommended to create a unit test that calls
 * JsonSchema.ensureCompiled() for each of your schema objects.
 *
 * @public
 */
export class JsonSchema {
  private _dependentSchemas: JsonSchema[] = [];
  private _filename: string = '';
  private _validator: ValidateFunction | undefined = undefined;
  private _schemaObject: JsonObject | undefined = undefined;
  private _schemaVersion: JsonSchemaVersion | undefined = undefined;
  private _customFormats:
    | Record<string, IJsonSchemaCustomFormat<string> | IJsonSchemaCustomFormat<number>>
    | undefined = undefined;
  private _rejectVendorExtensionKeywords: boolean = false;

  private constructor() {}

  /**
   * Registers a JsonSchema that will be loaded from a file on disk.
   * @remarks
   * NOTE: An error occurs if the file does not exist; however, the file itself is not loaded or validated
   * until it the schema is actually used.
   */
  public static fromFile(filename: string, options?: IJsonSchemaFromFileOptions): JsonSchema {
    // This is a quick and inexpensive test to avoid the catch the most common errors early.
    // Full validation will happen later in JsonSchema.compile().
    if (!FileSystem.exists(filename)) {
      throw new Error('Schema file not found: ' + filename);
    }

    const schema: JsonSchema = new JsonSchema();
    schema._filename = filename;

    if (options) {
      schema._dependentSchemas = options.dependentSchemas || [];
      schema._schemaVersion = options.schemaVersion;
      schema._customFormats = options.customFormats;
      schema._rejectVendorExtensionKeywords = options.rejectVendorExtensionKeywords ?? false;
    }

    return schema;
  }

  /**
   * Registers a JsonSchema that will be loaded from an object.
   */
  public static fromLoadedObject(
    schemaObject: JsonObject,
    options?: IJsonSchemaFromObjectOptions
  ): JsonSchema {
    const schema: JsonSchema = new JsonSchema();
    schema._schemaObject = schemaObject;

    if (options) {
      schema._dependentSchemas = options.dependentSchemas || [];
      schema._schemaVersion = options.schemaVersion;
      schema._customFormats = options.customFormats;
      schema._rejectVendorExtensionKeywords = options.rejectVendorExtensionKeywords ?? false;
    }

    return schema;
  }

  private static _collectDependentSchemas(
    collectedSchemas: JsonSchema[],
    dependentSchemas: JsonSchema[],
    seenObjects: Set<JsonSchema>,
    seenIds: Set<string>
  ): void {
    for (const dependentSchema of dependentSchemas) {
      // It's okay for the same schema to appear multiple times in the tree, but we only process it once
      if (seenObjects.has(dependentSchema)) {
        continue;
      }
      seenObjects.add(dependentSchema);

      const schemaId: string = dependentSchema._ensureLoaded();
      if (schemaId === '') {
        throw new Error(
          `This schema ${dependentSchema.shortName} cannot be referenced` +
            ' because is missing the "id" (draft-04) or "$id" field'
        );
      }
      if (seenIds.has(schemaId)) {
        throw new Error(
          `This schema ${dependentSchema.shortName} has the same "id" (draft-04) or "$id" as another schema in this set`
        );
      }

      seenIds.add(schemaId);

      collectedSchemas.push(dependentSchema);

      JsonSchema._collectDependentSchemas(
        collectedSchemas,
        dependentSchema._dependentSchemas,
        seenObjects,
        seenIds
      );
    }
  }

  /**
   * Used to nicely format the ZSchema error tree.
   */
  private static _formatErrorDetails(errorDetails: ErrorObject[]): string {
    return JsonSchema._formatErrorDetailsHelper(errorDetails, '', '');
  }

  /**
   * Used by _formatErrorDetails.
   */
  private static _formatErrorDetailsHelper(
    errorDetails: ErrorObject[],
    indent: string,
    buffer: string
  ): string {
    for (const errorDetail of errorDetails) {
      buffer += os.EOL + indent + `Error: #${errorDetail.instancePath}`;

      buffer += os.EOL + indent + `       ${errorDetail.message}`;
      if (errorDetail.params?.additionalProperty) {
        buffer += `: ${errorDetail.params?.additionalProperty}`;
      }
    }

    return buffer;
  }

  /**
   * Returns a short name for this schema, for use in error messages.
   * @remarks
   * If the schema was loaded from a file, then the base filename is used.  Otherwise, the "$id"
   * field is used if available.
   */
  public get shortName(): string {
    if (!this._filename) {
      if (this._schemaObject) {
        const schemaWithId: ISchemaWithId = this._schemaObject as ISchemaWithId;
        if (schemaWithId.id) {
          return schemaWithId.id;
        } else if (schemaWithId.$id) {
          return schemaWithId.$id;
        }
      }
      return '(anonymous schema)';
    } else {
      return path.basename(this._filename);
    }
  }

  /**
   * If not already done, this loads the schema from disk and compiles it.
   * @remarks
   * Any dependencies will be compiled as well.
   */
  public ensureCompiled(): void {
    this._ensureLoaded();

    if (!this._validator) {
      const targetSchemaVersion: JsonSchemaVersion | undefined =
        this._schemaVersion ?? _inferJsonSchemaVersion(this._schemaObject);
      const validatorOptions: AjvOptions = {
        strictSchema: true,
        allowUnionTypes: true
      };

      let validator: Ajv;
      // Keep legacy support for older draft-04 schema
      switch (targetSchemaVersion) {
        case 'draft-04': {
          validator = new AjvDraft04(validatorOptions);
          break;
        }

        case 'draft-07':
        default: {
          validator = new Ajv(validatorOptions);
          break;
        }
      }

      // Enable json-schema format validation
      // https://ajv.js.org/packages/ajv-formats.html
      addFormats(validator);
      if (this._customFormats) {
        for (const [name, format] of Object.entries(this._customFormats)) {
          validator.addFormat(name, { ...format, async: false });
        }
      }

      const collectedSchemas: JsonSchema[] = [];
      const seenObjects: Set<JsonSchema> = new Set<JsonSchema>();
      const seenIds: Set<string> = new Set<string>();

      JsonSchema._collectDependentSchemas(collectedSchemas, this._dependentSchemas, seenObjects, seenIds);

      // Unless explicitly rejected, scan the top-level keys of each schema for vendor
      // extension keys matching the x-<vendor>-<keyword> pattern and register them with
      // AJV so that strict mode does not reject them as unknown keywords.
      if (!this._rejectVendorExtensionKeywords) {
        const vendorKeywords: Set<string> = new Set<string>();
        _collectVendorExtensionKeywords(this._schemaObject, vendorKeywords);
        for (const collectedSchema of collectedSchemas) {
          _collectVendorExtensionKeywords(collectedSchema._schemaObject, vendorKeywords);
        }
        for (const keyword of vendorKeywords) {
          validator.addKeyword(keyword);
        }
      }

      // Validate each schema in order.  We specifically do not supply them all together, because we want
      // to make sure that circular references will fail to validate.
      for (const collectedSchema of collectedSchemas) {
        validator.validateSchema(collectedSchema._schemaObject) as boolean;
        if (validator.errors && validator.errors.length > 0) {
          throw new Error(
            `Failed to validate schema "${collectedSchema.shortName}":` +
              os.EOL +
              JsonSchema._formatErrorDetails(validator.errors)
          );
        }
        validator.addSchema(collectedSchema._schemaObject);
      }

      this._validator = validator.compile(this._schemaObject);
    }
  }

  /**
   * Validates the specified JSON object against this JSON schema.  If the validation fails,
   * an exception will be thrown.
   * @param jsonObject - The JSON data to be validated
   * @param filenameForErrors - The filename that the JSON data was available, or an empty string
   *    if not applicable
   * @param options - Other options that control the validation
   */
  public validateObject(
    jsonObject: JsonObject,
    filenameForErrors: string,
    options?: IJsonSchemaValidateOptions
  ): void {
    this.validateObjectWithCallback(
      jsonObject,
      (errorInfo: IJsonSchemaErrorInfo) => {
        const prefix: string = options?.customErrorHeader ?? 'JSON validation failed:';

        throw new Error(prefix + os.EOL + filenameForErrors + os.EOL + errorInfo.details);
      },
      options
    );
  }

  /**
   * Validates the specified JSON object against this JSON schema.  If the validation fails,
   * a callback is called for each validation error.
   */
  public validateObjectWithCallback(
    jsonObject: JsonObject,
    errorCallback: (errorInfo: IJsonSchemaErrorInfo) => void,
    options?: IJsonSchemaValidateObjectWithOptions
  ): void {
    this.ensureCompiled();

    if (options?.ignoreSchemaField) {
      const {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        $schema,
        ...remainder
      } = jsonObject;
      jsonObject = remainder;
    }

    if (this._validator && !this._validator(jsonObject)) {
      const errorDetails: string = JsonSchema._formatErrorDetails(this._validator.errors!);

      const args: IJsonSchemaErrorInfo = {
        details: errorDetails
      };
      errorCallback(args);
    }
  }

  private _ensureLoaded(): string {
    if (!this._schemaObject) {
      this._schemaObject = JsonFile.load(this._filename);
    }
    return (this._schemaObject as ISchemaWithId).id || (this._schemaObject as ISchemaWithId).$id || '';
  }
}
