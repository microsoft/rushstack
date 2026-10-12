// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { AlreadyReportedError, FileSystem, Path } from '@rushstack/node-core-library';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';
import type { CommandLineParameter } from '@rushstack/ts-command-line';

import type { IPhase } from '../CommandLineConfiguration';
import type { RushConfigurationProject } from '../RushConfigurationProject';
import { RushProjectConfiguration } from '../RushProjectConfiguration';
import { PhasedCommandEngineProjectConfigurationError } from '../PhasedCommandEngineProjectConfigurationError';

// Several cases write, link and stat many files, which can take more than the default 5 s on a busy
// Windows runner.
jest.setTimeout(30_000);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stripSymbolsFromObject(obj: any | undefined): void {
  if (obj) {
    for (const key of Reflect.ownKeys(obj)) {
      const value: unknown = obj[key];
      if (typeof key === 'symbol') {
        delete obj[key];
      } else if (typeof value === 'object') {
        stripSymbolsFromObject(value);
      }
    }
  }
}

async function loadProjectConfigurationAsync(
  testProjectName: string
): Promise<RushProjectConfiguration | undefined> {
  const testFolder: string = `${__dirname}/jsonFiles/${testProjectName}`;
  const rushProject: RushConfigurationProject = {
    packageName: testProjectName,
    projectFolder: testFolder,
    projectRelativeFolder: testProjectName
  } as RushConfigurationProject;
  const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());
  try {
    const rushProjectConfiguration: RushProjectConfiguration | undefined =
      await RushProjectConfiguration.tryLoadForProjectAsync(rushProject, terminal);
    if (rushProjectConfiguration?.operationSettingsByOperationName) {
      for (const operationSettings of rushProjectConfiguration.operationSettingsByOperationName.values()) {
        stripSymbolsFromObject(operationSettings);
      }
    }

    return rushProjectConfiguration;
  } catch (e) {
    const errorMessage: string = (e as Error).message
      .replace(/\\/g, '/')
      .replace(testFolder.replace(/\\/g, '/'), '<testFolder>');
    throw new Error(errorMessage);
  }
}

function validateConfiguration(rushProjectConfiguration: RushProjectConfiguration | undefined): void {
  const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
  const terminal: Terminal = new Terminal(terminalProvider);

  if (rushProjectConfiguration) {
    try {
      rushProjectConfiguration.validatePhaseConfiguration(
        Array.from(rushProjectConfiguration.operationSettingsByOperationName.keys()).map(
          (phaseName) => ({ name: phaseName, associatedParameters: new Set() }) as IPhase
        ),
        terminal
      );
    } finally {
      expect(terminalProvider.getAllOutputAsChunks({ asLines: true })).toMatchSnapshot();
    }
  }
}

function validateConfigurationWithParameters(
  rushProjectConfiguration: RushProjectConfiguration | undefined,
  parameterNames: string[]
): void {
  const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
  const terminal: Terminal = new Terminal(terminalProvider);

  if (rushProjectConfiguration) {
    try {
      // Create mock parameters with the specified names
      const mockParameters = new Set<CommandLineParameter>(
        parameterNames.map((name) => ({ longName: name }) as CommandLineParameter)
      );

      rushProjectConfiguration.validatePhaseConfiguration(
        Array.from(
          rushProjectConfiguration.operationSettingsByOperationName.keys(),
          (phaseName) => ({ name: phaseName, associatedParameters: mockParameters }) as IPhase
        ),
        terminal
      );
    } finally {
      expect(terminalProvider.getAllOutputAsChunks({ asLines: true })).toMatchSnapshot();
    }
  }
}

