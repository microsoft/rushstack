// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { StringBufferTerminalProvider, Terminal, type ITerminal } from '@rushstack/terminal';

import type { BuildCacheConfiguration } from '../../../api/BuildCacheConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import type { IUntarOptions, TarExecutable } from '../../../utilities/TarExecutable';
import type { IBaseOperationExecutionResult } from '../../operations/IOperationExecutionResult';
import type { IGenerateCacheEntryIdOptions } from '../CacheEntryId';
import { OperationBuildCache, _setTarUtilityPromiseForTesting } from '../OperationBuildCache';

const SUCCESS_LINE: string = 'Successfully restored output from the build cache.';
const WARNING_LINE: string = 'Unable to restore output from the build cache.';
const SKIP_LINE: string = 'The output folders already match this cache entry; nothing to restore.';
const METADATA_FOLDER: string = '.rush/temp/operation/_phase_build';
const STAGING_FOLDER_PREFIX: string = 'build-cache-restore-';
const CACHE_ID: string = 'acme-hash1';

// A fake cache entry: the project-relative path and content of each file.
type FakeArchive = Record<string, string>;

// Each file and folder under some folders: its type and mode, and a file's content or a link's target.
type Snapshot = Record<string, string>;

const ENTRY: FakeArchive = {
  'lib/plugin.js': 'new plugin',
  'lib/out.txt': 'out',
  'lib/nested/deep/data.json': '{"a":1}',
  [`${METADATA_FOLDER}/state.json`]: '{}'
};

const OLD_OUTPUTS: FakeArchive = {
  ...ENTRY,
  'lib/plugin.js': 'old plugin',
  'lib/out.txt': 'old out'
};

const DEEP_ENTRY: FakeArchive = {
  'lib/a/b/c/d/e.txt': 'e',
  'lib/a/b/c/f.txt': 'f',
  'lib/a/b/x.txt': 'x',
  'lib/a/y.txt': 'y',
  'lib/top.txt': 'top',
  [`${METADATA_FOLDER}/state.json`]: '{}'
};

interface ISubjectOptions {
  outputFolderNames?: string[];
}

interface IRestoreResult {
  result: boolean;
  output: string;
  verbose: string;
  warning: string;
}

interface IOldState {
  outputFolderNames?: string[];
  archive?: FakeArchive;
  setUp: () => void;
  check?: () => void;
}

