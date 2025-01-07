// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { JsonFile, type JsonObject } from '../JsonFile';
import { JsonSchema, type IJsonSchemaErrorInfo } from '../JsonSchema';

const SCHEMA_PATH: string = `${__dirname}/test-data/test-schema.json`;
const DRAFT_04_SCHEMA_PATH: string = `${__dirname}/test-data/test-schema-draft-04.json`;
const DRAFT_07_SCHEMA_PATH: string = `${__dirname}/test-data/test-schema-draft-07.json`;

describe(JsonSchema.name, () => {
  const schema: JsonSchema = JsonSchema.fromFile(SCHEMA_PATH, {
    schemaVersion: 'draft-07'
  });

  describe(JsonFile.loadAndValidate.name, () => {
    test('successfully validates a JSON file', () => {
      const jsonPath: string = `${__dirname}/test-data/test-valid.json`;
      const jsonObject: JsonObject = JsonFile.loadAndValidate(jsonPath, schema);

      expect(jsonObject).toMatchObject({
        exampleString: 'This is a string',
        exampleArray: ['apple', 'banana', 'coconut']
      });
    });

    test('successfully validates a JSON file against a draft-04 schema', () => {
      const schemaDraft04: JsonSchema = JsonSchema.fromFile(DRAFT_04_SCHEMA_PATH);

      const jsonPath: string = `${__dirname}/test-data/test-valid.json`;
      const jsonObject: JsonObject = JsonFile.loadAndValidate(jsonPath, schemaDraft04);

      expect(jsonObject).toMatchObject({
        exampleString: 'This is a string',
        exampleArray: ['apple', 'banana', 'coconut']
      });
    });

    test('throws an error if the wrong schema version is explicitly specified for an incompatible schema object', () => {
      const schemaDraft04: JsonSchema = JsonSchema.fromFile(DRAFT_04_SCHEMA_PATH, {
        schemaVersion: 'draft-07'
      });

      const jsonPath: string = `${__dirname}/test-data/test-valid.json`;
      expect(() => JsonFile.loadAndValidate(jsonPath, schemaDraft04)).toThrowErrorMatchingSnapshot();
    });

    test('validates a JSON file against a draft-07 schema', () => {
      const schemaDraft07: JsonSchema = JsonSchema.fromFile(DRAFT_07_SCHEMA_PATH);

      const jsonPath: string = `${__dirname}/test-data/test-valid.json`;
      const jsonObject: JsonObject = JsonFile.loadAndValidate(jsonPath, schemaDraft07);

      expect(jsonObject).toMatchObject({
        exampleString: 'This is a string',
        exampleArray: ['apple', 'banana', 'coconut']
      });
    });

    test('validates a JSON file using nested schemas', () => {
      const schemaPathChild: string = `${__dirname}/test-data/test-schema-nested-child.json`;
      const schemaChild: JsonSchema = JsonSchema.fromFile(schemaPathChild);

      const schemaPathNested: string = `${__dirname}/test-data/test-schema-nested.json`;
      const schemaNested: JsonSchema = JsonSchema.fromFile(schemaPathNested, {
        dependentSchemas: [schemaChild]
      });

      const jsonPath: string = `${__dirname}/test-data/test-valid.json`;
      const jsonObject: JsonObject = JsonFile.loadAndValidate(jsonPath, schemaNested);

      expect(jsonObject).toMatchObject({
        exampleString: 'This is a string',
        exampleArray: ['apple', 'banana', 'coconut']
      });
    });

    test('throws an error for an invalid nested schema', () => {
      const schemaPathChild: string = `${__dirname}/test-data/test-schema-invalid.json`;
      const schemaInvalidChild: JsonSchema = JsonSchema.fromFile(schemaPathChild);

      const schemaPathNested: string = `${__dirname}/test-data/test-schema-nested.json`;
      const schemaNested: JsonSchema = JsonSchema.fromFile(schemaPathNested, {
        dependentSchemas: [schemaInvalidChild]
      });

      const jsonPath: string = `${__dirname}/test-data/test-valid.json`;

      expect.assertions(1);
      try {
        JsonFile.loadAndValidate(jsonPath, schemaNested);
      } catch (err) {
        expect(err.message).toMatchSnapshot();
      }
    });
  });

  describe(JsonSchema.prototype.validateObjectWithCallback.name, () => {
    test('successfully reports a compound validation error schema errors', () => {
      const jsonPath: string = `${__dirname}/test-data/test-invalid-additional.json`;
      const jsonObject: JsonObject = JsonFile.load(jsonPath);

      const errorDetails: string[] = [];
      schema.validateObjectWithCallback(jsonObject, (errorInfo: IJsonSchemaErrorInfo) => {
        errorDetails.push(errorInfo.details);
      });

      expect(errorDetails).toMatchSnapshot();
    });
    test('successfully reports a compound validation error for format errors', () => {
      const jsonPath: string = `${__dirname}/test-data/test-invalid-format.json`;
      const jsonObject: JsonObject = JsonFile.load(jsonPath);

      const errorDetails: string[] = [];
      schema.validateObjectWithCallback(jsonObject, (errorInfo: IJsonSchemaErrorInfo) => {
        errorDetails.push(errorInfo.details);
      });

      expect(errorDetails).toMatchSnapshot();
    });
  });

  test('successfully applies custom formats', () => {
    const schemaWithCustomFormat = JsonSchema.fromLoadedObject(
      {
        title: 'Test Custom Format',
        type: 'object',
        properties: {
          exampleNumber: {
            type: 'number',
            format: 'uint8'
          }
        },
        additionalProperties: false,
        required: ['exampleNumber']
      },
      {
        schemaVersion: 'draft-07',
        customFormats: {
          uint8: {
            type: 'number',
            validate: (data) => data >= 0 && data <= 255
          }
        }
      }
    );
    expect(() => schemaWithCustomFormat.validateObject({ exampleNumber: 10 }, '')).not.toThrow();
    expect(() => schemaWithCustomFormat.validateObject({ exampleNumber: 1000 }, '')).toThrow();
  });
});
