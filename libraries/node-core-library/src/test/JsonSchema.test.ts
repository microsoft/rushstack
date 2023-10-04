// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { JsonFile, type JsonObject } from '../JsonFile';
import { JsonSchema, type IJsonSchemaErrorInfo } from '../JsonSchema';

describe(JsonSchema.name, () => {
  const schemaPath: string = `${__dirname}/test-data/test-schema.json`;
  const schema: JsonSchema = JsonSchema.fromFile(schemaPath);

  test('loadAndValidate successfully validates a JSON file', () => {
    const jsonPath: string = `${__dirname}/test-data/test.json`;
    const jsonObject: JsonObject = JsonFile.loadAndValidate(jsonPath, schema);

    expect(jsonObject).toMatchObject({
      exampleString: 'This is a string',
      exampleArray: ['apple', 'banana', 'coconut']
    });
  });

  test('validateObjectWithCallback successfully reports a compound validation error', () => {
    const jsonPath2: string = `${__dirname}/test-data/test2.json`;
    const jsonObject2: JsonObject = JsonFile.load(jsonPath2);

    const errorDetails: string[] = [];
    schema.validateObjectWithCallback(jsonObject2, (errorInfo: IJsonSchemaErrorInfo) => {
      errorDetails.push(errorInfo.details);
    });

    expect(errorDetails).toMatchSnapshot();
  });
});
