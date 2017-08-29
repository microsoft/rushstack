// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types='mocha' />

import { assert } from 'chai';
import * as path from 'path';
import { JsonFile } from '../JsonFile';
import { JsonSchema, IJsonSchemaErrorInfo } from '../JsonSchema';

function normalize(text: string): string {
  return text.replace(/[\r\n ]+/g, ' ')
    .trim();
}

describe('JsonSchema', () => {
  const schemaPath: string = path.resolve(path.join(__dirname, './test-data/test-schema.json'));

  const schema: JsonSchema = JsonSchema.fromFile(schemaPath);

  it('loadAndValidate successfully validates a JSON file', (done: MochaDone) => {
    const jsonPath: string = path.resolve(path.join(__dirname, './test-data/test.json'));
    const jsonObject: Object = JsonFile.loadAndValidate(jsonPath, schema);
    assert.isObject(jsonObject);
    done();
  });

  it('validateObjectWithCallback successfully reports a compound validation error', (done: MochaDone) => {
    const jsonPath2: string = path.resolve(path.join(__dirname, './test-data/test2.json'));
    const jsonObject2: Object = JsonFile.load(jsonPath2);

    const expectedError: string = `
Error: #/exampleOneOf (Description for exampleOneOf - this i...)
    Data does not match any schemas from 'oneOf'
Error: #/exampleOneOf (Description for type1)
      Additional properties not allowed: field2
Error: #/exampleOneOf (Description for type2)
      Missing required property: field3`;

    let errorCount: number = 0;

    schema.validateObjectWithCallback(jsonObject2, (errorInfo: IJsonSchemaErrorInfo) => {
      ++errorCount;
      console.log(errorInfo.details);
      assert.equal(normalize(errorInfo.details), normalize(expectedError),
        'Error #' + errorCount.toString());
    });

    assert.equal(errorCount, 1);
    done();
  });
});
