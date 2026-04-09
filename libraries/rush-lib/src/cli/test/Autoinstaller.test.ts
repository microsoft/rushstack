// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import './mockRushCommandLineParser';

import { FileSystem } from '@rushstack/node-core-library';

import { Autoinstaller } from '../../logic/Autoinstaller';
import { InstallHelpers } from '../../logic/installManager/InstallHelpers';
import { RushConstants } from '../../logic/RushConstants';
import { Utilities } from '../../utilities/Utilities';
import {
  getCommandLineParserInstanceAsync,
  isolateEnvironmentConfigurationForTests,
  type IEnvironmentConfigIsolation
} from './TestUtils';

describe(Autoinstaller.name, () => {
  let _envIsolation: IEnvironmentConfigIsolation;

  beforeEach(() => {
    _envIsolation = isolateEnvironmentConfigurationForTests();
  });

  afterEach(() => {
    _envIsolation.restore();
    jest.restoreAllMocks();
  });

  it('moves an existing node_modules folder into the Rush recycler before reinstalling', async () => {
    const { parser, repoPath, spawnMock } = await getCommandLineParserInstanceAsync(
      'pluginWithBuildCommandRepo',
      'update'
    );
  const autoinstallerPath: string = `${repoPath}/common/autoinstallers/plugins`;
  const nodeModulesFolder: string = `${autoinstallerPath}/${RushConstants.nodeModulesFolderName}`;
  const staleFilePath: string = `${nodeModulesFolder}/stale-package/index.js`;
  const recyclerFolder: string = `${parser.rushConfiguration.commonTempFolder}/${RushConstants.rushRecyclerFolderName}`;

    await FileSystem.writeFileAsync(staleFilePath, 'stale', {
      ensureFolderExists: true
    });

    const recyclerEntriesBefore: Set<string> = FileSystem.exists(recyclerFolder)
      ? new Set(FileSystem.readFolderItemNames(recyclerFolder))
    let recyclerEntriesBefore: Set<string>;
    try {
      recyclerEntriesBefore =new Set(await FileSystem.readFolderItemNamesAsync(recyclerFolder));
    } catch (error) {
      if (FileSystem.isNotExistError(error)) {
        recyclerEntriesBefore= new Set();
      } else {
        throw error;
      }
    }

    jest.spyOn(InstallHelpers, 'ensureLocalPackageManagerAsync').mockResolvedValue(undefined);
    jest.spyOn(Utilities, 'syncNpmrc').mockImplementation(() => undefined);
    jest
      .spyOn(Utilities, 'executeCommandAsync')
      .mockImplementation(async (options: Parameters<typeof Utilities.executeCommandAsync>[0]) => {
        await FileSystem.ensureFolderAsync(`${options.workingDirectory}/${RushConstants.nodeModulesFolderName}`);
      });

    const autoinstaller: Autoinstaller = new Autoinstaller({
      autoinstallerName: 'plugins',
      rushConfiguration: parser.rushConfiguration,
      rushGlobalFolder: parser.rushGlobalFolder
    });

    await autoinstaller.prepareAsync();

    const recyclerEntriesAfter: string[] = (await FileSystem.readFolderItemNamesAsync(recyclerFolder)).filter(
      (entry: string) => !recyclerEntriesBefore.has(entry)
    );

    expect(recyclerEntriesAfter).toHaveLength(1);
    await expect(
      FileSystem.existsAsync(`${recyclerFolder}/${recyclerEntriesAfter[0]}/stale-package/index.js`)
    ).resolves.toBe(true);
    await expect(FileSystem.existsAsync(staleFilePath)).resolves.toBe(false);
    await expect(FileSystem.existsAsync(`${nodeModulesFolder}/rush-autoinstaller.flag`)).resolves.toBe(true);

    if (process.platform === 'win32') {
      expect(spawnMock).toHaveBeenCalledWith(
        'cmd.exe',
        expect.arrayContaining(['/c']),
        expect.objectContaining({
          detached: true,
          stdio: 'ignore',
          windowsVerbatimArguments: true
        })
      );
    } else {
      expect(spawnMock).toHaveBeenCalledWith(
        'rm',
        expect.arrayContaining(['-rf']),
        expect.objectContaining({
          detached: true,
          stdio: 'ignore'
        })
      );
    }
  });
});
