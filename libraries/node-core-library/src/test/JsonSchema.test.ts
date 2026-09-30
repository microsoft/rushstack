// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { runInNewContext } from 'node:vm';

import Ajv, { type ValidateFunction } from 'ajv';

import { JsonFile, type JsonObject } from '../JsonFile';
import {
  JsonSchema,
  type IJsonSchemaCompiledValidator,
  type IJsonSchemaErrorInfo
} from '../JsonSchema';

const SCHEMA_PATH: string = `${__dirname}/test-data/test-schemas/test-schema.schema.json`;
const DRAFT_04_SCHEMA_PATH: string = `${__dirname}/test-data/test-schemas/test-schema-draft-04.schema.json`;
const DRAFT_07_SCHEMA_PATH: string = `${__dirname}/test-data/test-schemas/test-schema-draft-07.schema.json`;

describe(JsonSchema.name, () => {
  const schema: JsonSchema = JsonSchema.fromFile(SCHEMA_PATH, {
    schemaVersion: 'draft-07'
  });

  describe(JsonFile.loadAndValidate.name, () => {
    test('successfully validates a JSON file', () => {
      const jsonPath: string = `${__dirname}/test-data/test-schemas/test-valid.schema.json`;
      const jsonObject: JsonObject = JsonFile.loadAndValidate(jsonPath, schema);

      expect(jsonObject).toMatchObject({
        exampleString: 'This is a string',
        exampleArray: ['apple', 'banana', 'coconut']
      });
    });

    test('successfully validates a JSON file against a draft-04 schema', () => {
      const schemaDraft04: JsonSchema = JsonSchema.fromFile(DRAFT_04_SCHEMA_PATH);

      const jsonPath: string = `${__dirname}/test-data/test-schemas/test-valid.schema.json`;
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

      const jsonPath: string = `${__dirname}/test-data/test-schemas/test-valid.schema.json`;
      expect(() => JsonFile.loadAndValidate(jsonPath, schemaDraft04)).toThrowErrorMatchingSnapshot();
    });

    test('validates a JSON file against a draft-07 schema', () => {
      const schemaDraft07: JsonSchema = JsonSchema.fromFile(DRAFT_07_SCHEMA_PATH);

      const jsonPath: string = `${__dirname}/test-data/test-schemas/test-valid.schema.json`;
      const jsonObject: JsonObject = JsonFile.loadAndValidate(jsonPath, schemaDraft07);

      expect(jsonObject).toMatchObject({
        exampleString: 'This is a string',
        exampleArray: ['apple', 'banana', 'coconut']
      });
    });

    test('validates a JSON file using nested schemas', () => {
      const schemaPathChild: string = `${__dirname}/test-data/test-schemas/test-schema-nested-child.schema.json`;
      const schemaChild: JsonSchema = JsonSchema.fromFile(schemaPathChild);

      const schemaPathNested: string = `${__dirname}/test-data/test-schemas/test-schema-nested.schema.json`;
      const schemaNested: JsonSchema = JsonSchema.fromFile(schemaPathNested, {
        dependentSchemas: [schemaChild]
      });

      const jsonPath: string = `${__dirname}/test-data/test-schemas/test-valid.schema.json`;
      const jsonObject: JsonObject = JsonFile.loadAndValidate(jsonPath, schemaNested);

      expect(jsonObject).toMatchObject({
        exampleString: 'This is a string',
        exampleArray: ['apple', 'banana', 'coconut']
      });
    });

    test('throws an error for an invalid nested schema', () => {
      const schemaPathChild: string = `${__dirname}/test-data/test-schemas/test-schema-invalid.schema.json`;
      const schemaInvalidChild: JsonSchema = JsonSchema.fromFile(schemaPathChild);

      const schemaPathNested: string = `${__dirname}/test-data/test-schemas/test-schema-nested.schema.json`;
      const schemaNested: JsonSchema = JsonSchema.fromFile(schemaPathNested, {
        dependentSchemas: [schemaInvalidChild]
      });

      const jsonPath: string = `${__dirname}/test-data/test-schemas/test-valid.schema.json`;

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
      const jsonPath: string = `${__dirname}/test-data/test-schemas/test-invalid-additional.schema.json`;
      const jsonObject: JsonObject = JsonFile.load(jsonPath);

      const errorDetails: string[] = [];
      schema.validateObjectWithCallback(jsonObject, (errorInfo: IJsonSchemaErrorInfo) => {
        errorDetails.push(errorInfo.details);
      });

      expect(errorDetails).toMatchSnapshot();
    });
    test('successfully reports a compound validation error for format errors', () => {
      const jsonPath: string = `${__dirname}/test-data/test-schemas/test-invalid-format.schema.json`;
      const jsonObject: JsonObject = JsonFile.load(jsonPath);

      const errorDetails: string[] = [];
      schema.validateObjectWithCallback(jsonObject, (errorInfo: IJsonSchemaErrorInfo) => {
        errorDetails.push(errorInfo.details);
      });

      expect(errorDetails).toMatchSnapshot();
    });
  });

  test('wraps a compiled validator without loading a schema and preserves error formatting', () => {
    const validator: ValidateFunction = new Ajv().compile({
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name']
    });
    const compiledValidator: IJsonSchemaCompiledValidator = validator;
    const compiledSchema: JsonSchema = JsonSchema.fromCompiledValidator(compiledValidator, 'compiled schema');
    const loadSpy = jest.spyOn(JsonFile, 'load');
    try {
      expect(compiledSchema.shortName).toBe('compiled schema');
      expect(() => compiledSchema.ensureCompiled()).not.toThrow();
      expect(() => compiledSchema.validateObject({ name: 'valid' }, 'input.json')).not.toThrow();
      expect(() => compiledSchema.validateObject({}, 'input.json')).toThrow(
        /JSON validation failed:\s+input\.json\s+Error: #\s+must have required property 'name'/
      );
      expect(loadSpy).not.toHaveBeenCalled();
    } finally {
      loadSpy.mockRestore();
    }
    expect(JsonSchema.fromCompiledValidator(validator).shortName).toBe('(anonymous schema)');
  });

  describe(JsonSchema.compileStandaloneCodeFromFile.name, () => {
    test('defaults to CommonJS output', () => {
      const defaultCode: string = JsonSchema.compileStandaloneCodeFromFile(DRAFT_07_SCHEMA_PATH);
      expect(
        JsonSchema.compileStandaloneCodeFromFile(DRAFT_07_SCHEMA_PATH, undefined, {
          moduleFormat: 'commonjs'
        })
      ).toBe(defaultCode);
      expect(defaultCode).toContain('module.exports');
      expect(defaultCode).toMatch(/require\(["']ajv(?:-formats)?\/dist\/[^"']+["']\)/);
      expect(defaultCode).not.toContain('createRequire');
    });

    function loadStandaloneSchema(
      filename: string,
      options?: Parameters<typeof JsonSchema.fromFile>[1]
    ): JsonSchema {
      const code: string = JsonSchema.compileStandaloneCodeFromFile(filename, options);
      expect(code).not.toContain('createRequire');
      expect(code).not.toContain('__rushstackAjvRuntimeRequire');
      const generatedModule: { exports?: IJsonSchemaCompiledValidator } = {};
      const standaloneRequire = (specifier: string): unknown => {
        if (!/^ajv(?:-formats)?\/dist\//.test(specifier)) {
          throw new Error(`Unexpected dependency in generated code: ${specifier}`);
        }
        return require(specifier);
      };
      runInNewContext(code, { module: generatedModule, require: standaloneRequire });
      expect(typeof generatedModule.exports).toBe('function');
      return JsonSchema.fromCompiledValidator(generatedModule.exports!);
    }

    test.each([DRAFT_04_SCHEMA_PATH, DRAFT_07_SCHEMA_PATH])(
      'validates formats and inferred draft version for %s',
      (filename) => {
        const standaloneSchema: JsonSchema = loadStandaloneSchema(filename);
        expect(() =>
          standaloneSchema.validateObject(
            { exampleString: 'hello', exampleArray: [], exampleLink: 'https://example.com' },
            'input.json'
          )
        ).not.toThrow();
        expect(() =>
          standaloneSchema.validateObject(
            { exampleString: 'hello', exampleArray: [], exampleLink: 'not a URI' },
            'input.json'
          )
        ).toThrow(/must match format "uri"/);
      }
    );

    test.each([DRAFT_04_SCHEMA_PATH, DRAFT_07_SCHEMA_PATH])(
      'emits executable ESM with static AJV imports for %s',
      (filename) => {
        const code: string = JsonSchema.compileStandaloneCodeFromFile(filename, undefined, {
          moduleFormat: 'esm'
        });
        expect(code).toMatch(/^import __rushstackAjvRuntime\d+ from "ajv(?:-formats)?\/dist\/[^"]+\.js";/m);
        expect(code).toMatch(/export default validate\d+;/);
        expect(code).not.toMatch(/\brequire\s*\(|\bmodule\.exports\b|createRequire/);

        const validatorName: string = code.match(/export default (validate\d+);/)![1];
        const result: string = execFileSync(
          process.execPath,
          [
            '--input-type=module',
            '--eval',
            `${code}
const valid = { exampleString: 'hello', exampleArray: [], exampleLink: 'https://example.com' };
const invalid = { ...valid, exampleLink: 'not a URI' };
if (!${validatorName}(valid)) throw new Error('Valid input rejected');
if (${validatorName}(invalid)) throw new Error('Invalid URI accepted');
if (!${validatorName}.errors?.some(error => error.keyword === 'format')) {
  throw new Error('Missing format error');
}`
          ],
          { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' }
        );
        expect(result).toBe('');
      }
    );

    test('resolves local $ref schemas and accepts vendor keywords', () => {
      const standaloneSchema: JsonSchema = loadStandaloneSchema(
        `${__dirname}/test-data/test-schemas/test-schema-standalone.schema.json`
      );
      expect(() => standaloneSchema.validateObject({ item: { field1: 'valid' } }, 'input.json')).not.toThrow();
      expect(() => standaloneSchema.validateObject({ item: {} }, 'input.json')).toThrow(
        /must have required property 'field1'/
      );
    });

    test('resolves external $ref schemas supplied as dependentSchemas', () => {
      const childSchema: JsonSchema = JsonSchema.fromFile(
        `${__dirname}/test-data/test-schemas/test-schema-nested-child.schema.json`
      );
      const standaloneSchema: JsonSchema = loadStandaloneSchema(
        `${__dirname}/test-data/test-schemas/test-schema-nested.schema.json`,
        { dependentSchemas: [childSchema] }
      );
      expect(() =>
        standaloneSchema.validateObject(
          { exampleString: 'valid', exampleArray: [], exampleUniqueObjectArray: [{ field2: 'a', field3: 'b' }] },
          'input.json'
        )
      ).not.toThrow();
      expect(() =>
        standaloneSchema.validateObject(
          { exampleString: 'invalid', exampleArray: [], exampleUniqueObjectArray: [{ field2: 'a' }] },
          'input.json'
        )
      ).toThrow(/must have required property 'field3'/);
    });

    test('rejects custom format validation functions, which cannot be serialized', () => {
      expect(() =>
        JsonSchema.compileStandaloneCodeFromFile(DRAFT_07_SCHEMA_PATH, {
          customFormats: { custom: { type: 'string', validate: (value) => value.length > 0 } }
        })
      ).toThrow(/does not support customFormats validation functions/);
    });
  });

  test('accepts vendor extension keywords by default', () => {
    const schemaWithVendorExtensions: JsonSchema = JsonSchema.fromLoadedObject(
      {
        title: 'Test vendor extensions',
        'x-tsdoc-release-tag': '@beta',
        'x-myvendor-html-description': '<b>bold</b>',
        type: 'object',
        properties: {
          name: { type: 'string' }
        },
        additionalProperties: false,
        required: ['name']
      },
      { schemaVersion: 'draft-07' }
    );
    expect(() => schemaWithVendorExtensions.validateObject({ name: 'hello' }, '')).not.toThrow();
  });

  test('rejects vendor extension keywords when rejectVendorExtensionKeywords is enabled', () => {
    const schemaWithVendorExtensions: JsonSchema = JsonSchema.fromLoadedObject(
      {
        title: 'Test vendor extensions rejected',
        'x-tsdoc-release-tag': '@beta',
        type: 'object',
        properties: {
          name: { type: 'string' }
        },
        additionalProperties: false,
        required: ['name']
      },
      { schemaVersion: 'draft-07', rejectVendorExtensionKeywords: true }
    );
    expect(() => schemaWithVendorExtensions.validateObject({ name: 'hello' }, '')).toThrow();
  });

  test('rejects vendor extension keywords that are not at the schema root level', () => {
    const schemaWithNestedVendorExtension: JsonSchema = JsonSchema.fromLoadedObject(
      {
        title: 'Test nested vendor extension',
        type: 'object',
        properties: {
          name: {
            type: 'string',
            'x-myvendor-display-name': 'Name field'
          }
        },
        additionalProperties: false,
        required: ['name']
      },
      { schemaVersion: 'draft-07' }
    );
    expect(() => schemaWithNestedVendorExtension.validateObject({ name: 'hello' }, '')).toThrow();
  });

  test('rejects malformed vendor extension keywords that do not match x-<vendor>-<keyword>', () => {
    // Missing vendor segment: "x-tag" has no second hyphen-separated part
    const schemaWithMalformedTag: JsonSchema = JsonSchema.fromLoadedObject(
      {
        title: 'Test malformed vendor extension',
        'x-tag': '@beta',
        type: 'object',
        properties: {
          name: { type: 'string' }
        },
        additionalProperties: false,
        required: ['name']
      },
      { schemaVersion: 'draft-07' }
    );
    expect(() => schemaWithMalformedTag.validateObject({ name: 'hello' }, '')).toThrow();

    // Uppercase characters in vendor segment
    const schemaWithUppercaseTag: JsonSchema = JsonSchema.fromLoadedObject(
      {
        title: 'Test uppercase vendor extension',
        'x-MyVendor-tag': 'value',
        type: 'object',
        properties: {
          name: { type: 'string' }
        },
        additionalProperties: false,
        required: ['name']
      },
      { schemaVersion: 'draft-07' }
    );
    expect(() => schemaWithUppercaseTag.validateObject({ name: 'hello' }, '')).toThrow();
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
