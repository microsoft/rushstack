// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { Async, FileSystem } from '@rushstack/node-core-library';
import { StringBufferTerminalProvider, Terminal, type ITerminal } from '@rushstack/terminal';

import type { BuildCacheConfiguration } from '../../../api/BuildCacheConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import { RushProjectConfiguration, type IOperationSettings } from '../../../api/RushProjectConfiguration';
import type { IUntarOptions, TarExecutable } from '../../../utilities/TarExecutable';
import type { IBaseOperationExecutionResult } from '../../operations/IOperationExecutionResult';
import type { IGenerateCacheEntryIdOptions } from '../CacheEntryId';
import { OperationBuildCache, _setTarUtilityPromiseForTesting } from '../OperationBuildCache';
import { getProjectOutputFolderNames, tryRestoreThroughStagingFolderAsync } from '../StagedRestore';

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
  project?: RushConfigurationProject;
  projectOperationSettings?: ReadonlyArray<Readonly<IOperationSettings>>;
  omitReservationSnapshot?: boolean;
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
  let nextFixtureIndex: number = 0;
  let rootFolder: string;
  let projectFolder: string;
  let cacheFolder: string;
  let untarStartHook: ((outputFolderPath: string) => void) | undefined;
  let untarEndHook: ((outputFolderPath: string) => void) | undefined;
  let untarMock: jest.Mock<Promise<number>, [IUntarOptions]>;

  beforeEach(() => {
    const testFolder: string = path.resolve(__dirname, '../../../../temp/staged-restore-tests');
    fs.mkdirSync(testFolder, { recursive: true });
    for (;;) {
      const candidate: string = path.join(testFolder, `fixture-${nextFixtureIndex++}`);
      try {
        fs.mkdirSync(candidate);
        rootFolder = candidate;
        break;
      } catch (error) {
        if (!FileSystem.isExistError(error as Error)) throw error;
      }
    }
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
    const oracleFolder: string = path.join(rootFolder, 'oracle');
    fs.mkdirSync(oracleFolder);
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
    const project: RushConfigurationProject = options.project ?? getProject();
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
      projectOperationSettings: options.omitReservationSnapshot
        ? undefined
        : (options.projectOperationSettings ?? [{ operationName: '_phase:build', outputFolderNames }]),
      buildCacheConfiguration: getBuildCacheConfiguration(),
      terminal: new Terminal(new StringBufferTerminalProvider()),
      excludeAppleDoubleFiles: false,
      useDirectFileTransfersForBuildCache: false
    });
  }

  async function createSubjectFromConfigurationAsync(): Promise<OperationBuildCache> {
    const project: RushConfigurationProject = getProject();
    const configurations = await RushProjectConfiguration._tryLoadForProjectsUncachedAsync(
      [project],
      new Terminal(new StringBufferTerminalProvider())
    );
    return createSubject({
      project,
      projectOperationSettings: [
        ...(configurations.get(project)?.operationSettingsByOperationName.values() ?? [])
      ]
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

  it('claims deterministic slots without modifying occupied or abandoned slots', async () => {
    const rushTempFolder: string = getProject().projectRushTempFolder;
    const abandoned: string = path.join(rushTempFolder, `${STAGING_FOLDER_PREFIX}0`);
    writeFiles(abandoned, { 'keep.txt': 'abandoned' });
    fs.writeFileSync(path.join(rushTempFolder, `${STAGING_FOLDER_PREFIX}1`), 'occupied');
    const outside: string = path.join(rootFolder, 'outside');
    writeFiles(outside, { 'keep.txt': 'outside' });
    fs.symlinkSync(outside, path.join(rushTempFolder, `${STAGING_FOLDER_PREFIX}2`), 'junction');
    const before: Snapshot = takeSnapshot(rootFolder, ['project', 'outside']);
    seedEntry();
    const mkdtempSpy: jest.SpyInstance = jest.spyOn(fs.promises, 'mkdtemp');

    expect((await restoreAsync(createSubject())).result).toBe(true);

    const stagingPath: string = path.join(rushTempFolder, `${STAGING_FOLDER_PREFIX}3`);
    expect(untarMock.mock.calls[0][0].outputFolderPath).toBe(stagingPath);
    expect(untarMock).toHaveBeenCalledTimes(1);
    expect(mkdtempSpy).not.toHaveBeenCalled();
    for (const [relativePath, value] of Object.entries(before)) {
      expect(takeSnapshot(rootFolder, [relativePath])[relativePath]).toBe(value);
    }
    expect(fs.existsSync(stagingPath)).toBe(false);

    fs.writeFileSync(path.join(projectFolder, 'lib/plugin.js'), 'changed');
    expect((await restoreAsync(createSubject())).result).toBe(true);
    expect(untarMock.mock.calls[1][0].outputFolderPath).toBe(stagingPath);
  });

  it('keeps concurrent restores in separate slots and cleans only its own slot', async () => {
    const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());
    const [entered, enter] = Async.getSignal();
    const [released, release] = Async.getSignal();
    let firstStagingPath: string = '';
    const first: Promise<number | undefined> = tryRestoreThroughStagingFolderAsync(terminal, {
      projectFolder,
      projectRushTempFolder: getProject().projectRushTempFolder,
      outputFolderNames: ['lib'],
      projectOutputFolderNames: ['lib', 'dist'],
      untarAsync: async (folderPath: string) => {
        firstStagingPath = folderPath;
        writeFiles(folderPath, { 'lib/first.txt': 'first' });
        enter();
        await released;
        return 0;
      }
    });
    await entered;
    try {
      const second: number | undefined = await tryRestoreThroughStagingFolderAsync(terminal, {
        projectFolder,
        projectRushTempFolder: getProject().projectRushTempFolder,
        outputFolderNames: ['dist'],
        projectOutputFolderNames: ['lib', 'dist'],
        untarAsync: async (folderPath: string) => {
          expect(folderPath).not.toBe(firstStagingPath);
          expect(path.basename(folderPath)).toBe(`${STAGING_FOLDER_PREFIX}1`);
          writeFiles(folderPath, { 'dist/second.txt': 'second' });
          return 0;
        }
      });
      expect(second).toBe(0);
      expect(fs.readFileSync(path.join(firstStagingPath, 'lib/first.txt'), 'utf8')).toBe('first');
      expect(getStagingFolders()).toEqual([`${STAGING_FOLDER_PREFIX}0`]);
    } finally {
      release();
      await first;
    }
    expect(await first).toBe(0);
    expect(fs.readFileSync(path.join(projectFolder, 'lib/first.txt'), 'utf8')).toBe('first');
    expect(fs.readFileSync(path.join(projectFolder, 'dist/second.txt'), 'utf8')).toBe('second');
    expect(getStagingFolders()).toEqual([]);
  });

  it('does not claim a slot that contains a configured output folder', async () => {
    const outputFolder: string = `.rush/temp/${STAGING_FOLDER_PREFIX}0/nested`;
    seedEntry({ ...ENTRY, [`${outputFolder}/keep.txt`]: 'output' });
    const { result } = await restoreAsync(createSubject({ outputFolderNames: ['lib', outputFolder] }));
    expect(result).toBe(true);
    expect(untarMock).toHaveBeenCalledTimes(1);
    expect(path.basename(untarMock.mock.calls[0][0].outputFolderPath)).toBe(`${STAGING_FOLDER_PREFIX}1`);
    expect(fs.readFileSync(path.join(projectFolder, outputFolder, 'keep.txt'), 'utf8')).toBe('output');
  });

  it.each([false, true])(
    'preserves another operation output inside the first available slot (inherited: %s)',
    async (inherited) => {
      const outputFolder: string = `.rush/temp/${STAGING_FOLDER_PREFIX}0/nested`;
      const otherSettings = {
        operationName: '_phase:other',
        disableBuildCacheForOperation: true,
        outputFolderNames: [outputFolder]
      };
      writeFiles(projectFolder, {
        'package.json': JSON.stringify({ name: 'acme', version: '1.0.0' }),
        'config/rush-project.json': JSON.stringify({
          ...(inherited ? { extends: './other-operations.json' } : {}),
          operationSettings: [
            { operationName: '_phase:build', outputFolderNames: ['lib'] },
            ...(inherited ? [] : [otherSettings])
          ]
        }),
        ...(inherited
          ? { 'config/other-operations.json': JSON.stringify({ operationSettings: [otherSettings] }) }
          : {})
      });
      seedEntry();
      const otherCacheId: string = 'acme-other';
      const otherArchive: FakeArchive = { [`${outputFolder}/keep.txt`]: 'second' };
      fs.writeFileSync(path.join(cacheFolder, otherCacheId), JSON.stringify(otherArchive));
      const [entered, enter] = Async.getSignal();
      const [released, release] = Async.getSignal();
      untarMock.mockImplementation(async ({ archivePath, outputFolderPath }: IUntarOptions) => {
        writeFiles(outputFolderPath, JSON.parse(fs.readFileSync(archivePath, 'utf8')));
        if (path.basename(archivePath) === CACHE_ID) {
          enter();
          await released;
        }
        return 0;
      });
      const first: Promise<IRestoreResult> = restoreAsync(await createSubjectFromConfigurationAsync());
      await Promise.race([
        entered,
        first.then(() => {
          throw new Error('The first restore did not wait in extraction.');
        })
      ]);
      const target: string = path.join(projectFolder, outputFolder, 'keep.txt');
      try {
        // Construct B only after A claims its slot: A must see B's declaration, not just live restores.
        const second: OperationBuildCache = OperationBuildCache.getOperationBuildCache({
          projectOperationSettings: [otherSettings],
          project: getProject(),
          projectOutputFolderNames: [outputFolder],
          phaseName: '_phase:other',
          operationStateHash: 'other',
          buildCacheConfiguration: getBuildCacheConfiguration(),
          terminal: new Terminal(new StringBufferTerminalProvider()),
          excludeAppleDoubleFiles: false,
          useDirectFileTransfersForBuildCache: false
        });
        expect((await restoreAsync(second)).result).toBe(true);
        expect(fs.readFileSync(target, 'utf8')).toBe('second');
      } finally {
        release();
        await first;
      }
      const result: IRestoreResult = await first;
      expect(result.result).toBe(true);
      expect(result.verbose).not.toContain('in place');
      expect(untarMock).toHaveBeenCalledTimes(2);
      expect(path.basename(untarMock.mock.calls[0][0].outputFolderPath)).toBe(`${STAGING_FOLDER_PREFIX}1`);
      expect(path.basename(untarMock.mock.calls[1][0].outputFolderPath)).toBe(`${STAGING_FOLDER_PREFIX}2`);
      expect(fs.readFileSync(target, 'utf8')).toBe('second');
      expect(fs.readFileSync(path.join(projectFolder, 'lib/plugin.js'), 'utf8')).toBe('new plugin');
      expect(getStagingFolders()).toEqual([`${STAGING_FOLDER_PREFIX}0`]);
    }
  );

  it('reserves unselected shard outputs without reserving the entire staging namespace', async () => {
    writeFiles(projectFolder, {
      'package.json': JSON.stringify({ name: 'acme', version: '1.0.0' }),
      'config/rush-project.json': JSON.stringify({
        operationSettings: [
          {
            operationName: '_phase:other',
            sharding: {
              count: 2,
              outputFolderArgumentFormat: `--output=.rush/temp/${STAGING_FOLDER_PREFIX}0/{phaseName}/{shardIndex}`
            }
          }
        ]
      })
    });
    seedEntry();
    const { result, verbose } = await restoreAsync(await createSubjectFromConfigurationAsync());
    expect(result).toBe(true);
    expect(verbose).not.toContain('in place');
    expect(path.basename(untarMock.mock.calls[0][0].outputFolderPath)).toBe(`${STAGING_FOLDER_PREFIX}1`);
    expect(getProjectOutputFolderNames([{ operationName: '_phase:other', sharding: { count: 2 } }])).toEqual([
      '.rush/operations/_phase_other/shards/1',
      '.rush/operations/_phase_other/shards/2'
    ]);
  });

  it.each(['output ancestor', 'staging ancestor'])(
    'preserves output through a linked %s when the output does not yet exist',
    async (linked) => {
      const rushTempFolder: string = getProject().projectRushTempFolder;
      let outputFolder: string;
      if (linked === 'output ancestor') {
        fs.mkdirSync(rushTempFolder, { recursive: true });
        fs.symlinkSync(rushTempFolder, path.join(projectFolder, 'linked'), 'junction');
        outputFolder = `linked/${STAGING_FOLDER_PREFIX}0/nested`;
      } else {
        fs.mkdirSync(path.join(projectFolder, '.rush'), { recursive: true });
        const physicalTemp: string = path.join(projectFolder, 'physical-temp');
        fs.mkdirSync(physicalTemp);
        fs.symlinkSync(physicalTemp, rushTempFolder, 'junction');
        outputFolder = `physical-temp/${STAGING_FOLDER_PREFIX}0/nested`;
      }
      const archive: FakeArchive = { [`${outputFolder}/keep.txt`]: 'must survive cleanup' };
      seedEntry(archive);
      const { result, verbose } = await restoreAsync(createSubject({ outputFolderNames: [outputFolder] }));
      expect(result).toBe(true);
      expect(fs.readFileSync(path.join(projectFolder, outputFolder, 'keep.txt'), 'utf8')).toBe(
        'must survive cleanup'
      );
      expect(verbose).not.toContain('in place');
      expect(path.basename(untarMock.mock.calls[0][0].outputFolderPath)).toBe(`${STAGING_FOLDER_PREFIX}1`);
    }
  );

  it('falls back in place when the physical staging parent is inside a declared output', async () => {
    const physicalTemp: string = path.join(projectFolder, 'other-output', 'temp');
    fs.mkdirSync(physicalTemp, { recursive: true });
    fs.mkdirSync(path.join(projectFolder, '.rush'));
    fs.symlinkSync(physicalTemp, getProject().projectRushTempFolder, 'junction');
    seedEntry();
    const { result, verbose } = await restoreAsync(
      createSubject({
        projectOperationSettings: [{ operationName: '_phase:other', outputFolderNames: ['other-output'] }]
      })
    );
    expect(result).toBe(true);
    expect(verbose).toContain('contains the staging parent');
    expect(untarMock.mock.calls[0][0].outputFolderPath).toBe(projectFolder);
  });

  it('falls back in place when linked ancestor discovery is uncertain', async () => {
    const reservedAncestor: string = path.join(projectFolder, 'unreadable-output');
    const originalRealpath = fs.promises.realpath;
    jest.spyOn(fs.promises, 'realpath').mockImplementation(async (filePath, options) => {
      if (filePath.toString() === reservedAncestor) {
        throw Object.assign(new Error('EACCES: unable to resolve output ancestor'), { code: 'EACCES' });
      }
      return await originalRealpath(filePath, options);
    });
    seedEntry();
    const { result, verbose } = await restoreAsync(
      createSubject({
        projectOperationSettings: [
          { operationName: '_phase:other', outputFolderNames: ['unreadable-output/next'] }
        ]
      })
    );
    expect(result).toBe(true);
    expect(verbose).toContain('EACCES: unable to resolve output ancestor');
    expect(untarMock.mock.calls[0][0].outputFolderPath).toBe(projectFolder);
  });

  it('does not equate physical staging parents whose names differ only by case', async () => {
    const stagingParent: string = getProject().projectRushTempFolder;
    const originalRealpath = fs.promises.realpath;
    let stagingParentReads: number = 0;
    fs.mkdirSync(stagingParent, { recursive: true });
    jest.spyOn(fs.promises, 'realpath').mockImplementation(async (filePath, options) => {
      const actualPath: string = await originalRealpath(filePath, options);
      if (filePath.toString() === stagingParent && ++stagingParentReads === 3) {
        return path.join(path.dirname(actualPath), path.basename(actualPath).toUpperCase());
      }
      return actualPath;
    });
    seedEntry();
    const { result, verbose } = await restoreAsync(createSubject());
    expect(result).toBe(true);
    expect(verbose).toContain('The staging parent changed before creating a staging folder.');
    expect(untarMock.mock.calls[0][0].outputFolderPath).toBe(projectFolder);
  });

  it.each([false, true])(
    'does not reuse cached project configuration after an edit (previously present: %s)',
    async (present) => {
      const project: RushConfigurationProject = getProject();
      writeFiles(projectFolder, {
        'package.json': JSON.stringify({ name: 'acme', version: '1.0.0' }),
        ...(present
          ? {
              'config/rush-project.json': JSON.stringify({
                operationSettings: [{ operationName: '_phase:build', outputFolderNames: ['lib'] }]
              })
            }
          : {})
      });
      await RushProjectConfiguration.tryLoadForProjectAsync(
        project,
        new Terminal(new StringBufferTerminalProvider())
      );
      const otherOutput: string = `.rush/temp/${STAGING_FOLDER_PREFIX}0/nested`;
      writeFiles(projectFolder, {
        'config/rush-project.json': JSON.stringify({
          operationSettings: [{ operationName: '_phase:other', outputFolderNames: [otherOutput] }]
        })
      });
      const [entered, enter] = Async.getSignal();
      const [released, release] = Async.getSignal();
      seedEntry();
      untarMock.mockImplementationOnce(async ({ archivePath, outputFolderPath }) => {
        writeFiles(outputFolderPath, JSON.parse(fs.readFileSync(archivePath, 'utf8')));
        enter();
        await released;
        return 0;
      });
      const first = restoreAsync(createSubject({ project, omitReservationSnapshot: true }));
      await Promise.race([
        entered,
        first.then(() => {
          throw new Error('The direct restore completed before extraction');
        })
      ]);
      try {
        fs.writeFileSync(
          path.join(cacheFolder, 'acme-other'),
          JSON.stringify({ [`${otherOutput}/keep.txt`]: 'another operation output' })
        );
        const second = OperationBuildCache.getOperationBuildCache({
          project,
          projectOutputFolderNames: [otherOutput],
          phaseName: '_phase:other',
          operationStateHash: 'other',
          buildCacheConfiguration: getBuildCacheConfiguration(),
          terminal: new Terminal(new StringBufferTerminalProvider()),
          excludeAppleDoubleFiles: false,
          useDirectFileTransfersForBuildCache: false
        });
        expect((await restoreAsync(second)).result).toBe(true);
      } finally {
        release();
      }
      const { result, verbose } = await first;
      expect(result).toBe(true);
      expect(fs.readFileSync(path.join(projectFolder, otherOutput, 'keep.txt'), 'utf8')).toBe(
        'another operation output'
      );
      expect(verbose).toContain('no current project output reservation snapshot');
      expect(untarMock.mock.calls[0][0].outputFolderPath).toBe(projectFolder);
    }
  );

  it('does not let rig/config lookup errors block a viable direct SDK restore', async () => {
    const load = jest
      .spyOn(RushProjectConfiguration, 'tryLoadForProjectAsync')
      .mockRejectedValue(new Error('Unable to resolve the rig'));
    seedEntry();
    const { result, verbose } = await restoreAsync(createSubject({ omitReservationSnapshot: true }));
    expect(result).toBe(true);
    expect(verbose).toContain('no current project output reservation snapshot');
    expect(untarMock.mock.calls[0][0].outputFolderPath).toBe(projectFolder);
    expect(load).not.toHaveBeenCalled();
  });

  it('rediscovers linked ancestors for a later batch using the same immutable snapshot', async () => {
    const rushTempFolder: string = getProject().projectRushTempFolder;
    const outside: string = path.join(rootFolder, 'outside');
    fs.mkdirSync(rushTempFolder, { recursive: true });
    fs.mkdirSync(outside);
    const linked: string = path.join(projectFolder, 'linked');
    fs.symlinkSync(outside, linked, 'junction');
    const reservations: ReadonlyArray<string> = ['lib', `linked/${STAGING_FOLDER_PREFIX}0/nested`];
    const slots: string[] = [];
    const restore = async (): Promise<void> => {
      await tryRestoreThroughStagingFolderAsync(new Terminal(new StringBufferTerminalProvider()), {
        projectFolder,
        projectRushTempFolder: rushTempFolder,
        outputFolderNames: ['lib'],
        projectOutputFolderNames: reservations,
        untarAsync: async (folderPath) => {
          slots.push(path.basename(folderPath));
          return 1;
        }
      });
    };
    await restore();
    fs.unlinkSync(linked);
    fs.symlinkSync(rushTempFolder, linked, 'junction');
    await restore();
    expect(slots).toEqual([`${STAGING_FOLDER_PREFIX}0`, `${STAGING_FOLDER_PREFIX}1`]);
  });

  it('indexes one current snapshot and claims 75 concurrent slots with 75 mkdir probes', async () => {
    const count: number = 75;
    const outputFolderNames: string[] = Array.from(
      { length: count },
      (value, index: number) => `shards/${index + 1}`
    );
    const settings: ReadonlyArray<Readonly<IOperationSettings>> = [
      {
        operationName: '_phase:test',
        sharding: { count, outputFolderArgumentFormat: '--output=shards/{shardIndex}' }
      }
    ];
    const outputCatalog = jest.spyOn(settings, Symbol.iterator);
    const reservations: ReadonlyArray<string>[] = Array.from({ length: count }, () =>
      getProjectOutputFolderNames(settings)
    );
    const claims = jest.spyOn(fs.promises, 'mkdir');
    const discoveries = jest.spyOn(fs.promises, 'realpath');
    const [released, release] = Async.getSignal();
    const [allEntered, enter] = Async.getSignal();
    const slots: Set<string> = new Set();
    const attempts: Promise<number | undefined>[] = outputFolderNames.map((folderName, index) =>
      tryRestoreThroughStagingFolderAsync(new Terminal(new StringBufferTerminalProvider()), {
        projectFolder,
        projectRushTempFolder: getProject().projectRushTempFolder,
        outputFolderNames: [folderName],
        projectOutputFolderNames: reservations[index],
        untarAsync: async (folderPath) => {
          slots.add(folderPath);
          if (slots.size === count) enter();
          await released;
          return 1;
        }
      })
    );
    try {
      await Promise.race([
        allEntered,
        ...attempts.map(async (attempt) => {
          await attempt;
          throw new Error('A restore completed before claiming all slots');
        })
      ]);
      expect(slots.size).toBe(count);
      expect({
        catalogExpansions: outputCatalog.mock.calls.length,
        mkdirProbes: claims.mock.calls.filter(([, options]) => options === undefined).length
      }).toEqual({ catalogExpansions: 1, mkdirProbes: count });
      // Each missing output is resolved once for the shared snapshot and once for its own operation.
      expect(
        discoveries.mock.calls.filter(([filePath]) =>
          outputFolderNames.some((folderName) => path.join(projectFolder, folderName) === filePath.toString())
        )
      ).toHaveLength(count * 2);
    } finally {
      release();
      await Promise.all(attempts);
    }
    expect(getStagingFolders()).toEqual([]);
  });

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

    it('keeps caching enabled if an unselected output contains the staging parent', async () => {
      writeFiles(projectFolder, {
        'package.json': JSON.stringify({ name: 'acme', version: '1.0.0' }),
        'config/rush-project.json': JSON.stringify({
          operationSettings: [{ operationName: '_phase:other', outputFolderNames: ['.rush/temp'] }]
        })
      });
      await expectRestoredInPlaceAsync(await createSubjectFromConfigurationAsync());
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
