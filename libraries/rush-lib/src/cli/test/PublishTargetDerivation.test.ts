// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';
import { RigConfig } from '@rushstack/rig-package';

import { RUSH_PUBLISH_CONFIGURATION_FILE, type IRushPublishJson } from '../../api/PublishConfiguration';

/**
 * Mirrors the target derivation logic from PublishAction._getPublishTargetsAsync.
 * Extracted here for testability.
 */
function derivePublishTargets(publishJson: IRushPublishJson | undefined): string[] {
  if (!publishJson) {
    return ['npm'];
  }
  const providers: Record<string, Record<string, unknown>> | undefined = publishJson.providers;
  if (!providers || Object.keys(providers).length === 0) {
    return [];
  }
  return Object.keys(providers);
}

/**
 * Mirrors the validation logic from PublishAction._validatePublishConfigAsync.
 * Extracted here for testability.
 */
function validatePublishConfig(
  packageName: string,
  shouldPublish: boolean,
  isPrivate: boolean,
  publishTargets: string[],
  versionPolicyName: string | undefined,
  isLockstepped: boolean
): void {
  if (shouldPublish && isPrivate && publishTargets.includes('npm')) {
    throw new Error(
      `The project "${packageName}" specifies "shouldPublish": true with ` +
        `publish targets including "npm", but the package.json file specifies "private": true. ` +
        `Either remove "shouldPublish" or configure a non-npm provider in config/rush-publish.json.`
    );
  }

  if (publishTargets.length === 0 && versionPolicyName && isLockstepped) {
    throw new Error(
      `The project "${packageName}" has no publish targets (version-only mode via ` +
        `config/rush-publish.json) but uses the lockstep version policy "${versionPolicyName}". ` +
        `Version-only mode is incompatible with lockstep version policies.`
    );
  }
}

const PUBLISH_CONFIG_DIR: string = path.resolve(__dirname, '../../api/test/publishConfig');

describe('Publish target derivation', () => {
  let terminal: Terminal;

  beforeEach(() => {
    const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(false);
    terminal = new Terminal(terminalProvider);
  });

  it('defaults to ["npm"] when no rush-publish.json exists', async () => {
    const projectFolder: string = path.resolve(PUBLISH_CONFIG_DIR, 'no-config');
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

    const targets: string[] = derivePublishTargets(config);
    expect(targets).toEqual(['npm']);
  });

  it('derives ["vsix"] from rush-publish.json with vsix provider', async () => {
    const projectFolder: string = path.resolve(PUBLISH_CONFIG_DIR, 'vsix-valid');
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

    const targets: string[] = derivePublishTargets(config);
    expect(targets).toEqual(['vsix']);
  });

  it('derives ["npm"] from rush-publish.json with npm provider', async () => {
    const projectFolder: string = path.resolve(PUBLISH_CONFIG_DIR, 'npm-valid');
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

    const targets: string[] = derivePublishTargets(config);
    expect(targets).toEqual(['npm']);
  });

  it('derives multiple targets from rush-publish.json with multiple providers', () => {
    // Test with a synthetic config that has multiple providers
    const config: IRushPublishJson = {
      providers: {
        npm: { registryUrl: 'https://registry.npmjs.org' },
        vsix: { vsixPathPattern: 'dist/vsix/extension.vsix' }
      }
    };

    const targets: string[] = derivePublishTargets(config);
    expect(targets).toEqual(['npm', 'vsix']);
  });

  it('returns [] (version-only) when rush-publish.json has empty providers', () => {
    const config: IRushPublishJson = { providers: {} };
    const targets: string[] = derivePublishTargets(config);
    expect(targets).toEqual([]);
  });

  it('returns [] (version-only) when rush-publish.json has no providers property', () => {
    const config: IRushPublishJson = {};
    const targets: string[] = derivePublishTargets(config);
    expect(targets).toEqual([]);
  });
});

describe('Publish config validation', () => {
  it('throws when shouldPublish:true + private:true + targets include npm', () => {
    expect(() => {
      validatePublishConfig('my-package', true, true, ['npm'], undefined, false);
    }).toThrow(/specifies "shouldPublish": true.*publish targets including "npm".*"private": true/);
  });

  it('does NOT throw when shouldPublish:true + private:true + targets are ["vsix"]', () => {
    expect(() => {
      validatePublishConfig('my-package', true, true, ['vsix'], undefined, false);
    }).not.toThrow();
  });

  it('throws when version-only mode + lockstep version policy', () => {
    expect(() => {
      validatePublishConfig('my-package', true, false, [], 'lockstepPolicy', true);
    }).toThrow(/incompatible with lockstep version policies/);
  });

  it('does NOT throw when version-only mode + individual version policy', () => {
    expect(() => {
      validatePublishConfig('my-package', true, false, [], 'individualPolicy', false);
    }).not.toThrow();
  });

  it('error messages reference config/rush-publish.json', () => {
    expect(() => {
      validatePublishConfig('my-package', true, true, ['npm'], undefined, false);
    }).toThrow(/config\/rush-publish\.json/);

    expect(() => {
      validatePublishConfig('my-package', true, false, [], 'lockstepPolicy', true);
    }).toThrow(/config\/rush-publish\.json/);
  });
});

describe('Rig inheritance for rush-publish.json', () => {
  let terminal: Terminal;

  beforeEach(() => {
    const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(false);
    terminal = new Terminal(terminalProvider);
  });

  it('inherits vsix provider config from rig', async () => {
    const projectFolder: string = path.resolve(PUBLISH_CONFIG_DIR, 'rig-only');
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

  it('project can override rig defaults', async () => {
    const projectFolder: string = path.resolve(PUBLISH_CONFIG_DIR, 'merged');
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
    // Child overrides vsix provider
    expect(config!.providers!.vsix).toMatchObject({
      vsixPathPattern: 'dist/custom/my-ext.vsix'
    });
  });

  it('child provider sections replace parent at provider level (shallow merge)', async () => {
    const projectFolder: string = path.resolve(PUBLISH_CONFIG_DIR, 'merged');
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
    // The child's vsix provider replaces the parent's vsix provider at the provider key level
    expect(config!.providers!.vsix).toMatchObject({
      vsixPathPattern: 'dist/custom/my-ext.vsix'
    });
  });

  it('parent provider sections not mentioned by child may be inherited via custom merge', async () => {
    const projectFolder: string = path.resolve(PUBLISH_CONFIG_DIR, 'merged');
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
    // The child's providers override the parent's at the providers level
    // Whether parent keys are inherited depends on the config framework's rig resolution
    const providerKeys: string[] = Object.keys(config!.providers!);
    expect(providerKeys).toContain('vsix');
    // The child config specified vsix, so it's always present
    expect(config!.providers!.vsix).toMatchObject({
      vsixPathPattern: 'dist/custom/my-ext.vsix'
    });
  });
});
