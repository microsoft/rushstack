// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

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

  test('loadAndValidate successfully validates a JSON file', () => {
    const jsonPath: string = path.resolve(path.join(__dirname, './test-data/test.json'));
    const jsonObject: Object = JsonFile.loadAndValidate(jsonPath, schema);
    expect(jsonObject).toMatchObject(
      {
        'exampleString': 'This is a string',
        'exampleArray': [
          'apple',
          'banana',
          'coconut'
        ]
      }
    );
  });

  test('validateObjectWithCallback successfully reports a compound validation error', () => {
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
      expect(normalize(errorInfo.details)).toEqual(normalize(expectedError));
    });

    expect(errorCount).toEqual(1);
  });
});
