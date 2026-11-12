// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IJsonSchemaCompiledValidator } from '@rushstack/node-core-library';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import { ProjectConfigurationFile } from '../ProjectConfigurationFile';

describe('precompiled schema validation', () => {
  const projectFolder: string = __dirname;
  const terminal: Terminal = new Terminal(new StringBufferTerminalProvider(false));

  it('uses the precompiled validator to load project configuration', () => {
    const validator = jest.fn((data: unknown): boolean => (data as { thing?: string }).thing === 'A');
    const loader: ProjectConfigurationFile<{ thing: string }> = new ProjectConfigurationFile({
      projectRelativeFilePath: 'simplestConfigFile/simplestConfigFile.json',
      jsonSchemaValidator: validator
    });

    expect(loader.loadConfigurationFileForProject(terminal, projectFolder).thing).toBe('A');
    expect(validator).toHaveBeenCalledTimes(1);
    expect((validator.mock.calls[0][0] as { thing: string }).thing).toBe('A');
  });

  it('reports validation errors from the precompiled validator', () => {
    const validator: IJsonSchemaCompiledValidator = Object.assign(
      (_data: unknown): boolean => false,
      {
        errors: [
          {
            instancePath: '/thing',
            message: 'must be a string',
            keyword: 'type',
            schemaPath: '#/properties/thing/type',
            params: { type: 'string' }
          }
        ]
      }
    );
    const loader: ProjectConfigurationFile<{ thing: string }> = new ProjectConfigurationFile({
      projectRelativeFilePath: 'simplestConfigFile/simplestConfigFile.json',
      jsonSchemaValidator: validator
    });

    expect(() => loader.loadConfigurationFileForProject(terminal, projectFolder)).toThrow(/must be a string/);
  });
});
