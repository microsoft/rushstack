// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';

import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import type { BuildCacheConfiguration } from '../../../api/BuildCacheConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import { TarExecutable } from '../../../utilities/TarExecutable';
import type { IGenerateCacheEntryIdOptions } from '../CacheEntryId';
import {
  DEFERRED_CACHE_ENTRY_STAGING_FOLDER_NAME,
  DeferredCacheEntryWrites,
  type IDeferredCacheEntryWritesReport
} from '../DeferredCacheEntryWrites';
import type { FileSystemBuildCacheProvider } from '../FileSystemBuildCacheProvider';
import { OperationBuildCache, _setTarUtilityPromiseForTesting } from '../OperationBuildCache';

const PID: number = 4242;
const CACHE_ID: string = 'acme-wizard-1926f30e8ed24cb47be89aea39e7efd70fcda075';

/**
 * Copies a file. A file with no data blocks, such as a sparse one, is copied as a sparse file. Not on Windows, where
 * NTFS keeps a small file's data in its file record and so reports no blocks for it either.
 */
async function copyFileAsync(sourcePath: string, destinationPath: string): Promise<void> {
  const { blocks, size } = await fs.promises.stat(sourcePath);
  if (process.platform !== 'win32' && blocks === 0 && size > 0) {
    await fs.promises.writeFile(destinationPath, '');
    await fs.promises.truncate(destinationPath, size);
  } else {
    await fs.promises.copyFile(sourcePath, destinationPath);
  }
}

function readFolder(folderPath: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const relativePath of fs.readdirSync(folderPath, { recursive: true }) as string[]) {
    const filePath: string = path.join(folderPath, relativePath);
    if (fs.statSync(filePath).isFile()) {
      files[relativePath.split(path.sep).join('/')] = fs.readFileSync(filePath, 'utf8');
    }
  }
  return files;
}

