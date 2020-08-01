// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import * as path from 'path';
import Validator = require('z-schema');

import { JsonFile, JsonObject } from './JsonFile';
import { FileSystem } from './FileSystem';

interface ISchemaWithId {
  id: string | undefined;
}

/**
 * Callback function arguments for JsonSchema.validateObjectWithCallback();
 * @public
 */
export interface IJsonSchemaErrorInfo {
  /**
   * The z-schema error tree, formatted as an indented text string.
   */
  details: string;
}

/**
 * Options for JsonSchema.validateObject()
 * @public
 */
export interface IJsonSchemaValidateOptions {
  /**
   * A custom header that will be used to report schema errors.
   * @remarks
   * If omitted, the default header is "JSON validation failed:".  The error message starts with
   * the header, followed by the full input filename, followed by the z-schema error tree.
   * If you wish to customize all aspects of the error message, use JsonFile.loadAndValidateWithCallback()
   * or JsonSchema.validateObjectWithCallback().
   */
  customErrorHeader?: string;
}

/**
 * Options for JsonSchema.fromFile()
 * @public
 */
export interface IJsonSchemaFromFileOptions {
  /**
   * Other schemas that this schema references, e.g. via the "$ref" directive.
   * @remarks
   * The tree of dependent schemas may reference the same schema more than once.
   * However, if the same schema "id" is used by two different JsonSchema instances,
   * an error will be reported.  This means you cannot load the same filename twice
   * and use them both together, and you cannot have diamond dependencies on different
   * versions of the same schema.  Although technically this would be possible to support,
   * it normally indicates an error or design problem.
   *
   * JsonSchema also does not allow circular references between schema dependencies.
   */
  dependentSchemas?: JsonSchema[];
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
  private _validator: Validator | undefined = undefined;
  private _schemaObject: JsonObject | undefined = undefined;

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
    }

    return schema;
  }

  /**
   * Registers a JsonSchema that will be loaded from a file on disk.
   * @remarks
   * NOTE: An error occurs if the file does not exist; however, the file itself is not loaded or validated
   * until it the schema is actually used.
   */
  public static fromLoadedObject(schemaObject: JsonObject): JsonSchema {
    const schema: JsonSchema = new JsonSchema();
    schema._schemaObject = schemaObject;
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
            ' because is missing the "id" field'
        );
      }
      if (seenIds.has(schemaId)) {
        throw new Error(
          `This schema ${dependentSchema.shortName} has the same "id" as another schema in this set`
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
  private static _formatErrorDetails(errorDetails: Validator.SchemaErrorDetail[]): string {
    return JsonSchema._formatErrorDetailsHelper(errorDetails, '', '');
  }

  /**
   * Used by _formatErrorDetails.
   */
  private static _formatErrorDetailsHelper(
    errorDetails: Validator.SchemaErrorDetail[],
    indent: string,
    buffer: string
  ): string {
    for (const errorDetail of errorDetails) {
      buffer += os.EOL + indent + `Error: ${errorDetail.path}`;

      if (errorDetail.description) {
        const MAX_LENGTH: number = 40;
        let truncatedDescription: string = errorDetail.description.trim();
        if (truncatedDescription.length > MAX_LENGTH) {
          truncatedDescription = truncatedDescription.substr(0, MAX_LENGTH - 3) + '...';
        }

        buffer += ` (${truncatedDescription})`;
      }

      buffer += os.EOL + indent + `       ${errorDetail.message}`;

      if (errorDetail.inner) {
        buffer = JsonSchema._formatErrorDetailsHelper(errorDetail.inner, indent + '  ', buffer);
      }
    }

    return buffer;
  }

  /**
   * Returns a short name for this schema, for use in error messages.
   * @remarks
   * If the schema was loaded from a file, then the base filename is used.  Otherwise, the "id"
   * field is used if available.
   */
  public get shortName(): string {
    if (!this._filename) {
      if (this._schemaObject) {
        const schemaWithId: ISchemaWithId = this._schemaObject as ISchemaWithId;
        if (schemaWithId.id) {
          return schemaWithId.id;
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
      // Don't assign this to _validator until we're sure everything was successful
      const newValidator: Validator = new Validator({
        breakOnFirstError: false,
        noTypeless: true,
        noExtraKeywords: true
      });

      const anythingSchema: JsonObject = {
        type: ['array', 'boolean', 'integer', 'number', 'object', 'string']
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (newValidator as any).setRemoteReference('http://json-schema.org/draft-04/schema', anythingSchema);

      const collectedSchemas: JsonSchema[] = [];
      const seenObjects: Set<JsonSchema> = new Set<JsonSchema>();
      const seenIds: Set<string> = new Set<string>();

      JsonSchema._collectDependentSchemas(collectedSchemas, this._dependentSchemas, seenObjects, seenIds);

      // Validate each schema in order.  We specifically do not supply them all together, because we want
      // to make sure that circular references will fail to validate.
      for (const collectedSchema of collectedSchemas) {
        if (!newValidator.validateSchema(collectedSchema._schemaObject)) {
          throw new Error(
            `Failed to validate schema "${collectedSchema.shortName}":` +
              os.EOL +
              JsonSchema._formatErrorDetails(newValidator.getLastErrors())
          );
        }
      }

      this._validator = newValidator;
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
    this.validateObjectWithCallback(jsonObject, (errorInfo: IJsonSchemaErrorInfo) => {
      const prefix: string =
        options && options.customErrorHeader ? options.customErrorHeader : 'JSON validation failed:';

      throw new Error(prefix + os.EOL + filenameForErrors + os.EOL + errorInfo.details);
    });
  }

  /**
   * Validates the specified JSON object against this JSON schema.  If the validation fails,
   * a callback is called for each validation error.
   */
  public validateObjectWithCallback(
    jsonObject: JsonObject,
    errorCallback: (errorInfo: IJsonSchemaErrorInfo) => void
  ): void {
    this.ensureCompiled();

    if (!this._validator!.validate(jsonObject, this._schemaObject)) {
      const errorDetails: string = JsonSchema._formatErrorDetails(this._validator!.getLastErrors());

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
    return (this._schemaObject as ISchemaWithId).id || '';
  }
}
