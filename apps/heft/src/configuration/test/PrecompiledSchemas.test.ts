// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';

import { JsonSchema, type IJsonSchemaCompiledValidator } from '@rushstack/node-core-library';

describe('Heft built-in schemas', () => {
  const schemaFolder: string = path.resolve(__dirname, '../../schemas');

  it('publishes a precompiled validator for every JSON schema', () => {
    const schemaFiles: string[] = fs
      .readdirSync(schemaFolder)
      .filter((fileName: string) => fileName.endsWith('.schema.json'));
    expect(schemaFiles.length).toBeGreaterThan(0);

    for (const schemaFile of schemaFiles) {
      const schemaPath: string = path.join(schemaFolder, schemaFile);
      const validatorPath: string = schemaPath.replace(/\.schema\.json$/, '.validator.cjs');
      const validator: IJsonSchemaCompiledValidator = createRequire(schemaPath)(
        validatorPath
      ) as IJsonSchemaCompiledValidator;
      expect(typeof validator).toBe('function');

      const compiledSchema: JsonSchema = JsonSchema.fromCompiledValidator(validator, schemaFile);
      const sourceSchema: JsonSchema = JsonSchema.fromFile(schemaPath);
      for (const example of [{}, { invalid: true }, { taskPlugins: [] }]) {
        let sourceValid: boolean = true;
        try {
          sourceSchema.validateObject(example, 'test.json');
        } catch {
          sourceValid = false;
        }
        if (sourceValid) {
          expect(() => compiledSchema.validateObject(example, 'test.json')).not.toThrow();
        } else {
          expect(() => compiledSchema.validateObject(example, 'test.json')).toThrow();
        }
      }
    }
  });
});
