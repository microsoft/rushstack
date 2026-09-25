// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { JsonObject } from '../JsonFile';
import { JsonSchema, type IJsonSchemaFromObjectOptions } from '../JsonSchema';
import { analyzeSchemaForFastPath, isDefinitelyValid } from '../JsonSchemaFastPath';

// The fast path must never change the observable behavior of JsonSchema: these tests compare
// a JsonSchema that can use the fast path with one that has already been compiled with ajv
// (a compiled validator disables the fast path).

interface IOutcome {
  thrown?: string;
  errors: string[];
}

function validate(
  schemaObject: JsonObject,
  data: JsonObject,
  compileFirst: boolean,
  options?: IJsonSchemaFromObjectOptions,
  ignoreSchemaField?: boolean
): IOutcome {
  const outcome: IOutcome = { errors: [] };
  try {
    const schema: JsonSchema = JsonSchema.fromLoadedObject(schemaObject, options);
    if (compileFirst) {
      schema.ensureCompiled();
    }
    schema.validateObjectWithCallback(data, (errorInfo) => outcome.errors.push(errorInfo.details), {
      ignoreSchemaField
    });
  } catch (e) {
    outcome.thrown = (e as Error).message;
  }
  return outcome;
}

function expectSameAsAjv(
  schemaObject: JsonObject,
  data: JsonObject,
  options?: IJsonSchemaFromObjectOptions,
  ignoreSchemaField?: boolean
): IOutcome {
  const withFastPath: IOutcome = validate(schemaObject, data, false, options, ignoreSchemaField);
  const withAjv: IOutcome = validate(schemaObject, data, true, options, ignoreSchemaField);
  expect(withFastPath).toEqual(withAjv);
  return withFastPath;
}

const DRAFT_04: string = 'http://json-schema.org/draft-04/schema#';
const DRAFT_07: string = 'http://json-schema.org/draft-07/schema#';

const OBJECT_SCHEMA: JsonObject = {
  $schema: DRAFT_04,
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 2 },
    list: { type: 'array', items: { type: 'string', pattern: '^[a-z]+$' } }
  }
};

describe('JsonSchemaFastPath', () => {
  it('proves simple valid objects without compiling', () => {
    const plan = analyzeSchemaForFastPath(OBJECT_SCHEMA, {
      schemaVersion: undefined,
      rejectVendorExtensionKeywords: false
    });
    expect(plan).toBeDefined();
    expect(isDefinitelyValid(plan!, { name: 'ab', list: ['x'] })).toBe(true);
    // Invalid data is never "definitely valid"
    expect(isDefinitelyValid(plan!, { name: 'a' })).toBe(false);
    expect(isDefinitelyValid(plan!, { name: 'ab', extra: 1 })).toBe(false);
    // Code points, not UTF-16 code units (like ajv)
    expect(isDefinitelyValid(plan!, { name: '\ud83d\ude00' })).toBe(false);
  });

  it('matches ajv for valid and invalid data', () => {
    expect(expectSameAsAjv(OBJECT_SCHEMA, { name: 'ab', list: ['x', 'y'] })).toEqual({ errors: [] });
    expect(expectSameAsAjv(OBJECT_SCHEMA, { name: 'a' }).errors).toHaveLength(1);
    expect(expectSameAsAjv(OBJECT_SCHEMA, { name: 'ab', list: ['X'] }).errors).toHaveLength(1);
    expectSameAsAjv(OBJECT_SCHEMA, { list: [] });
    expectSameAsAjv(OBJECT_SCHEMA, { name: 'ab', unexpected: true });
  });

  it('honors the schemaVersion option', () => {
    const noSchemaField: JsonObject = { ...OBJECT_SCHEMA, $schema: undefined };
    delete noSchemaField.$schema;
    expectSameAsAjv(noSchemaField, { name: 'ab' }, { schemaVersion: 'draft-04' });
    expectSameAsAjv(noSchemaField, { name: 'ab' }, { schemaVersion: 'draft-07' });
    // Conflicting "$schema" and schemaVersion: ajv reports an error, which the fast path must not hide
    expect(expectSameAsAjv(OBJECT_SCHEMA, { name: 'ab' }, { schemaVersion: 'draft-07' }).thrown).toBeDefined();
    expect(
      analyzeSchemaForFastPath(OBJECT_SCHEMA, { schemaVersion: 'draft-07', rejectVendorExtensionKeywords: false })
    ).toBeUndefined();
  });

  it('honors rejectVendorExtensionKeywords', () => {
    const vendorSchema: JsonObject = { ...OBJECT_SCHEMA, 'x-tsdoc-release-tag': '@beta' };
    expect(expectSameAsAjv(vendorSchema, { name: 'ab' })).toEqual({ errors: [] });
    expect(
      expectSameAsAjv(vendorSchema, { name: 'ab' }, { rejectVendorExtensionKeywords: true }).thrown
    ).toBeDefined();
  });

  it('does not hide schema errors or strict mode errors', () => {
    expect(
      expectSameAsAjv({ $schema: DRAFT_07, type: 'object', properties: { a: { type: 'strng' } } }, {}).thrown
    ).toBeDefined();
    expect(
      expectSameAsAjv({ $schema: DRAFT_07, type: 'object', properties: { a: { bogusKeyword: 1 } } }, {}).thrown
    ).toBeDefined();
    expect(expectSameAsAjv({ $schema: DRAFT_04, type: 'object', required: [] }, {}).thrown).toBeDefined();
  });

  it('strips the $schema field only when ignoreSchemaField is set', () => {
    const data: JsonObject = { $schema: 'https://example.com/schema.json', name: 'ab' };
    expect(expectSameAsAjv(OBJECT_SCHEMA, data, undefined, true)).toEqual({ errors: [] });
    expect(expectSameAsAjv(OBJECT_SCHEMA, data, undefined, false).errors).toHaveLength(1);
  });

  it('is not affected by changes to the schema object after the first validation (like a compiled validator)', () => {
    const schemaObject: JsonObject = JSON.parse(JSON.stringify(OBJECT_SCHEMA));
    const schema: JsonSchema = JsonSchema.fromLoadedObject(schemaObject);
    const errors: string[] = [];
    schema.validateObjectWithCallback({ name: 'ab' }, (errorInfo) => errors.push(errorInfo.details));
    schemaObject.properties.name.minLength = 5;
    schema.validateObjectWithCallback({ name: 'ab' }, (errorInfo) => errors.push(errorInfo.details));
    expect(errors).toEqual([]);
  });
});
