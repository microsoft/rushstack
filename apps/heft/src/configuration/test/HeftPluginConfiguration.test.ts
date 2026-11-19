// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { HeftPluginConfiguration, type IHeftPluginConfigurationJson } from '../HeftPluginConfiguration';

describe('HeftPluginConfiguration', () => {
  let folder: string;

  beforeEach(async () => {
    folder = await fs.mkdtemp(path.join(__dirname, 'plugin-config-'));
  });

  afterEach(async () => {
    await fs.rm(folder, { recursive: true, force: true });
  });

  async function loadAsync(config: IHeftPluginConfigurationJson): Promise<HeftPluginConfiguration> {
    await fs.writeFile(path.join(folder, 'heft-plugin.json'), JSON.stringify(config));
    return await HeftPluginConfiguration.loadFromPackageAsync(folder, 'fixture');
  }

  describe.each(['taskPlugins', 'lifecyclePlugins'] as const)('%s', (pluginType) => {
    const plugins = [
      { pluginName: 'original', entryPoint: './original.js' },
      { pluginName: 'adapter', entryPoint: './adapter.js' }
    ];

    it('selects the declared default rather than the first plugin', async () => {
      const config = await loadAsync({ defaultPluginName: 'adapter', [pluginType]: plugins });
      expect(
        config.getPluginDefinitionBySpecifier({ pluginPackage: 'fixture', pluginPackageRoot: folder })
          .pluginName
      ).toBe('adapter');
    });

    it('lets an explicit pluginName override the default', async () => {
      const config = await loadAsync({ defaultPluginName: 'original', [pluginType]: plugins });
      expect(
        config.getPluginDefinitionBySpecifier({
          pluginPackage: 'fixture',
          pluginPackageRoot: folder,
          pluginName: 'adapter'
        }).pluginName
      ).toBe('adapter');
    });

    it('rejects an unknown explicit pluginName instead of using the default', async () => {
      const config = await loadAsync({ defaultPluginName: 'original', [pluginType]: plugins });
      expect(() =>
        config.getPluginDefinitionBySpecifier({
          pluginPackage: 'fixture',
          pluginPackageRoot: folder,
          pluginName: 'missing'
        })
      ).toThrow('does not contain a plugin named "missing"');
    });

    it('requires a pluginName for multiple plugins without a default', async () => {
      const config = await loadAsync({ [pluginType]: plugins });
      expect(() =>
        config.getPluginDefinitionBySpecifier({ pluginPackage: 'fixture', pluginPackageRoot: folder })
      ).toThrow(/multiple plugins/);
    });

    it('preserves existing single-plugin selection', async () => {
      const config = await loadAsync({ [pluginType]: plugins.slice(0, 1) });
      expect(
        config.getPluginDefinitionBySpecifier({ pluginPackage: 'fixture', pluginPackageRoot: folder })
          .pluginName
      ).toBe('original');
    });

    it('rejects an unknown default when loading the package', async () => {
      await expect(loadAsync({ defaultPluginName: 'missing', [pluginType]: plugins })).rejects.toThrow(
        'Unknown defaultPluginName "missing" in package "fixture".'
      );
    });

    it('rejects an empty defaultPluginName', async () => {
      await expect(loadAsync({ defaultPluginName: '', [pluginType]: plugins })).rejects.toThrow(
        /defaultPluginName/
      );
    });
  });

  it.each(['task', 'lifecycle'])('selects a %s default in a mixed package', async (defaultPluginName) => {
    const config = await loadAsync({
      defaultPluginName,
      taskPlugins: [{ pluginName: 'task', entryPoint: './task.js' }],
      lifecyclePlugins: [{ pluginName: 'lifecycle', entryPoint: './lifecycle.js' }]
    });
    expect(
      config.getPluginDefinitionBySpecifier({ pluginPackage: 'fixture', pluginPackageRoot: folder })
        .pluginName
    ).toBe(defaultPluginName);
  });
});
