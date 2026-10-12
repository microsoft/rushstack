// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

let mockRushLibPathHandoff: IRushLibPathHandoff | undefined;
jest.mock('../../utilities/SetRushLibPath', () => ({
  get rushLibPathHandoff(): IRushLibPathHandoff | undefined {
    return mockRushLibPathHandoff;
  }
}));

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { IPackageJson } from '@rushstack/node-core-library';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import { Rush } from '../../api/Rush';
import type { RushConfiguration } from '../../api/RushConfiguration';
import type { RushGlobalFolder } from '../../api/RushGlobalFolder';
import type { IRushLibPathHandoff } from '../../utilities/RushLibPathHandoff';
import type { IBuiltInPluginConfiguration } from '../PluginLoader/BuiltInPluginLoader';
import { PluginManager } from '../PluginManager';
import type { RushSession } from '../RushSession';

const S3_PACKAGE: string = '@rushstack/rush-amazon-s3-build-cache-plugin';
const AZURE_PACKAGE: string = '@rushstack/rush-azure-storage-build-cache-plugin';
const HTTP_PACKAGE: string = '@rushstack/rush-http-build-cache-plugin';

describe(PluginManager.name, () => {
  let folder: string;
  let hostNodeModules: string;

  function addBuiltInPlugins(
    builtInPluginConfigurations: IBuiltInPluginConfiguration[]
  ): IBuiltInPluginConfiguration[] {
    // The constructor adds Rush's own built-in plugins to the host's list.
    new PluginManager({
      terminal: new Terminal(new StringBufferTerminalProvider()),
      rushConfiguration: undefined as unknown as RushConfiguration,
      rushSession: {} as RushSession,
      builtInPluginConfigurations,
      restrictConsoleOutput: false,
      rushGlobalFolder: {} as RushGlobalFolder
    });
    return builtInPluginConfigurations;
  }

  beforeEach(() => {
    folder = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'rush-plugin-manager-')));
    hostNodeModules = path.join(folder, 'deploy', 'apps', 'host', 'node_modules');
    const rushLibLink: string = path.join(hostNodeModules, '@microsoft', 'rush-lib');
    fs.mkdirSync(rushLibLink, { recursive: true });
    fs.writeFileSync(path.join(rushLibLink, 'package.json'), '{}');
    for (const packageName of [S3_PACKAGE, AZURE_PACKAGE]) {
      fs.mkdirSync(path.join(hostNodeModules, packageName), { recursive: true });
      fs.writeFileSync(path.join(hostNodeModules, packageName, 'package.json'), '{}');
    }
    mockRushLibPathHandoff = {
      entryPoint: path.join(rushLibLink, 'lib-commonjs', 'index.js'),
      packageFolder: rushLibLink
    };
    jest.spyOn(Rush, '_rushLibPackageJson', 'get').mockReturnValue({
      name: '@microsoft/rush-lib',
      version: '1.0.0',
      dependencies: {},
      publishOnlyDependencies: {
        [S3_PACKAGE]: 'workspace:*',
        [AZURE_PACKAGE]: 'workspace:*',
        [HTTP_PACKAGE]: 'workspace:*'
      }
    } as IPackageJson);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(folder, { recursive: true, force: true });
  });

  it('registers publish-only built-in plugins that the host installed next to its rush-lib link', () => {
    expect(addBuiltInPlugins([])).toEqual([
      {
        packageName: S3_PACKAGE,
        pluginName: 'rush-amazon-s3-build-cache-plugin',
        pluginPackageFolder: path.join(hostNodeModules, S3_PACKAGE)
      },
      {
        packageName: AZURE_PACKAGE,
        pluginName: 'rush-azure-storage-build-cache-plugin',
        pluginPackageFolder: path.join(hostNodeModules, AZURE_PACKAGE)
      },
      {
        packageName: AZURE_PACKAGE,
        pluginName: 'rush-azure-interactive-auth-plugin',
        pluginPackageFolder: path.join(hostNodeModules, AZURE_PACKAGE)
      }
    ]);
  });

  it('does not add a built-in plugin that the host already provides', () => {
    const hostAzurePlugin: IBuiltInPluginConfiguration = {
      packageName: AZURE_PACKAGE,
      pluginName: 'rush-azure-storage-build-cache-plugin',
      pluginPackageFolder: path.join(folder, 'dev', AZURE_PACKAGE)
    };

    expect(
      addBuiltInPlugins([hostAzurePlugin]).map(({ pluginName, pluginPackageFolder }) => [
        pluginName,
        pluginPackageFolder
      ])
    ).toEqual([
      ['rush-azure-storage-build-cache-plugin', path.join(folder, 'dev', AZURE_PACKAGE)],
      ['rush-amazon-s3-build-cache-plugin', path.join(hostNodeModules, S3_PACKAGE)],
      ['rush-azure-interactive-auth-plugin', path.join(hostNodeModules, AZURE_PACKAGE)]
    ]);
  });

  it('registers no publish-only plugin when rush-lib is not linked next to it', () => {
    const localRushLib: string = path.join(folder, 'deploy', 'libraries', 'rush-lib');
    fs.mkdirSync(localRushLib, { recursive: true });
    mockRushLibPathHandoff = {
      entryPoint: path.join(localRushLib, 'lib-commonjs', 'index.js'),
      packageFolder: localRushLib
    };

    expect(addBuiltInPlugins([])).toEqual([]);
  });
});
