// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import './mockRushCommandLineParser';

import { FileSystem, JsonFile } from '@rushstack/node-core-library';

import { Autoinstaller, type IAutoinstallerUpdateOptions } from '../../logic/Autoinstaller';
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

    let recyclerEntriesBefore: Set<string>;
    try {
      recyclerEntriesBefore = new Set(await FileSystem.readFolderItemNamesAsync(recyclerFolder));
    } catch (error) {
      if (FileSystem.isNotExistError(error)) {
        recyclerEntriesBefore = new Set();
      } else {
        throw error;
      }
    }

    jest.spyOn(InstallHelpers, 'ensureLocalPackageManagerAsync').mockResolvedValue(undefined);
    jest.spyOn(Utilities, 'syncNpmrc').mockImplementation(() => undefined);
    jest
      .spyOn(Utilities, 'executeCommandAsync')
      .mockImplementation(async (options: Parameters<typeof Utilities.executeCommandAsync>[0]) => {
        await FileSystem.ensureFolderAsync(
          `${options.workingDirectory}/${RushConstants.nodeModulesFolderName}`
        );
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

  describe('updateAsync', () => {
    async function createAutoinstallerAsync(): Promise<Autoinstaller> {
      const { parser } = await getCommandLineParserInstanceAsync('repo', 'update-autoinstaller');
      const autoinstaller: Autoinstaller = new Autoinstaller({
        autoinstallerName: 'tools',
        rushConfiguration: parser.rushConfiguration,
        rushGlobalFolder: parser.rushGlobalFolder,
        restrictConsoleOutput: true
      });
      await JsonFile.saveAsync(
        { name: 'tools', version: '1.0.0', dependencies: { 'example-tool': '1.0.0' } },
        autoinstaller.packageJsonPath,
        { ensureFolderExists: true }
      );
      jest.spyOn(InstallHelpers, 'ensureLocalPackageManagerAsync').mockResolvedValue(undefined);
      jest.spyOn(Utilities, 'syncNpmrc').mockImplementation(() => undefined);
      return autoinstaller;
    }

    it.each([undefined, { preserveLockfile: false }, { preserveLockfile: true }])(
      'only retains both PNPM lockfiles when explicitly requested: %j',
      async (options: IAutoinstallerUpdateOptions | undefined) => {
        const autoinstaller: Autoinstaller = await createAutoinstallerAsync();
        const internalLockfilePath: string = `${autoinstaller.folderFullPath}/node_modules/.pnpm/lock.yaml`;
        await FileSystem.writeFileAsync(autoinstaller.shrinkwrapFilePath, 'old lockfile\r\n');
        await FileSystem.writeFileAsync(internalLockfilePath, 'old internal lockfile\r\n', {
          ensureFolderExists: true
        });

        const executeSpy = jest.spyOn(Utilities, 'executeCommandAsync').mockImplementation(async (command) => {
          if (options?.preserveLockfile) {
            expect(await FileSystem.readFileAsync(autoinstaller.shrinkwrapFilePath)).toBe('old lockfile\r\n');
            expect(await FileSystem.readFileAsync(internalLockfilePath)).toBe('old internal lockfile\r\n');
          } else {
            expect(await FileSystem.existsAsync(autoinstaller.shrinkwrapFilePath)).toBe(false);
            expect(await FileSystem.existsAsync(internalLockfilePath)).toBe(false);
          }
          expect(command).toEqual(
            expect.objectContaining({
              args: options?.preserveLockfile ? ['install', '--no-frozen-lockfile'] : ['install'],
              workingDirectory: autoinstaller.folderFullPath,
              keepEnvironment: true,
              useShell: true
            })
          );
          await FileSystem.writeFileAsync(autoinstaller.shrinkwrapFilePath, 'new lockfile\n');
        });

        await autoinstaller.updateAsync(options);

        expect(executeSpy).toHaveBeenCalledTimes(1);
        expect(Utilities.syncNpmrc).toHaveBeenCalledWith(
          expect.objectContaining({
            targetNpmrcFolder: autoinstaller.folderFullPath,
            supportEnvVarFallbackSyntax: true
          })
        );
        expect(
          await FileSystem.existsAsync(`${autoinstaller.folderFullPath}/node_modules/rush-autoinstaller.flag`)
        ).toBe(false);
      }
    );

    it('requires an existing lockfile instead of silently performing a full update', async () => {
      const autoinstaller: Autoinstaller = await createAutoinstallerAsync();
      const executeSpy = jest.spyOn(Utilities, 'executeCommandAsync');

      await expect(autoinstaller.updateAsync({ preserveLockfile: true })).rejects.toThrow(
        'requires an existing lockfile'
      );
      expect(executeSpy).not.toHaveBeenCalled();
      expect(Utilities.syncNpmrc).not.toHaveBeenCalled();
    });

    it('propagates installation failures without deleting the existing lockfile', async () => {
      const autoinstaller: Autoinstaller = await createAutoinstallerAsync();
      await FileSystem.writeFileAsync(autoinstaller.shrinkwrapFilePath, 'old lockfile\n');
      jest.spyOn(Utilities, 'executeCommandAsync').mockRejectedValue(new Error('install failed'));

      await expect(autoinstaller.updateAsync({ preserveLockfile: true })).rejects.toThrow('install failed');
      expect(await FileSystem.readFileAsync(autoinstaller.shrinkwrapFilePath)).toBe('old lockfile\n');
    });

    it.each(['npm', 'yarn'])('rejects preservation with %s before installing anything', async (packageManager) => {
      const { parser } = await getCommandLineParserInstanceAsync('repo', 'update-autoinstaller');
      Object.assign(parser.rushConfiguration, { isPnpm: false, packageManager });
      const ensureSpy = jest.spyOn(InstallHelpers, 'ensureLocalPackageManagerAsync');
      const autoinstaller: Autoinstaller = new Autoinstaller({
        autoinstallerName: 'tools',
        rushConfiguration: parser.rushConfiguration,
        rushGlobalFolder: parser.rushGlobalFolder
      });

      await expect(autoinstaller.updateAsync({ preserveLockfile: true })).rejects.toThrow(
        'only supported when using PNPM'
      );
      expect(ensureSpy).not.toHaveBeenCalled();
    });
  });

  it.each([false, true])('passes the CLI preserve-lockfile option through: %s', async (preserveLockfile) => {
    const { parser } = await getCommandLineParserInstanceAsync('repo', 'update-autoinstaller');
    process.argv.push('--name', 'tools', ...(preserveLockfile ? ['--preserve-lockfile'] : []));
    const updateSpy = jest.spyOn(Autoinstaller.prototype, 'updateAsync').mockResolvedValue(undefined);
    const prepareSpy = jest.spyOn(Autoinstaller.prototype, 'prepareAsync').mockResolvedValue(undefined);

    await expect(parser.executeAsync()).resolves.toBe(true);

    expect(updateSpy).toHaveBeenCalledWith({ preserveLockfile });
    expect(prepareSpy).not.toHaveBeenCalled();
  });
});
