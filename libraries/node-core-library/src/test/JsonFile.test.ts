// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types='mocha' />

import { assert } from 'chai';
import * as path from 'path';
import { JsonFile } from '../JsonFile';

function normalize(text: string): string {
  return text.replace(/[\r\n ]+/g, ' ')
    .trim();
}

describe('JsonFile', () => {
  const schemaPath: string = path.resolve(path.join(__dirname, './test-data/test-schema.json'));
  const schema: Object = JsonFile.load(schemaPath);

  it('successfully validates a JSON file', (done: MochaDone) => {
    const jsonPath: string = path.resolve(path.join(__dirname, './test-data/test.json'));
    const jsonObject: Object = JsonFile.load(jsonPath);
    JsonFile.validateSchema(jsonObject, schema,
      (errorDescription: string) => {
        throw new Error('Validation failed: ' + errorDescription);
      }
    );
    done();
  });

  it('successfully reports a compound validation error', (done: MochaDone) => {
    const jsonPath2: string = path.resolve(path.join(__dirname, './test-data/test2.json'));
    const jsonObject2: Object = JsonFile.load(jsonPath2);

    const expectedError: string = `
JSON schema validation failed:
  Error: #/exampleOneOf (Description for exampleOneOf - this i...)
         Data does not match any schemas from 'oneOf'
    Error: #/exampleOneOf (Description for type1)
           Additional properties not allowed: field2
    Error: #/exampleOneOf (Description for type2)
           Missing required property: field3`;

    let errorCount: number = 0;
    JsonFile.validateSchema(jsonObject2, schema,
      (errorDescription: string) => {
        ++errorCount;
        // console.log(errorDescription);
        assert.equal(normalize(errorDescription), normalize(expectedError),
          'Error #' + errorCount.toString());
      }
    );
    assert.equal(errorCount, 1);
    done();
  });
});