describe('OperationBuildCache with deferred cache entry writes', () => {
  let tar: TarExecutable;
  let folderPath: string;
  let projectFolder: string;
  let commonTempFolder: string;
  let cacheFolder: string;
  let terminalProvider: StringBufferTerminalProvider;
  let terminal: Terminal;
  let logLines: string[];

  beforeAll(async () => {
    const found: TarExecutable | undefined = await TarExecutable.tryInitializeAsync(
      new Terminal(new StringBufferTerminalProvider())
    );
    if (!found) {
      throw new Error('"tar" was not found on the PATH');
    }
    tar = found;
  });

  beforeEach(() => {
    folderPath = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'rush-deferred-cache-entry-'));
    projectFolder = path.join(folderPath, 'apps', 'acme-wizard');
    commonTempFolder = path.join(folderPath, 'common', 'temp');
    cacheFolder = path.join(commonTempFolder, 'build-cache');
    fs.mkdirSync(path.join(projectFolder, 'dist', 'nested'), { recursive: true });
    fs.mkdirSync(path.join(commonTempFolder, 'project'), { recursive: true });
    fs.mkdirSync(cacheFolder);
    fs.writeFileSync(path.join(projectFolder, 'dist', 'index.js'), 'index 1');
    fs.writeFileSync(path.join(projectFolder, 'dist', 'nested', 'a.js'), 'a 1');
    terminalProvider = new StringBufferTerminalProvider();
    terminal = new Terminal(terminalProvider);
    logLines = [];
    _setTarUtilityPromiseForTesting(Promise.resolve(tar));
  });

  afterEach(() => {
    _setTarUtilityPromiseForTesting(undefined);
    fs.rmSync(folderPath, { recursive: true, force: true });
  });

  function createSubject(): OperationBuildCache {
    return OperationBuildCache.getOperationBuildCache({
      buildCacheConfiguration: {
        buildCacheEnabled: true,
        cacheWriteEnabled: true,
        getCacheEntryId: (options: IGenerateCacheEntryIdOptions) =>
          `${options.projectName}-${options.projectStateHash}`,
        localCacheProvider: {
          getCacheEntryPath: (cacheId: string) => path.join(cacheFolder, cacheId)
        } as unknown as FileSystemBuildCacheProvider,
        cloudCacheProvider: undefined
      } as unknown as BuildCacheConfiguration,
      projectOutputFolderNames: ['dist'],
      project: {
        packageName: 'acme-wizard',
        projectRelativeFolder: 'apps/acme-wizard',
        projectFolder,
        projectRushTempFolder: path.join(commonTempFolder, 'project'),
        rushConfiguration: { commonTempFolder },
        dependencyProjects: []
      } as unknown as RushConfigurationProject,
      operationStateHash: '1926f30e8ed24cb47be89aea39e7efd70fcda075',
      terminal,
      phaseName: 'build',
      excludeAppleDoubleFiles: false,
      useDirectFileTransfersForBuildCache: false
    });
  }

  function createWrites(
    cloneFileAsync: typeof copyFileAsync = copyFileAsync,
    // Unless a test says otherwise, the files are cloned before the seal resolves, however slow the machine is.
    sealWaitMs: number = 60 * 1000
  ): DeferredCacheEntryWrites {
    const writes: DeferredCacheEntryWrites = new DeferredCacheEntryWrites({
      cloneFileAsync,
      pid: PID,
      sealWaitMs
    });
    // A write that outlives its test can't log into the next test's lines.
    const lines: string[] = logLines;
    writes.setLog((line: string) => lines.push(line));
    return writes;
  }

  async function restoreEntryAsync(): Promise<Record<string, string>> {
    const outputFolderPath: string = path.join(folderPath, 'restored');
    fs.mkdirSync(outputFolderPath);
    const exitCode: number = await tar.tryUntarAsync({
      archivePath: path.join(cacheFolder, CACHE_ID),
      outputFolderPath,
      logFilePath: path.join(folderPath, 'untar.log')
    });
    expect(exitCode).toBe(0);
    return readFolder(outputFolderPath);
  }

  function getProcessFolderPath(): string {
    return path.join(commonTempFolder, DEFERRED_CACHE_ENTRY_STAGING_FOLDER_NAME, `${PID}`);
  }

  it('writes the entry after it resolves, from the output files as they were then', async () => {
    const writes: DeferredCacheEntryWrites = createWrites();

    expect(await createSubject().trySetCacheEntryAsync(terminal, undefined, writes)).toBe(true);

    // The entry is written by tar, which can't have ended before this resolved.
    expect(fs.readdirSync(cacheFolder)).toEqual([]);
    expect(terminalProvider.getOutput({ normalizeSpecialCharacters: false })).toMatch(
      /^Sealed 2 output files \(0\.0 MB\) in \d+ ms; writing the build cache entry in the background\.\n$/
    );
    fs.writeFileSync(path.join(projectFolder, 'dist', 'index.js'), 'index 2');
    fs.rmSync(path.join(projectFolder, 'dist', 'nested', 'a.js'));
    await writes.waitForIdleAsync();

    expect(fs.readdirSync(cacheFolder)).toEqual([CACHE_ID]);
    expect(await restoreEntryAsync()).toEqual({ 'dist/index.js': 'index 1', 'dist/nested/a.js': 'a 1' });
    expect(fs.readdirSync(getProcessFolderPath())).toEqual([]);
    expect(writes.takeReport()).toMatchObject({ queuedCount: 1, writtenCount: 1, failedCount: 0 });
    expect(logLines).toEqual([
      expect.stringMatching(
        new RegExp(
          `^Wrote the build cache entry ${CACHE_ID} \\(0\\.0 MB\\) for acme-wizard \\(build\\) in \\d+ ms\\.$`
        )
      )
    ]);
  });

  it('writes the entry once the output files are sealed, if that takes longer than the wait', async () => {
    let release!: () => void;
    const released: Promise<void> = new Promise((resolve) => (release = resolve));
    const cloneFileAsync = async (sourcePath: string, destinationPath: string): Promise<void> => {
      await released;
      await copyFileAsync(sourcePath, destinationPath);
    };
    const writes: DeferredCacheEntryWrites = createWrites(cloneFileAsync, 0);

    expect(await createSubject().trySetCacheEntryAsync(terminal, undefined, writes)).toBe(true);

    expect(terminalProvider.getOutput({ normalizeSpecialCharacters: false })).toMatch(
      new RegExp(
        '^Sealing 2 output files \\(0\\.0 MB\\) in the background after \\d+ ms; ' +
          "the build cache entry is written once they're sealed\\.\\n$"
      )
    );
    expect(writes.takeReport()).toMatchObject({ queuedCount: 1, pendingCount: 1 });
    release();
    await writes.waitForIdleAsync();

    expect(await restoreEntryAsync()).toEqual({ 'dist/index.js': 'index 1', 'dist/nested/a.js': 'a 1' });
    expect(fs.readdirSync(getProcessFolderPath())).toEqual([]);
    expect(logLines).toEqual([
      expect.stringMatching(
        /^Sealed the output files of acme-wizard \(build\) in the background in \d+ ms\.$/
      ),
      expect.stringMatching(
        new RegExp(
          `^Wrote the build cache entry ${CACHE_ID} \\(0\\.0 MB\\) for acme-wizard \\(build\\) in \\d+ ms\\.$`
        )
      )
    ]);
  });

  it('writes the entry before it resolves if the output files cannot be cloned', async () => {
    const cloneFileAsync: jest.Mock = jest.fn(async () => {
      throw Object.assign(new Error('The file system cannot clone files.'), { code: 'EOPNOTSUPP' });
    });
    const writes: DeferredCacheEntryWrites = createWrites(cloneFileAsync);

    expect(await createSubject().trySetCacheEntryAsync(terminal, undefined, writes)).toBe(true);

    expect(fs.readdirSync(cacheFolder)).toEqual([CACHE_ID]);
    expect(await restoreEntryAsync()).toEqual({ 'dist/index.js': 'index 1', 'dist/nested/a.js': 'a 1' });
    expect(terminalProvider.getOutput({ normalizeSpecialCharacters: false })).toBe(
      'Unable to clone the output files (EOPNOTSUPP), so the build cache entry is written now.\n' +
        'Successfully set cache entry.\n'
    );
    expect(fs.readdirSync(getProcessFolderPath())).toEqual([]);
    const cloneCount: number = cloneFileAsync.mock.calls.length;

    // The next operation doesn't try to clone its output files.
    fs.rmSync(path.join(cacheFolder, CACHE_ID));
    expect(await createSubject().trySetCacheEntryAsync(terminal, undefined, writes)).toBe(true);
    expect(fs.readdirSync(cacheFolder)).toEqual([CACHE_ID]);
    expect(cloneFileAsync).toHaveBeenCalledTimes(cloneCount);
    expect(writes.takeReport()).toMatchObject({ queuedCount: 0, pendingCount: 0 });
  });

  it('seals nothing if an output is a symbolic link', async () => {
    fs.symlinkSync('index.js', path.join(projectFolder, 'dist', 'link.js'));
    const cloneFileAsync: jest.Mock = jest.fn(copyFileAsync);
    const writes: DeferredCacheEntryWrites = createWrites(cloneFileAsync);

    expect(await createSubject().trySetCacheEntryAsync(terminal, undefined, writes)).toBe(false);

    expect(cloneFileAsync).not.toHaveBeenCalled();
    expect(fs.readdirSync(cacheFolder)).toEqual([]);
    expect(writes.takeReport()).toMatchObject({ queuedCount: 0, pendingCount: 0 });
  });

  it('seals nothing if tar is not found', async () => {
    _setTarUtilityPromiseForTesting(Promise.resolve(undefined));
    const cloneFileAsync: jest.Mock = jest.fn(copyFileAsync);
    const writes: DeferredCacheEntryWrites = createWrites(cloneFileAsync);

    // The operation reports the failure, instead of the daemon's log reporting it later.
    const result: boolean = await createSubject().trySetCacheEntryAsync(terminal, undefined, writes);
    await writes.waitForIdleAsync();

    expect(result).toBe(false);
    expect(cloneFileAsync).not.toHaveBeenCalled();
    expect(terminalProvider.getWarningOutput({ normalizeSpecialCharacters: false })).toContain(
      'Unable to locate "tar".'
    );
    expect(writes.takeReport()).toMatchObject({ queuedCount: 0, pendingCount: 0 });
    expect(logLines).toEqual([]);
  });

  it('kills tar, and deletes its partial archive and the sealed files, when aborted', async () => {
    // A sparse file takes no space, but tar reads 2 GB of zeros from it and gzip compresses them, which takes
    // seconds.
    const fd: number = fs.openSync(path.join(projectFolder, 'dist', 'large.bin'), 'w');
    try {
      fs.ftruncateSync(fd, 2 * 1024 * 1024 * 1024);
    } finally {
      fs.closeSync(fd);
    }
    const writes: DeferredCacheEntryWrites = createWrites();
    expect(await createSubject().trySetCacheEntryAsync(terminal, undefined, writes)).toBe(true);
    const deadline: number = Date.now() + 10000;
    while (fs.readdirSync(cacheFolder).length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    // The partial archive
    expect(fs.readdirSync(cacheFolder)).toEqual([expect.stringMatching(/\.temp$/)]);

    const abortedAtMs: number = performance.now();
    await writes.abortAsync();

    // Unless it was killed, tar would have run for seconds. On Windows, tar can take a second or two to exit after
    // it is killed.
    expect(performance.now() - abortedAtMs).toBeLessThan(process.platform === 'win32' ? 5000 : 1000);
    expect(fs.readdirSync(cacheFolder)).toEqual([]);
    expect(fs.existsSync(getProcessFolderPath())).toBe(false);
    const report: IDeferredCacheEntryWritesReport = writes.takeReport();
    expect(report).toMatchObject({ writtenCount: 0, failedCount: 0, pendingCount: 0 });
    expect(logLines).toEqual([
      `Dropped the build cache entry ${CACHE_ID} for acme-wizard (build), which was being written.`
    ]);
  });
});