describe('OperationBuildCache restores through a staging folder', () => {
  let rootFolder: string;
  let projectFolder: string;
  let cacheFolder: string;
  let untarStartHook: ((outputFolderPath: string) => void) | undefined;
  let untarEndHook: ((outputFolderPath: string) => void) | undefined;
  let untarMock: jest.Mock<Promise<number>, [IUntarOptions]>;

  beforeEach(() => {
    rootFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-build-cache-staging-'));
    projectFolder = path.join(rootFolder, 'project');
    cacheFolder = path.join(rootFolder, 'cache');
    fs.mkdirSync(projectFolder);
    fs.mkdirSync(cacheFolder);
    untarStartHook = undefined;
    untarEndHook = undefined;

    untarMock = jest.fn(async ({ archivePath, outputFolderPath }: IUntarOptions) => {
      untarStartHook?.(outputFolderPath);
      writeFiles(outputFolderPath, JSON.parse(fs.readFileSync(archivePath, 'utf8')));
      untarEndHook?.(outputFolderPath);
      return 0;
    });
    _setTarUtilityPromiseForTesting(
      Promise.resolve({ tryUntarAsync: untarMock } as unknown as TarExecutable)
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    _setTarUtilityPromiseForTesting(undefined);
    fs.rmSync(rootFolder, { recursive: true, force: true });
  });

  function writeFiles(folderPath: string, files: FakeArchive): void {
    for (const [relativePath, content] of Object.entries(files)) {
      const filePath: string = path.join(folderPath, relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content);
    }
  }

  function takeSnapshot(folderPath: string, folderNames: ReadonlyArray<string>): Snapshot {
    const snapshot: Snapshot = {};
    function visit(relativePath: string): void {
      const itemPath: string = path.join(folderPath, relativePath);
      const stats: fs.Stats | undefined = fs.lstatSync(itemPath, { throwIfNoEntry: false });
      if (!stats) {
        return;
      }
      // eslint-disable-next-line no-bitwise
      const mode: string = (stats.mode & 0o7777).toString(8);
      if (stats.isSymbolicLink()) {
        snapshot[relativePath] = `link ${fs.readlinkSync(itemPath)}`;
      } else if (stats.isDirectory()) {
        snapshot[relativePath] = `folder ${mode}`;
        for (const name of fs.readdirSync(itemPath).sort()) {
          visit(`${relativePath}/${name}`);
        }
      } else {
        snapshot[relativePath] = `file ${mode} ${fs.readFileSync(itemPath, 'utf8')}`;
      }
    }
    for (const folderName of folderNames) {
      visit(folderName);
    }
    return snapshot;
  }

  // What a fresh extraction of the entry into an empty folder holds.
  function getExpectedSnapshot(archive: FakeArchive, folderNames: ReadonlyArray<string>): Snapshot {
    const oracleFolder: string = fs.mkdtempSync(path.join(rootFolder, 'oracle-'));
    writeFiles(oracleFolder, archive);
    return takeSnapshot(oracleFolder, folderNames);
  }

  function getStagingFolders(): string[] {
    const rushTempFolder: string = path.join(projectFolder, '.rush', 'temp');
    return fs.existsSync(rushTempFolder)
      ? fs.readdirSync(rushTempFolder).filter((name: string) => name.startsWith(STAGING_FOLDER_PREFIX))
      : [];
  }

  function getProject(): RushConfigurationProject {
    return {
      packageName: 'acme',
      projectFolder,
      projectRushTempFolder: path.join(projectFolder, '.rush', 'temp')
    } as unknown as RushConfigurationProject;
  }

  function getBuildCacheConfiguration(): BuildCacheConfiguration {
    return {
      buildCacheEnabled: true,
      cacheWriteEnabled: true,
      getCacheEntryId: ({ projectName, projectStateHash }: IGenerateCacheEntryIdOptions) =>
        `${projectName}-${projectStateHash}`,
      localCacheProvider: {
        getCacheEntryPath: (cacheId: string) => path.join(cacheFolder, cacheId),
        tryGetCacheEntryPathByIdAsync: async (terminal: ITerminal, cacheId: string) => {
          const cacheEntryPath: string = path.join(cacheFolder, cacheId);
          return fs.existsSync(cacheEntryPath) ? cacheEntryPath : undefined;
        }
      },
      cloudCacheProvider: undefined
    } as unknown as BuildCacheConfiguration;
  }

  function createSubject(options: ISubjectOptions = {}): OperationBuildCache {
    const { outputFolderNames = ['lib'] } = options;
    const project: RushConfigurationProject = getProject();
    const executionResult: IBaseOperationExecutionResult = {
      operation: {
        settings: { outputFolderNames },
        associatedProject: project,
        associatedPhase: { name: '_phase:build' },
        logFilenameIdentifier: '_phase_build'
      },
      metadataFolderPath: METADATA_FOLDER,
      getStateHash: () => 'hash1'
    } as unknown as IBaseOperationExecutionResult;
    return OperationBuildCache.forOperation(executionResult, {
      buildCacheConfiguration: getBuildCacheConfiguration(),
      terminal: new Terminal(new StringBufferTerminalProvider()),
      excludeAppleDoubleFiles: false,
      useDirectFileTransfersForBuildCache: false
    });
  }

  function seedEntry(archive: FakeArchive = ENTRY): void {
    fs.writeFileSync(path.join(cacheFolder, CACHE_ID), JSON.stringify(archive));
  }

  async function restoreAsync(subject: OperationBuildCache): Promise<IRestoreResult> {
    const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
    const result: boolean = await subject.tryRestoreFromCacheAsync(new Terminal(terminalProvider));
    return {
      result,
      output: terminalProvider.getOutput(),
      verbose: terminalProvider.getVerboseOutput(),
      warning: terminalProvider.getWarningOutput()
    };
  }

  // Calls the check after each call of the fs.promises function, and passes the call through.
  function spyAfterEachCall(name: 'rename' | 'rm' | 'unlink' | 'chmod', check: (when: string) => void): void {
    const original: (...args: unknown[]) => Promise<unknown> = fs.promises[name] as unknown as (
      ...args: unknown[]
    ) => Promise<unknown>;
    jest.spyOn(fs.promises, name).mockImplementation((async (...args: unknown[]) => {
      try {
        return await original(...args);
      } finally {
        check(`after ${name} ${args[0]}`);
      }
    }) as never);
  }

  it('U1: never leaves a file that the old outputs and the entry both have missing', async () => {
    writeFiles(projectFolder, OLD_OUTPUTS);
    seedEntry();
    const pluginPath: string = path.join(projectFolder, 'lib/plugin.js');
    const checks: string[] = [];
    const missing: string[] = [];
    const check: (when: string) => void = (when: string) => {
      checks.push(when);
      if (!fs.existsSync(pluginPath)) {
        missing.push(when);
      }
    };
    untarStartHook = () => check('when the untar starts');
    untarEndHook = () => check('when the untar ends');
    for (const name of ['rename', 'rm', 'unlink', 'chmod'] as const) {
      spyAfterEachCall(name, check);
    }

    const { result } = await restoreAsync(createSubject());

    expect(missing).toEqual([]);
    // The check ran after the rename that put the new plugin.js in place.
    expect(checks).toContain(
      `after rename ${path.join(untarMock.mock.calls[0][0].outputFolderPath, 'lib/plugin.js')}`
    );
    expect(result).toBe(true);
    expect(fs.readFileSync(pluginPath, 'utf8')).toBe('new plugin');
    expect(getStagingFolders()).toEqual([]);
  });

  const oldStates: [string, IOldState][] = [
    ['a: a stray file', { setUp: () => writeFiles(projectFolder, { ...ENTRY, 'lib/stray.txt': 'stray' }) }],
    [
      'b: a stray folder with a file',
      { setUp: () => writeFiles(projectFolder, { ...ENTRY, 'lib/stray/file.txt': 'stray' }) }
    ],
    [
      'c: a deleted file',
      {
        setUp: () => {
          writeFiles(projectFolder, ENTRY);
          fs.unlinkSync(path.join(projectFolder, 'lib/nested/deep/data.json'));
        }
      }
    ],
    ['d: a changed file', { setUp: () => writeFiles(projectFolder, OLD_OUTPUTS) }],
    [
      'e: a file with mode 0600',
      {
        setUp: () => {
          writeFiles(projectFolder, ENTRY);
          fs.chmodSync(path.join(projectFolder, 'lib/out.txt'), 0o600);
        }
      }
    ],
    [
      'f: a folder with mode 0700',
      {
        setUp: () => {
          writeFiles(projectFolder, ENTRY);
          fs.chmodSync(path.join(projectFolder, 'lib/nested'), 0o700);
        }
      }
    ],
    [
      'g: a file where the entry has a folder',
      {
        setUp: () => {
          writeFiles(projectFolder, { 'lib/out.txt': 'out', 'lib/nested': 'a file' });
        }
      }
    ],
    [
      'h: a folder where the entry has a file',
      {
        setUp: () => {
          writeFiles(projectFolder, {
            'lib/plugin.js/inner.txt': 'inner',
            'lib/nested/deep/data.json': '{}'
          });
        }
      }
    ],
    [
      'i: an output folder that is a symbolic link to a folder outside the project',
      (() => {
        const outsideFiles: FakeArchive = { 'plugin.js': 'outside plugin', 'keep.txt': 'keep' };
        let outsideBefore: Snapshot = {};
        return {
          setUp: () => {
            writeFiles(path.join(rootFolder, 'outside'), outsideFiles);
            outsideBefore = takeSnapshot(rootFolder, ['outside']);
            fs.symlinkSync(path.join(rootFolder, 'outside'), path.join(projectFolder, 'lib'), 'junction');
          },
          check: () => {
            expect(Object.keys(outsideBefore)).toHaveLength(3);
            expect(takeSnapshot(rootFolder, ['outside'])).toEqual(outsideBefore);
          }
        };
      })()
    ],
    ['j: an output folder that is a file', { setUp: () => writeFiles(projectFolder, { lib: 'a file' }) }],
    [
      'k: an output folder that the entry lacks',
      {
        outputFolderNames: ['lib', 'dist'],
        setUp: () => writeFiles(projectFolder, { ...ENTRY, 'dist/index.js': 'dist' }),
        check: () => expect(fs.existsSync(path.join(projectFolder, 'dist'))).toBe(false)
      }
    ],
    [
      'l: a deep tree that differs at several levels',
      {
        archive: DEEP_ENTRY,
        setUp: () =>
          writeFiles(projectFolder, {
            'lib/a/b/c/d/e.txt': 'old e',
            'lib/a/b/c/d/stale.txt': 'stale',
            'lib/a/b/x.txt': 'x',
            'lib/a/z/w.txt': 'w',
            'lib/top.txt': 'old top',
            [`${METADATA_FOLDER}/old.json`]: '{}'
          })
      }
    ]
  ];

  it.each(oldStates)('U2%s', async (description: string, oldState: IOldState) => {
    const { outputFolderNames = ['lib'], archive = ENTRY, setUp, check } = oldState;
    const folderNames: string[] = [...outputFolderNames, METADATA_FOLDER];
    setUp();
    seedEntry(archive);

    const { result, output } = await restoreAsync(createSubject({ outputFolderNames }));

    expect(result).toBe(true);
    expect(output).toContain(SUCCESS_LINE);
    // A restore in place after a failed move would give the same end state, so check that there was none.
    expect(untarMock).toHaveBeenCalledTimes(1);
    expect(untarMock.mock.calls[0][0].outputFolderPath).not.toBe(projectFolder);
    expect(takeSnapshot(projectFolder, folderNames)).toEqual(getExpectedSnapshot(archive, folderNames));
    expect(getStagingFolders()).toEqual([]);
    check?.();
  });

  it('U3: clears the output folders and warns if tar fails', async () => {
    writeFiles(projectFolder, OLD_OUTPUTS);
    seedEntry();
    untarMock.mockImplementationOnce(async ({ outputFolderPath }: IUntarOptions) => {
      writeFiles(outputFolderPath, { 'lib/partial.txt': 'partial' });
      return 1;
    });

    const { result, warning } = await restoreAsync(createSubject());

    expect(result).toBe(false);
    expect(warning).toContain(WARNING_LINE);
    expect(untarMock).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(path.join(projectFolder, 'lib'))).toBe(false);
    expect(fs.existsSync(path.join(projectFolder, METADATA_FOLDER))).toBe(false);
    expect(getStagingFolders()).toEqual([]);
  });

  it('U4: restores in place if moving the output folders into place fails', async () => {
    writeFiles(projectFolder, OLD_OUTPUTS);
    seedEntry();
    const libFolder: string = path.join(projectFolder, 'lib');
    const originalRename: typeof fs.promises.rename = fs.promises.rename;
    let failedRename: string | undefined;
    jest.spyOn(fs.promises, 'rename').mockImplementation((async (oldPath: string, newPath: string) => {
      if (!failedRename && (newPath === libFolder || newPath.startsWith(`${libFolder}${path.sep}`))) {
        failedRename = newPath;
        throw Object.assign(
          new Error(`EPERM: operation not permitted, rename '${oldPath}' -> '${newPath}'`),
          {
            code: 'EPERM'
          }
        );
      }
      return await originalRename(oldPath, newPath);
    }) as never);
    const folderNames: string[] = ['lib', METADATA_FOLDER];

    const { result, verbose } = await restoreAsync(createSubject());

    expect(failedRename).toBeDefined();
    expect(result).toBe(true);
    expect(takeSnapshot(projectFolder, folderNames)).toEqual(getExpectedSnapshot(ENTRY, folderNames));
    expect(untarMock).toHaveBeenCalledTimes(2);
    expect(untarMock.mock.calls[0][0].outputFolderPath).not.toBe(projectFolder);
    expect(untarMock.mock.calls[1][0].outputFolderPath).toBe(projectFolder);
    expect(verbose).toContain('EPERM: operation not permitted');
    expect(getStagingFolders()).toEqual([]);
  });

  it('U4b: starts no more moves after one fails, and then restores in place', async () => {
    // More files than the moves that run at once, in a folder that is merged into the old one.
    const fileCount: number = 30;
    const archive: FakeArchive = { [`${METADATA_FOLDER}/state.json`]: '{}' };
    for (let i: number = 0; i < fileCount; i++) {
      archive[`lib/file${i}.txt`] = `file ${i}`;
    }
    writeFiles(projectFolder, { 'lib/old.txt': 'old' });
    seedEntry(archive);
    const libFolder: string = path.join(projectFolder, 'lib');
    const originalRename: typeof fs.promises.rename = fs.promises.rename;
    const renamesIntoLib: string[] = [];
    jest.spyOn(fs.promises, 'rename').mockImplementation((async (oldPath: string, newPath: string) => {
      if (newPath.startsWith(`${libFolder}${path.sep}`)) {
        renamesIntoLib.push(newPath);
        if (renamesIntoLib.length === 1) {
          throw Object.assign(
            new Error(`EPERM: operation not permitted, rename '${oldPath}' -> '${newPath}'`),
            { code: 'EPERM' }
          );
        }
      }
      return await originalRename(oldPath, newPath);
    }) as never);
    const folderNames: string[] = ['lib', METADATA_FOLDER];

    const { result } = await restoreAsync(createSubject());

    expect(result).toBe(true);
    expect(renamesIntoLib.length).toBeGreaterThan(0);
    expect(renamesIntoLib.length).toBeLessThan(fileCount);
    expect(untarMock).toHaveBeenCalledTimes(2);
    expect(untarMock.mock.calls[0][0].outputFolderPath).not.toBe(projectFolder);
    expect(untarMock.mock.calls[1][0].outputFolderPath).toBe(projectFolder);
    expect(takeSnapshot(projectFolder, folderNames)).toEqual(getExpectedSnapshot(archive, folderNames));
    expect(getStagingFolders()).toEqual([]);
  });

  describe('U5: restores in place', () => {
    let stagingFoldersDuringUntar: string[][];

    beforeEach(() => {
      stagingFoldersDuringUntar = [];
      untarStartHook = () => stagingFoldersDuringUntar.push(getStagingFolders());
    });

    async function expectRestoredInPlaceAsync(subject: OperationBuildCache): Promise<void> {
      writeFiles(projectFolder, OLD_OUTPUTS);
      seedEntry();

      const { result } = await restoreAsync(subject);

      expect(result).toBe(true);
      expect(untarMock).toHaveBeenCalledTimes(1);
      expect(untarMock.mock.calls[0][0].outputFolderPath).toBe(projectFolder);
      expect(stagingFoldersDuringUntar).toEqual([[]]);
      expect(getStagingFolders()).toEqual([]);
      expect(fs.readFileSync(path.join(projectFolder, 'lib/plugin.js'), 'utf8')).toBe('new plugin');
    }

    it.each([
      ['a: if output folders are nested', ['lib', 'lib/nested']],
      ['b: if output folders are equal ignoring case', ['lib', 'LIB']],
      ['d: if an output folder name has ".."', ['lib', 'lib/../dist']],
      ['f: if output folders are nested, the inner one first', ['lib/nested', 'lib']]
    ])('U5%s', async (description: string, outputFolderNames: string[]) => {
      await expectRestoredInPlaceAsync(createSubject({ outputFolderNames }));
    });

    it('U5c: if an output folder contains the .rush/temp folder', async () => {
      await expectRestoredInPlaceAsync(
        OperationBuildCache.getOperationBuildCache({
          buildCacheConfiguration: getBuildCacheConfiguration(),
          terminal: new Terminal(new StringBufferTerminalProvider()),
          project: getProject(),
          phaseName: '_phase:build',
          projectOutputFolderNames: ['lib', '.rush'],
          operationStateHash: 'hash1',
          excludeAppleDoubleFiles: false,
          useDirectFileTransfersForBuildCache: false
        })
      );
    });

    it('U5e: after staging, if the entry has a file outside the output folders', async () => {
      writeFiles(projectFolder, OLD_OUTPUTS);
      const archive: FakeArchive = { ...ENTRY, 'extra/x.txt': 'extra' };
      seedEntry(archive);
      const folderNames: string[] = ['lib', METADATA_FOLDER];

      const { result } = await restoreAsync(createSubject());

      expect(result).toBe(true);
      expect(untarMock).toHaveBeenCalledTimes(2);
      expect(untarMock.mock.calls[0][0].outputFolderPath).not.toBe(projectFolder);
      expect(untarMock.mock.calls[1][0].outputFolderPath).toBe(projectFolder);
      expect(fs.readFileSync(path.join(projectFolder, 'extra/x.txt'), 'utf8')).toBe('extra');
      expect(takeSnapshot(projectFolder, folderNames)).toEqual(getExpectedSnapshot(archive, folderNames));
      expect(getStagingFolders()).toEqual([]);
    });

    it('U5g: if the project folder is missing', async () => {
      fs.rmSync(projectFolder, { recursive: true, force: true });
      seedEntry();

      const { result, verbose } = await restoreAsync(createSubject());

      expect(result).toBe(true);
      expect(verbose).toContain(`"${projectFolder}" is not a folder`);
      expect(untarMock).toHaveBeenCalledTimes(1);
      expect(untarMock.mock.calls[0][0].outputFolderPath).toBe(projectFolder);
      expect(stagingFoldersDuringUntar).toEqual([[]]);
      expect(fs.readFileSync(path.join(projectFolder, 'lib/plugin.js'), 'utf8')).toBe('new plugin');
    });
  });

  it('U6: clears the output folders if there is no tar', async () => {
    _setTarUtilityPromiseForTesting(Promise.resolve(undefined));
    writeFiles(projectFolder, OLD_OUTPUTS);
    seedEntry();
    const mkdtempSpy: jest.SpyInstance = jest.spyOn(fs.promises, 'mkdtemp');

    const { result, warning } = await restoreAsync(createSubject());

    expect(result).toBe(false);
    // Without tar, no extraction was tried, so there is no warning about one.
    expect(warning).not.toContain(WARNING_LINE);
    expect(fs.existsSync(path.join(projectFolder, 'lib'))).toBe(false);
    expect(fs.existsSync(path.join(projectFolder, METADATA_FOLDER))).toBe(false);
    expect(mkdtempSpy).not.toHaveBeenCalled();
    expect(getStagingFolders()).toEqual([]);
  });

  it('U7: skips a second restore of the same entry after a restore through a staging folder', async () => {
    writeFiles(projectFolder, OLD_OUTPUTS);
    seedEntry();
    const subject: OperationBuildCache = createSubject();
    expect((await restoreAsync(subject)).result).toBe(true);
    expect(untarMock.mock.calls[0][0].outputFolderPath).not.toBe(projectFolder);

    const { result, output } = await restoreAsync(subject);

    expect(result).toBe(true);
    expect(output).toContain(SKIP_LINE);
    expect(untarMock).toHaveBeenCalledTimes(1);
  });
});
