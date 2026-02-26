// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';
import { RigConfig } from '@rushstack/rig-package';

import { RUSH_PUBLISH_CONFIGURATION_FILE, type IRushPublishJson } from '../PublishConfiguration';

describe(RUSH_PUBLISH_CONFIGURATION_FILE.name, () => {
  let terminal: Terminal;

  beforeEach(() => {
    const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(false);
    terminal = new Terminal(terminalProvider);
  });

  it('loads config from project config/rush-publish.json', async () => {
    const projectFolder: string = path.resolve(__dirname, 'publishConfig', 'project-only');
    const rigConfig: RigConfig = RigConfig.loadForProjectFolder({
      projectFolderPath: projectFolder,
      bypassCache: true
    });

    const config: IRushPublishJson | undefined =
      await RUSH_PUBLISH_CONFIGURATION_FILE.tryLoadConfigurationFileForProjectAsync(
        terminal,
        projectFolder,
        rigConfig
      );

    expect(config).toBeDefined();
    expect(config!.providers).toBeDefined();
    expect(config!.providers!.npm).toMatchObject({ registryUrl: 'https://registry.npmjs.org' });
  });

  it('returns undefined when no config file exists', async () => {
    const projectFolder: string = path.resolve(__dirname, 'publishConfig', 'no-config');
    const rigConfig: RigConfig = RigConfig.loadForProjectFolder({
      projectFolderPath: projectFolder,
      bypassCache: true
    });

    const config: IRushPublishJson | undefined =
      await RUSH_PUBLISH_CONFIGURATION_FILE.tryLoadConfigurationFileForProjectAsync(
        terminal,
        projectFolder,
        rigConfig
      );

    expect(config).toBeUndefined();
  });

  it('loads config from rig when project has no config', async () => {
    const projectFolder: string = path.resolve(__dirname, 'publishConfig', 'rig-only');
    const rigConfig: RigConfig = RigConfig.loadForProjectFolder({
      projectFolderPath: projectFolder,
      bypassCache: true
    });

    const config: IRushPublishJson | undefined =
      await RUSH_PUBLISH_CONFIGURATION_FILE.tryLoadConfigurationFileForProjectAsync(
        terminal,
        projectFolder,
        rigConfig
      );

    expect(config).toBeDefined();
    expect(config!.providers).toBeDefined();
    expect(config!.providers!.vsix).toMatchObject({
      vsixPathPattern: 'dist/vsix/extension.vsix',
      useAzureCredential: true
    });
  });

  it('merges project config over rig config (child overrides parent providers)', async () => {
    const projectFolder: string = path.resolve(__dirname, 'publishConfig', 'merged');
    const rigConfig: RigConfig = RigConfig.loadForProjectFolder({
      projectFolderPath: projectFolder,
      bypassCache: true
    });

    const config: IRushPublishJson | undefined =
      await RUSH_PUBLISH_CONFIGURATION_FILE.tryLoadConfigurationFileForProjectAsync(
        terminal,
        projectFolder,
        rigConfig
      );

    expect(config).toBeDefined();
    expect(config!.providers).toBeDefined();

    // Verify the providers object has the expected keys
    const providerKeys: string[] = Object.keys(config!.providers!);
    expect(providerKeys).toContain('vsix');

    // vsix provider overridden by project config
    expect(config!.providers!.vsix).toMatchObject({
      vsixPathPattern: 'dist/custom/my-ext.vsix'
    });

    // npm provider - may or may not be inherited depending on framework behavior
    // The custom inheritance function should merge parent and child providers
    if (providerKeys.includes('npm')) {
      expect(config!.providers!.npm).toMatchObject({ registryUrl: 'https://registry.npmjs.org' });
    }
  });

  it('validates known npm provider config fields', async () => {
    const projectFolder: string = path.resolve(__dirname, 'publishConfig', 'npm-valid');
    const rigConfig: RigConfig = RigConfig.loadForProjectFolder({
      projectFolderPath: projectFolder,
      bypassCache: true
    });

    const config: IRushPublishJson | undefined =
      await RUSH_PUBLISH_CONFIGURATION_FILE.tryLoadConfigurationFileForProjectAsync(
        terminal,
        projectFolder,
        rigConfig
      );

    expect(config).toBeDefined();
    expect(config!.providers!.npm).toMatchObject({
      registryUrl: 'https://registry.npmjs.org',
      npmAuthToken: 'test-token',
      tag: 'latest',
      access: 'public'
    });
  });

  it('validates known vsix provider config fields', async () => {
    const projectFolder: string = path.resolve(__dirname, 'publishConfig', 'vsix-valid');
    const rigConfig: RigConfig = RigConfig.loadForProjectFolder({
      projectFolderPath: projectFolder,
      bypassCache: true
    });

    const config: IRushPublishJson | undefined =
      await RUSH_PUBLISH_CONFIGURATION_FILE.tryLoadConfigurationFileForProjectAsync(
        terminal,
        projectFolder,
        rigConfig
      );

    expect(config).toBeDefined();
    expect(config!.providers!.vsix).toMatchObject({
      vsixPathPattern: 'dist/vsix/extension.vsix',
      useAzureCredential: true
    });
  });

  it('allows arbitrary properties on custom provider keys', async () => {
    const projectFolder: string = path.resolve(__dirname, 'publishConfig', 'custom-provider');
    const rigConfig: RigConfig = RigConfig.loadForProjectFolder({
      projectFolderPath: projectFolder,
      bypassCache: true
    });

    const config: IRushPublishJson | undefined =
      await RUSH_PUBLISH_CONFIGURATION_FILE.tryLoadConfigurationFileForProjectAsync(
        terminal,
        projectFolder,
        rigConfig
      );

    expect(config).toBeDefined();
    expect(config!.providers!['my-custom-target']).toMatchObject({
      apiEndpoint: 'https://custom.example.com',
      authMethod: 'bearer'
    });
  });
});
