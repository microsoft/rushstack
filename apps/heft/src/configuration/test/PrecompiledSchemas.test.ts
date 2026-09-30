// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { JsonSchema, type IJsonSchemaCompiledValidator } from '@rushstack/node-core-library';

import anythingValidator from '../../schemas/anything.validator.js';
import copyFilesValidator from '../../schemas/copy-files-options.validator.js';
import deleteFilesValidator from '../../schemas/delete-files-options.validator.js';
import legacyValidator from '../../schemas/heft-legacy.validator.js';
import heftPluginValidator from '../../schemas/heft-plugin.validator.js';
import heftValidator from '../../schemas/heft.validator.js';
import nodeServiceValidator from '../../schemas/node-service.validator.js';
import precompileValidator from '../../schemas/precompile-json-schemas-options.validator.js';
import runScriptValidator from '../../schemas/run-script-options.validator.js';
import setEnvironmentValidator from '../../schemas/set-environment-variables-plugin.validator.js';
import { HeftPluginConfiguration } from '../HeftPluginConfiguration';

describe('Heft built-in schemas', () => {
  const packageRoot: string = path.resolve(__dirname, '../../..');
  const schemaFolder: string = path.join(packageRoot, 'lib-commonjs/schemas');
  const validators: ReadonlyMap<string, IJsonSchemaCompiledValidator> = new Map([
    ['anything.schema.json', anythingValidator],
    ['copy-files-options.schema.json', copyFilesValidator],
    ['delete-files-options.schema.json', deleteFilesValidator],
    ['heft-legacy.schema.json', legacyValidator],
    ['heft-plugin.schema.json', heftPluginValidator],
    ['heft.schema.json', heftValidator],
    ['node-service.schema.json', nodeServiceValidator],
    ['precompile-json-schemas-options.schema.json', precompileValidator],
    ['run-script-options.schema.json', runScriptValidator],
    ['set-environment-variables-plugin.schema.json', setEnvironmentValidator]
  ]);

  it('publishes a precompiled validator for every JSON schema', () => {
    const schemaFiles: string[] = fs
      .readdirSync(schemaFolder)
      .filter((fileName: string) => fileName.endsWith('.schema.json'));
    expect(schemaFiles.length).toBeGreaterThan(0);
    expect(schemaFiles.length).toBe(validators.size);

    let esmImportCount: number = 0;
    for (const schemaFile of schemaFiles) {
      const schemaPath: string = path.join(schemaFolder, schemaFile);
      const validatorPath: string = schemaPath.replace(/\.schema\.json$/, '.validator.js');
      expect(fs.existsSync(validatorPath)).toBe(true);
      const esmValidatorPath: string = path.join(packageRoot, 'lib-esm/schemas', path.basename(validatorPath));
      const esmCode: string = fs.readFileSync(esmValidatorPath, 'utf8');
      if (/import .* from "ajv(?:-formats)?\/dist\//.test(esmCode)) {
        esmImportCount++;
      }
      expect(esmCode).toMatch(/export default validate\d+;/);
      expect(esmCode).not.toContain('require(');
      const validator: IJsonSchemaCompiledValidator = validators.get(schemaFile)!;
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
    expect(esmImportCount).toBeGreaterThan(0);
  });

  it('loads every built-in plugin option schema without compiling a JSON schema', async () => {
    const fromFileSpy = jest.spyOn(JsonSchema, 'fromFile');
    try {
      const plugins: HeftPluginConfiguration = await HeftPluginConfiguration.loadFromPackageAsync(
        packageRoot,
        '@rushstack/heft'
      );
      const manifest: { taskPlugins: { pluginName: string }[] } = JSON.parse(
        fs.readFileSync(path.join(packageRoot, 'heft-plugin.json'), 'utf8')
      );
      for (const plugin of manifest.taskPlugins) {
        expect(plugins.tryGetTaskPluginDefinitionByName(plugin.pluginName)).toBeDefined();
      }
      expect(fromFileSpy).not.toHaveBeenCalled();
    } finally {
      fromFileSpy.mockRestore();
    }
  });
});