describe(RushProjectConfiguration.name, () => {
  describe(RushProjectConfiguration._tryLoadForProjectsUncachedAsync.name, () => {
    let folder: string;
    const write = (relativePath: string, json: object): void => {
      const filename: string = path.join(folder, relativePath);
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      fs.writeFileSync(filename, JSON.stringify(json));
    };
    const project = (name: string): RushConfigurationProject =>
      ({
        packageName: name,
        projectFolder: path.join(folder, name),
        projectRelativeFolder: name
      }) as RushConfigurationProject;
    const loadAsync = (
      ...projects: RushConfigurationProject[]
    ): Promise<ReadonlyMap<RushConfigurationProject, RushProjectConfiguration>> =>
      RushProjectConfiguration._tryLoadForProjectsUncachedAsync(
        projects,
        new Terminal(new StringBufferTerminalProvider())
      );
    const getOutputFolderNames = (
      configuration: RushProjectConfiguration | undefined
    ): string[] | undefined => {
      const outputFolderNames: ReadonlyArray<string> | undefined =
        configuration?.operationSettingsByOperationName.get('_phase:build')?.outputFolderNames;
      return outputFolderNames && [...outputFolderNames];
    };

    beforeEach(() => {
      folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-project-rigs-'));
      for (const name of ['rigged', 'missing-profile', 'own-file']) {
        write(`${name}/package.json`, { name, version: '1.0.0' });
      }
      write('rigged/node_modules/example-rig/package.json', { name: 'example-rig', version: '1.0.0' });
      write('rigged/node_modules/example-rig/profiles/default/config/rush-project.json', {
        operationSettings: [{ operationName: '_phase:build', outputFolderNames: ['from-rig'] }]
      });
      write('rigged/config/rig.json', { rigPackageName: 'example-rig' });
      for (const name of ['missing-profile', 'own-file']) {
        write(`${name}/node_modules/example-rig/package.json`, { name: 'example-rig', version: '1.0.0' });
        write(`${name}/config/rig.json`, { rigPackageName: 'example-rig', rigProfile: 'missing' });
      }
      write('own-file/config/rush-project.json', {
        operationSettings: [{ operationName: '_phase:build', outputFolderNames: ['from-project'] }]
      });
    });

    afterEach(() => {
      fs.rmSync(folder, { recursive: true, force: true });
    });

    it('loads configuration from a rig profile', async () => {
      const rigged: RushConfigurationProject = project('rigged');
      const configurations = await loadAsync(rigged);
      expect(getOutputFolderNames(configurations.get(rigged))).toEqual(['from-rig']);
    });

    it('reports a missing rig profile only when the rig provides the configuration', async () => {
      await expect(loadAsync(project('missing-profile'))).rejects.toThrow(
        'The rig profile "missing" is not defined by the rig package "example-rig"'
      );
      const ownFile: RushConfigurationProject = project('own-file');
      const configurations = await loadAsync(ownFile);
      expect(getOutputFolderNames(configurations.get(ownFile))).toEqual(['from-project']);
    });

    it('names the project whose rig package is not installed, with the native error as the cause', async () => {
      write('uninstalled/package.json', { name: 'uninstalled', version: '1.0.0' });
      write('uninstalled/config/rig.json', { rigPackageName: 'uninstalled-rig' });
      const uninstalled: RushConfigurationProject = project('uninstalled');
      const nativeError: Error = await RushProjectConfiguration.tryLoadForProjectAsync(
        uninstalled,
        new Terminal(new StringBufferTerminalProvider())
      ).then(
        () => {
          throw new Error('The native load succeeded.');
        },
        (error: Error) => error
      );
      expect(nativeError).toMatchObject({ code: 'MODULE_NOT_FOUND' });

      const error: unknown = await loadAsync(project('rigged'), uninstalled).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(PhasedCommandEngineProjectConfigurationError);
      expect(error).toMatchObject({
        projectName: 'uninstalled',
        message: `Rush could not load the configuration of project "uninstalled": ${nativeError.message}`,
        cause: { code: 'MODULE_NOT_FOUND', message: nativeError.message }
      });
    });

    it('does not repeat the message of an error that has already been reported', () => {
      expect(
        new PhasedCommandEngineProjectConfigurationError('reported', new AlreadyReportedError())
      ).toMatchObject({
        projectName: 'reported',
        message: 'Rush could not load the configuration of project "reported".'
      });
    });

    it('loads a rig profile shared through per-project node_modules symlinks once, with native results', async () => {
      write('store/example-rig/package.json', { name: 'example-rig', version: '1.0.0' });
      write('store/example-rig/profiles/default/config/rush-project.json', {
        extends: '../../../shared/rush-project.json',
        operationSettings: [{ operationName: '_phase:build', outputFolderNames: ['from-rig'] }]
      });
      write('store/example-rig/shared/rush-project.json', {
        operationSettings: [{ operationName: '_phase:test', outputFolderNames: ['from-shared'] }]
      });
      const names: string[] = ['linked-1', 'linked-2', 'linked-3', 'linked-own'];
      for (const name of names) {
        write(`${name}/package.json`, { name, version: '1.0.0' });
        write(`${name}/config/rig.json`, { rigPackageName: 'example-rig' });
        fs.mkdirSync(path.join(folder, name, 'node_modules'));
        fs.symlinkSync(
          path.join(folder, 'store/example-rig'),
          path.join(folder, name, 'node_modules/example-rig'),
          'junction'
        );
      }
      write('linked-own/config/rush-project.json', {
        operationSettings: [{ operationName: '_phase:build', outputFolderNames: ['from-project'] }]
      });
      const projects: RushConfigurationProject[] = names.map(project);

      // Files that changed moments ago aren't recorded for reuse, which would read them once more.
      const dateNow: jest.SpyInstance = jest.spyOn(Date, 'now').mockReturnValue(Date.now());
      const readFileAsync: jest.SpyInstance = jest.spyOn(FileSystem, 'readFileAsync');
      let configurations: ReadonlyMap<RushConfigurationProject, RushProjectConfiguration>;
      let readPaths: string[];
      try {
        configurations = await loadAsync(...projects);
        readPaths = readFileAsync.mock.calls.map(([filePath]) => Path.convertToSlashes(filePath));
      } finally {
        readFileAsync.mockRestore();
        dateNow.mockRestore();
      }
      expect(readPaths.filter((p) => p.endsWith('/profiles/default/config/rush-project.json'))).toHaveLength(1);
      expect(readPaths.filter((p) => p.endsWith('/shared/rush-project.json'))).toHaveLength(1);

      for (const linked of projects.slice(0, 3)) {
        expect(getOutputFolderNames(configurations.get(linked))).toEqual(['from-rig']);
        expect([
          ...configurations.get(linked)!.operationSettingsByOperationName.get('_phase:test')!.outputFolderNames!
        ]).toEqual(['from-shared']);
      }
      expect(getOutputFolderNames(configurations.get(projects[3]))).toEqual(['from-project']);

      const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());
      for (const linked of projects) {
        const native: RushProjectConfiguration | undefined = await RushProjectConfiguration.tryLoadForProjectAsync(
          linked,
          terminal
        );
        expect(configurations.get(linked)!._getJsonForFingerprint()).toBe(native!._getJsonForFingerprint());
      }
    });

    describe('reuse of unchanged configurations', () => {
      const realDateNow: () => number = Date.now;
      let dateNow: jest.SpyInstance;
      let readFileAsync: jest.SpyInstance;

      /** Makes every file look as if it had been unchanged for several seconds. */
      const settleFiles = (): void => {
        dateNow.mockImplementation(() => realDateNow() + 10_000);
      };
      /** Makes the files that exist look as if they had just changed, however long the test takes. */
      const stopClock = (): void => {
        dateNow.mockReturnValue(realDateNow());
      };
      const takeReadCount = (): number => {
        const count: number = readFileAsync.mock.calls.length;
        readFileAsync.mockClear();
        return count;
      };
      /** Waits until a write gets a later ctime than the file has, which a coarse clock can delay. */
      const waitForLaterCtime = (relativePath: string): void => {
        const { ctimeNs } = fs.statSync(path.join(folder, relativePath), { bigint: true });
        const probePath: string = path.join(folder, 'probe');
        do {
          fs.writeFileSync(probePath, '');
        } while (fs.statSync(probePath, { bigint: true }).ctimeNs <= ctimeNs);
      };
      const link = (linkPath: string, targetPath: string): void => {
        const fullLinkPath: string = path.join(folder, linkPath);
        fs.mkdirSync(path.dirname(fullLinkPath), { recursive: true });
        // Node 24.11.1 can reject fs.rmSync() for directory symlinks.
        FileSystem.deleteFile(fullLinkPath);
        fs.symlinkSync(path.join(folder, targetPath), fullLinkPath, 'junction');
      };
      const operationSettings = (operationName: string, outputFolderName: string): object => ({
        operationSettings: [{ operationName, outputFolderNames: [outputFolderName] }]
      });
      const getOutputFolders = (
        configuration: RushProjectConfiguration | undefined
      ): Record<string, string[]> =>
        Object.fromEntries(
          Array.from(configuration?.operationSettingsByOperationName ?? [], ([name, settings]) => [
            name,
            [...(settings.outputFolderNames ?? [])]
          ])
        );
      /** Checks the configuration that is loaded for the project, and for a project that has never been loaded. */
      const expectOutputFoldersAsync = async (
        rushProject: RushConfigurationProject,
        expected: Record<string, string[]>
      ): Promise<void> => {
        const unloaded: RushConfigurationProject = project(rushProject.packageName);
        expect(getOutputFolders((await loadAsync(rushProject)).get(rushProject))).toEqual(expected);
        expect(getOutputFolders((await loadAsync(unloaded)).get(unloaded))).toEqual(expected);
      };

      beforeEach(() => {
        dateNow = jest.spyOn(Date, 'now');
        readFileAsync = jest.spyOn(FileSystem, 'readFileAsync');
      });

      afterEach(() => {
        jest.restoreAllMocks();
      });

      it('reuses unchanged configurations without reading any file', async () => {
        settleFiles();
        write('plain/package.json', { name: 'plain', version: '1.0.0' });
        const projects: RushConfigurationProject[] = ['rigged', 'own-file', 'plain'].map(project);
        const first: ReadonlyMap<RushConfigurationProject, RushProjectConfiguration> = await loadAsync(
          ...projects
        );
        expect(takeReadCount()).toBeGreaterThan(0);
        const second: ReadonlyMap<RushConfigurationProject, RushProjectConfiguration> = await loadAsync(
          ...projects
        );
        expect(takeReadCount()).toBe(0);
        expect([...second.keys()]).toEqual(projects.slice(0, 2));
        for (const rushProject of projects.slice(0, 2)) {
          expect(second.get(rushProject)!._getJsonForFingerprint()).toBe(
            first.get(rushProject)!._getJsonForFingerprint()
          );
          expect(getOutputFolders(second.get(rushProject))).toEqual(getOutputFolders(first.get(rushProject)));
        }
      });

      it('loads a configuration again after any file that it was loaded from changes', async () => {
        settleFiles();
        const rigged: RushConfigurationProject = project('rigged');
        await expectOutputFoldersAsync(rigged, { '_phase:build': ['from-rig'] });
        write(
          'rigged/node_modules/example-rig/profiles/default/config/rush-project.json',
          operationSettings('_phase:build', 'from-rig-2')
        );
        await expectOutputFoldersAsync(rigged, { '_phase:build': ['from-rig-2'] });

        // The project's own file takes precedence over the rig's while it exists.
        write('rigged/config/rush-project.json', operationSettings('_phase:build', 'from-project'));
        await expectOutputFoldersAsync(rigged, { '_phase:build': ['from-project'] });
        // An edit that keeps the file's identity, size and modification time
        const ownFilePath: string = path.join(folder, 'rigged/config/rush-project.json');
        fs.utimesSync(ownFilePath, 1_000_000, 1_000_000);
        await expectOutputFoldersAsync(rigged, { '_phase:build': ['from-project'] });
        waitForLaterCtime('rigged/config/rush-project.json');
        write('rigged/config/rush-project.json', operationSettings('_phase:build', 'from-PROJECT'));
        fs.utimesSync(ownFilePath, 1_000_000, 1_000_000);
        await expectOutputFoldersAsync(rigged, { '_phase:build': ['from-PROJECT'] });
        fs.rmSync(ownFilePath);
        await expectOutputFoldersAsync(rigged, { '_phase:build': ['from-rig-2'] });

        write(
          'rigged/node_modules/example-rig/profiles/other/config/rush-project.json',
          operationSettings('_phase:build', 'from-other')
        );
        write('rigged/config/rig.json', { rigPackageName: 'example-rig', rigProfile: 'other' });
        await expectOutputFoldersAsync(rigged, { '_phase:build': ['from-other'] });

        write('rigged/config/base.json', operationSettings('_phase:test', 'from-base'));
        write('rigged/config/rush-project.json', {
          extends: './base.json',
          ...operationSettings('_phase:build', 'from-project')
        });
        await expectOutputFoldersAsync(rigged, {
          '_phase:build': ['from-project'],
          '_phase:test': ['from-base']
        });
        write('rigged/config/base.json', operationSettings('_phase:test', 'from-base-2'));
        await expectOutputFoldersAsync(rigged, {
          '_phase:build': ['from-project'],
          '_phase:test': ['from-base-2']
        });
      });

      it('loads a configuration again after its rig or an extended package resolves to another folder', async () => {
        settleFiles();
        for (const version of ['1', '2']) {
          write(`store/shared-config@${version}/package.json`, { name: 'shared-config', version });
          write(
            `store/shared-config@${version}/rush-project.json`,
            operationSettings('_phase:test', `from-shared-${version}`)
          );
          write(`store/example-rig@${version}/package.json`, { name: 'example-rig', version });
          write(`store/example-rig@${version}/profiles/default/config/rush-project.json`, {
            extends: 'shared-config/rush-project.json',
            ...operationSettings('_phase:build', `from-rig-${version}`)
          });
          link(`store/example-rig@${version}/node_modules/shared-config`, 'store/shared-config@1');
        }
        write('linked/package.json', { name: 'linked', version: '1.0.0' });
        write('linked/config/rig.json', { rigPackageName: 'example-rig' });
        link('linked/node_modules/example-rig', 'store/example-rig@1');
        const linked: RushConfigurationProject = project('linked');
        await expectOutputFoldersAsync(linked, {
          '_phase:build': ['from-rig-1'],
          '_phase:test': ['from-shared-1']
        });
        link('linked/node_modules/example-rig', 'store/example-rig@2');
        await expectOutputFoldersAsync(linked, {
          '_phase:build': ['from-rig-2'],
          '_phase:test': ['from-shared-1']
        });
        link('store/example-rig@2/node_modules/shared-config', 'store/shared-config@2');
        await expectOutputFoldersAsync(linked, {
          '_phase:build': ['from-rig-2'],
          '_phase:test': ['from-shared-2']
        });
      });

      it('loads a configuration again after the rig package leaves the project node_modules folder', async () => {
        settleFiles();
        write('nested/package.json', { name: 'nested', version: '1.0.0' });
        write('nested/config/rig.json', { rigPackageName: 'example-rig' });
        for (const [rigFolderPath, outputFolderName] of [
          ['nested/node_modules/example-rig', 'from-nested'],
          ['node_modules/example-rig', 'from-hoisted']
        ]) {
          write(`${rigFolderPath}/package.json`, { name: 'example-rig', version: '1.0.0' });
          write(
            `${rigFolderPath}/profiles/default/config/rush-project.json`,
            operationSettings('_phase:build', outputFolderName)
          );
        }
        const nested: RushConfigurationProject = project('nested');
        await expectOutputFoldersAsync(nested, { '_phase:build': ['from-nested'] });
        // Without its package.json, the folder no longer provides the rig package, even though the profile
        // folder is still there.
        fs.rmSync(path.join(folder, 'nested/node_modules/example-rig/package.json'));
        await expectOutputFoldersAsync(nested, { '_phase:build': ['from-hoisted'] });
      });

      it('reads a configuration again while any of its files may still be changing', async () => {
        const rigged: RushConfigurationProject = project('rigged');
        const loadTwiceAsync = async (): Promise<number> => {
          await loadAsync(rigged);
          takeReadCount();
          await loadAsync(rigged);
          return takeReadCount();
        };
        stopClock();
        expect(await loadTwiceAsync()).toBeGreaterThan(0);

        settleFiles();
        const rigFilePath: string = path.join(
          folder,
          'rigged/node_modules/example-rig/profiles/default/config/rush-project.json'
        );
        const future: number = realDateNow() / 1000 + 60;
        fs.utimesSync(rigFilePath, future, future);
        expect(await loadTwiceAsync()).toBeGreaterThan(0);
        fs.utimesSync(rigFilePath, 1_000_000, 1_000_000);
        expect(await loadTwiceAsync()).toBe(0);

        // The same holds when rig.json is the only file that may still be changing.
        const rigJsonPath: string = path.join(folder, 'rigged/config/rig.json');
        fs.utimesSync(rigJsonPath, future, future);
        expect(await loadTwiceAsync()).toBeGreaterThan(0);
        fs.utimesSync(rigJsonPath, 1_000_000, 1_000_000);
        expect(await loadTwiceAsync()).toBe(0);
      });

      it('reports errors and warnings on every call', async () => {
        settleFiles();
        write('deprecated/package.json', { name: 'deprecated', version: '1.0.0' });
        write('deprecated/config/rush-project.json', {
          operationSettings: [
            { operationName: '_phase:build', sharding: { count: 2, shardOperationSettings: {} } }
          ]
        });
        write('duplicate/package.json', { name: 'duplicate', version: '1.0.0' });
        write('duplicate/config/rush-project.json', {
          operationSettings: [{ operationName: '_phase:build' }, { operationName: '_phase:build' }]
        });
        const [deprecated, duplicate, missingProfile] = ['deprecated', 'duplicate', 'missing-profile'].map(
          project
        );
        const deprecatedReadCounts: number[] = [];
        for (let i: number = 0; i < 2; i++) {
          const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
          const terminal: Terminal = new Terminal(terminalProvider);
          takeReadCount();
          await RushProjectConfiguration._tryLoadForProjectsUncachedAsync([deprecated], terminal);
          deprecatedReadCounts.push(takeReadCount());
          expect(terminalProvider.getWarningOutput()).toContain(
            'DEPRECATED: The "sharding.shardOperationSettings" field is deprecated.'
          );
          await expect(
            RushProjectConfiguration._tryLoadForProjectsUncachedAsync([duplicate], terminal)
          ).rejects.toThrow();
          expect(terminalProvider.getErrorOutput()).toContain(
            'The operation "_phase:build" appears multiple times'
          );
          await expect(
            RushProjectConfiguration._tryLoadForProjectsUncachedAsync([missingProfile], terminal)
          ).rejects.toThrow('The rig profile "missing" is not defined by the rig package "example-rig"');
        }
        // The second warning comes from a reused configuration.
        expect(deprecatedReadCounts[0]).toBeGreaterThan(0);
        expect(deprecatedReadCounts[1]).toBe(0);
        write(
          'missing-profile/node_modules/example-rig/profiles/missing/config/rush-project.json',
          operationSettings('_phase:build', 'from-missing')
        );
        await expectOutputFoldersAsync(missingProfile, { '_phase:build': ['from-missing'] });
      });

      it('loads a configuration afresh after a load that failed is fixed', async () => {
        settleFiles();
        const rigged: RushConfigurationProject = project('rigged');
        const loadWithReadCountAsync = async (): Promise<[Record<string, string[]>, number]> => {
          takeReadCount();
          const configurations: ReadonlyMap<RushConfigurationProject, RushProjectConfiguration> =
            await loadAsync(rigged);
          return [getOutputFolders(configurations.get(rigged)), takeReadCount()];
        };
        const expectProjectErrorAsync = async (cause: object): Promise<void> => {
          const error: unknown = await loadAsync(rigged).catch((e: unknown) => e);
          expect(error).toBeInstanceOf(PhasedCommandEngineProjectConfigurationError);
          expect(error).toMatchObject({ projectName: 'rigged', cause });
        };
        const ownFilePath: string = 'rigged/config/rush-project.json';
        write(ownFilePath, operationSettings('_phase:build', 'from-project'));
        const recordedContent: string = fs.readFileSync(path.join(folder, ownFilePath)).toString();
        expect((await loadWithReadCountAsync())[0]).toEqual({ '_phase:build': ['from-project'] });
        expect(await loadWithReadCountAsync()).toEqual([{ '_phase:build': ['from-project'] }, 0]);

        waitForLaterCtime(ownFilePath);
        fs.writeFileSync(path.join(folder, ownFilePath), recordedContent.slice(0, -1));
        await expectProjectErrorAsync({});
        await expectProjectErrorAsync({});
        // Even with the content that it had when its configuration was recorded, the file is read again.
        waitForLaterCtime(ownFilePath);
        fs.writeFileSync(path.join(folder, ownFilePath), recordedContent);
        const [fixedOutputFolders, fixedReadCount] = await loadWithReadCountAsync();
        expect(fixedOutputFolders).toEqual({ '_phase:build': ['from-project'] });
        expect(fixedReadCount).toBeGreaterThan(0);
        expect(await loadWithReadCountAsync()).toEqual([{ '_phase:build': ['from-project'] }, 0]);

        fs.rmSync(path.join(folder, ownFilePath));
        write('rigged/config/rig.json', { rigPackageName: 'uninstalled-rig' });
        await expectProjectErrorAsync({ code: 'MODULE_NOT_FOUND' });
        await expectProjectErrorAsync({ code: 'MODULE_NOT_FOUND' });
        write('rigged/node_modules/uninstalled-rig/package.json', {
          name: 'uninstalled-rig',
          version: '1.0.0'
        });
        write(
          'rigged/node_modules/uninstalled-rig/profiles/default/config/rush-project.json',
          operationSettings('_phase:build', 'from-installed-rig')
        );
        const [installedOutputFolders, installedReadCount] = await loadWithReadCountAsync();
        expect(installedOutputFolders).toEqual({ '_phase:build': ['from-installed-rig'] });
        expect(installedReadCount).toBeGreaterThan(0);
        expect(await loadWithReadCountAsync()).toEqual([{ '_phase:build': ['from-installed-rig'] }, 0]);
      });
    });
  });

  describe('operationSettingsByOperationName', () => {
    it('loads a rush-project.json config that extends another config file', async () => {
      const rushProjectConfiguration: RushProjectConfiguration | undefined =
        await loadProjectConfigurationAsync('test-project-a');
      validateConfiguration(rushProjectConfiguration);

      expect(rushProjectConfiguration?.operationSettingsByOperationName).toMatchSnapshot();
    });

    it('throws an error when loading a rush-project.json config that lists an operation twice', async () => {
      await expect(
        async () => await loadProjectConfigurationAsync('test-project-b')
      ).rejects.toThrowErrorMatchingSnapshot();
    });

    it('allows outputFolderNames to be inside subfolders', async () => {
      const rushProjectConfiguration: RushProjectConfiguration | undefined =
        await loadProjectConfigurationAsync('test-project-c');
      validateConfiguration(rushProjectConfiguration);

      expect(rushProjectConfiguration?.operationSettingsByOperationName).toMatchSnapshot();
    });

    it('does not allow one outputFolderName to be under another', async () => {
      const rushProjectConfiguration: RushProjectConfiguration | undefined =
        await loadProjectConfigurationAsync('test-project-d');

      expect(() => validateConfiguration(rushProjectConfiguration)).toThrow();
    });

    it('validates that parameters in parameterNamesToIgnore exist for the operation', async () => {
      const rushProjectConfiguration: RushProjectConfiguration | undefined =
        await loadProjectConfigurationAsync('test-project-e');

      expect(() => validateConfiguration(rushProjectConfiguration)).toThrow();
    });

    it('validates nonexistent parameters when operation has valid parameters', async () => {
      const rushProjectConfiguration: RushProjectConfiguration | undefined =
        await loadProjectConfigurationAsync('test-project-f');

      // Provide some valid parameters for the operation
      expect(() =>
        validateConfigurationWithParameters(rushProjectConfiguration, ['--production', '--verbose'])
      ).toThrow();
    });

    it('validates mix of existent and nonexistent parameters', async () => {
      const rushProjectConfiguration: RushProjectConfiguration | undefined =
        await loadProjectConfigurationAsync('test-project-g');

      // Provide some valid parameters, test-project-g references both valid and invalid ones
      expect(() =>
        validateConfigurationWithParameters(rushProjectConfiguration, ['--production', '--verbose'])
      ).toThrow();
    });
  });

  describe(RushProjectConfiguration.prototype.getCacheDisabledReason.name, () => {
    it('Indicates if the build cache is completely disabled', async () => {
      const config: RushProjectConfiguration | undefined =
        await loadProjectConfigurationAsync('test-project-a');

      if (!config) {
        throw new Error('Failed to load config');
      }

      const reason: string | undefined = config.getCacheDisabledReason([], 'z', false);
      expect(reason).toMatchSnapshot();
    });

    it('Indicates if the phase behavior is not defined', async () => {
      const config: RushProjectConfiguration | undefined =
        await loadProjectConfigurationAsync('test-project-c');

      if (!config) {
        throw new Error('Failed to load config');
      }

      const reason: string | undefined = config.getCacheDisabledReason([], 'z', false);
      expect(reason).toMatchSnapshot();
    });

    it('Indicates if the phase has disabled the cache', async () => {
      const config: RushProjectConfiguration | undefined =
        await loadProjectConfigurationAsync('test-project-c');

      if (!config) {
        throw new Error('Failed to load config');
      }

      const reason: string | undefined = config.getCacheDisabledReason([], '_phase:a', false);
      expect(reason).toMatchSnapshot();
    });

    it('Indicates if tracked files are outputs of the phase', async () => {
      const config: RushProjectConfiguration | undefined =
        await loadProjectConfigurationAsync('test-project-c');

      if (!config) {
        throw new Error('Failed to load config');
      }

      const reason: string | undefined = config.getCacheDisabledReason(
        ['test-project-c/.cache/b/foo'],
        '_phase:b',
        false
      );
      expect(reason).toMatchSnapshot();
    });

    it('returns undefined if the config is safe', async () => {
      const config: RushProjectConfiguration | undefined =
        await loadProjectConfigurationAsync('test-project-c');

      if (!config) {
        throw new Error('Failed to load config');
      }

      const reason: string | undefined = config.getCacheDisabledReason([''], '_phase:b', false);
      expect(reason).toBeUndefined();
    });

    it('returns undefined if the operation is a no-op', async () => {
      const config: RushProjectConfiguration | undefined =
        await loadProjectConfigurationAsync('test-project-c');

      if (!config) {
        throw new Error('Failed to load config');
      }

      const reason: string | undefined = config.getCacheDisabledReason([''], '_phase:b', true);
      expect(reason).toBeUndefined();
    });

    it('returns reason if the operation is runnable', async () => {
      const config: RushProjectConfiguration | undefined =
        await loadProjectConfigurationAsync('test-project-c');

      if (!config) {
        throw new Error('Failed to load config');
      }

      const reason: string | undefined = config.getCacheDisabledReason([], '_phase:a', false);
      expect(reason).toMatchSnapshot();
    });
  });
});
