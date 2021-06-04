// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JestConfigLoader } from '../JestConfigLoader';

import type { Config } from '@jest/types';

describe('JestConfigLoader', () => {
  it('resolves preset config modules', async () => {
    const rootDir: string = path.join(__dirname, 'project1');
    const configPath: string = path.join(rootDir, 'config', 'jest.config.json');
    const loadedConfig: Config.InitialOptions = await JestConfigLoader.loadConfigAsync(configPath, rootDir);

    // Resolution of string fields is validated implicitly during load since the preset is resolved and
    // set to undefined
    expect(loadedConfig.preset).toBe(undefined);

    // Validate string[]
    expect(loadedConfig.setupFiles?.length).toBe(2);
    expect(loadedConfig.setupFiles![0]).toBe(path.join(rootDir, 'a', 'b', 'setupFile2.js'));
    expect(loadedConfig.setupFiles![1]).toBe(path.join(rootDir, 'a', 'b', 'setupFile1.js'));

    // Validate reporters
    expect(loadedConfig.reporters?.length).toBe(3);
    expect(loadedConfig.reporters![0]).toBe('default');
    expect(loadedConfig.reporters![1]).toBe(path.join(rootDir, 'a', 'c', 'mockReporter1.js'));
    expect((loadedConfig.reporters![2] as Config.ReporterConfig)[0]).toBe(
      path.join(rootDir, 'a', 'c', 'd', 'mockReporter2.js')
    );

    // Validate transformers
    expect(Object.keys(loadedConfig.transform || {}).length).toBe(2);
    expect(loadedConfig.transform!['\\.(xxx)$']).toBe(
      path.join(rootDir, 'a', 'b', 'mockTransformModule1.js')
    );
    expect((loadedConfig.transform!['\\.(yyy)$'] as Config.TransformerConfig)[0]).toBe(
      path.join(rootDir, 'a', 'b', 'mockTransformModule2.js')
    );
  });

  it('resolves preset package modules', async () => {
    const rootDir: string = path.join(__dirname, 'project2');
    const configPath: string = path.join(rootDir, 'config', 'jest.config.json');
    const loadedConfig: Config.InitialOptions = await JestConfigLoader.loadConfigAsync(configPath, rootDir);

    expect(loadedConfig.setupFiles?.length).toBe(1);
    expect(loadedConfig.setupFiles![0]).toBe(require.resolve('@jest/core'));
  });
});
