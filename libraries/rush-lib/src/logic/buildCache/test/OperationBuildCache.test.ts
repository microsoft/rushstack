// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, type FolderItem, LockFile } from '@rushstack/node-core-library';
import { StringBufferTerminalProvider, Terminal, type ITerminal } from '@rushstack/terminal';

import type { BuildCacheConfiguration } from '../../../api/BuildCacheConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import type { IGenerateCacheEntryIdOptions } from '../CacheEntryId';
import type { FileSystemBuildCacheProvider } from '../FileSystemBuildCacheProvider';

import { OperationBuildCache } from '../OperationBuildCache';

interface ITestOptions {
  enabled: boolean;
  writeAllowed: boolean;
  trackedProjectFiles: string[] | undefined;
  excludeAppleDoubleFiles: boolean;
}

function createFolderItem(name: string, type: 'file' | 'directory' | 'symlink'): FolderItem {
  return {
    name,
    isSymbolicLink: () => type === 'symlink',
    isDirectory: () => type === 'directory',
    isFile: () => type === 'file',
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    parentPath: '',
    path: name
  } as unknown as FolderItem;
}

describe(OperationBuildCache.name, () => {
  function prepareSubject(options: Partial<ITestOptions>): OperationBuildCache {
    const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());

    const subject: OperationBuildCache = OperationBuildCache.getOperationBuildCache({
      buildCacheConfiguration: {
        buildCacheEnabled: options.hasOwnProperty('enabled') ? options.enabled : true,
        getCacheEntryId: (opts: IGenerateCacheEntryIdOptions) =>
          `${opts.projectName}/${opts.projectStateHash}`,
        localCacheProvider: undefined as unknown as FileSystemBuildCacheProvider,
        cloudCacheProvider: {
          isCacheWriteAllowed: options.hasOwnProperty('writeAllowed') ? options.writeAllowed : false
        }
      } as unknown as BuildCacheConfiguration,
      projectOutputFolderNames: ['dist'],
      project: {
        packageName: 'acme-wizard',
        projectRelativeFolder: 'apps/acme-wizard',
        projectFolder: '/repo/apps/acme-wizard',
        projectRushTempFolder: '/repo/common/temp/project',
        dependencyProjects: []
      } as unknown as RushConfigurationProject,
      // Value from past tests, for consistency.
      // The project build cache is not responsible for calculating this value.
      operationStateHash: '1926f30e8ed24cb47be89aea39e7efd70fcda075',
      terminal,
      phaseName: 'build',
      excludeAppleDoubleFiles: !!options.excludeAppleDoubleFiles,
      useDirectFileTransfersForBuildCache: false
    });

    return subject;
  }

  describe(OperationBuildCache.getOperationBuildCache.name, () => {
    it('returns an OperationBuildCache with a calculated cacheId value', () => {
      const subject: OperationBuildCache = prepareSubject({});
      expect(subject['_cacheId']).toMatchInlineSnapshot(
        `"acme-wizard/1926f30e8ed24cb47be89aea39e7efd70fcda075"`
      );
    });
  });

  describe('direct file cloud cache restore', () => {
    let fakeLockRelease: jest.Mock;

    beforeEach(() => {
      fakeLockRelease = jest.fn();
      // By default, simulate an uncontended lock acquisition and no pre-existing cache entry.
      // Individual tests may override these to exercise the lock-contention/fallback paths.
      jest
        .spyOn(LockFile, 'acquireAsync')
        .mockImplementation(async () => ({ release: fakeLockRelease }) as unknown as LockFile);
      jest.spyOn(FileSystem, 'existsAsync').mockResolvedValue(false);
    });

    afterEach(() => {
      Reflect.set(OperationBuildCache, '_tarUtilityPromise', undefined);
      jest.restoreAllMocks();
    });

    function prepareDirectTransferSubject(cloudBuildCacheProvider: {
      tryDownloadCacheEntryToFileAsync: jest.Mock<Promise<boolean>, [ITerminal, string, string]>;
    }): OperationBuildCache {
      const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());

      return OperationBuildCache.getOperationBuildCache({
        buildCacheConfiguration: {
          buildCacheEnabled: true,
          getCacheEntryId: (opts: IGenerateCacheEntryIdOptions) =>
            `${opts.projectName}/${opts.projectStateHash}`,
          localCacheProvider: {
            getCacheEntryPath: jest.fn().mockReturnValue('/cache/acme-wizard-cache-entry'),
            tryGetCacheEntryPathByIdAsync: jest.fn().mockResolvedValue(undefined)
          },
          cloudCacheProvider: {
            isCacheWriteAllowed: false,
            ...cloudBuildCacheProvider
          }
        } as unknown as BuildCacheConfiguration,
        projectOutputFolderNames: ['dist'],
        project: {
          packageName: 'acme-wizard',
          projectRelativeFolder: 'apps/acme-wizard',
          projectFolder: '/repo/apps/acme-wizard',
          projectRushTempFolder: '/repo/common/temp/project',
          dependencyProjects: []
        } as unknown as RushConfigurationProject,
        operationStateHash: '1926f30e8ed24cb47be89aea39e7efd70fcda075',
        terminal,
        phaseName: 'build',
        excludeAppleDoubleFiles: false,
        useDirectFileTransfersForBuildCache: true
      });
    }

    it('downloads cloud cache entries to a temp file before atomically moving them into place', async () => {
      const tryDownloadCacheEntryToFileAsync: jest.Mock<Promise<boolean>, [ITerminal, string, string]> = jest
        .fn()
        .mockResolvedValue(true);
      const subject: OperationBuildCache = prepareDirectTransferSubject({
        tryDownloadCacheEntryToFileAsync
      });
      const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());
      const tryUntarAsync: jest.Mock = jest.fn().mockResolvedValue(0);

      jest.spyOn(FileSystem, 'deleteFolderAsync').mockResolvedValue();
      const moveAsyncSpy: jest.SpyInstance = jest.spyOn(FileSystem, 'moveAsync').mockResolvedValue();
      const deleteFileAsyncSpy: jest.SpyInstance = jest
        .spyOn(FileSystem, 'deleteFileAsync')
        .mockResolvedValue();
      Reflect.set(OperationBuildCache, '_tarUtilityPromise', Promise.resolve({ tryUntarAsync }));

      const result: boolean = await subject.tryRestoreFromCacheAsync(terminal);

      expect(result).toBe(true);
      expect(tryDownloadCacheEntryToFileAsync).toHaveBeenCalledTimes(1);
      const [, , tempPath]: [ITerminal, string, string] = tryDownloadCacheEntryToFileAsync.mock.calls[0];
      expect(tempPath).toMatch(/^\/cache\/acme-wizard-cache-entry-[0-9a-f]+\.temp$/);
      expect(moveAsyncSpy).toHaveBeenCalledWith({
        sourcePath: tempPath,
        destinationPath: '/cache/acme-wizard-cache-entry',
        overwrite: true
      });
      expect(tryUntarAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          archivePath: '/cache/acme-wizard-cache-entry'
        })
      );
      expect(deleteFileAsyncSpy).not.toHaveBeenCalled();
      expect(LockFile.acquireAsync).toHaveBeenCalledWith(
        '/cache',
        expect.stringMatching(/^[0-9a-f]{40}$/),
        expect.any(Number)
      );
      expect(fakeLockRelease).toHaveBeenCalledTimes(1);
    });

    it('cleans up the temp file when a direct file download misses or fails', async () => {
      const tryDownloadCacheEntryToFileAsync: jest.Mock<Promise<boolean>, [ITerminal, string, string]> = jest
        .fn()
        .mockResolvedValue(false);
      const subject: OperationBuildCache = prepareDirectTransferSubject({
        tryDownloadCacheEntryToFileAsync
      });
      const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());

      const deleteFileAsyncSpy: jest.SpyInstance = jest
        .spyOn(FileSystem, 'deleteFileAsync')
        .mockResolvedValue();

      const result: boolean = await subject.tryRestoreFromCacheAsync(terminal);

      expect(result).toBe(false);
      expect(tryDownloadCacheEntryToFileAsync).toHaveBeenCalledTimes(1);
      const [, , tempPath]: [ITerminal, string, string] = tryDownloadCacheEntryToFileAsync.mock.calls[0];
      expect(tempPath).toMatch(/^\/cache\/acme-wizard-cache-entry-[0-9a-f]+\.temp$/);
      expect(deleteFileAsyncSpy).toHaveBeenCalledWith(tempPath);
    });

    it('skips downloading when another process already populated the cache entry while waiting for the lock', async () => {
      const tryDownloadCacheEntryToFileAsync: jest.Mock<
        Promise<boolean>,
        [ITerminal, string, string]
      > = jest.fn();
      const subject: OperationBuildCache = prepareDirectTransferSubject({
        tryDownloadCacheEntryToFileAsync
      });
      const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());
      const tryUntarAsync: jest.Mock = jest.fn().mockResolvedValue(0);

      jest.spyOn(FileSystem, 'deleteFolderAsync').mockResolvedValue();
      // Simulate the cache entry having been fully populated (e.g. by another local process)
      // by the time we acquired the lock.
      jest.spyOn(FileSystem, 'existsAsync').mockResolvedValue(true);
      Reflect.set(OperationBuildCache, '_tarUtilityPromise', Promise.resolve({ tryUntarAsync }));

      const result: boolean = await subject.tryRestoreFromCacheAsync(terminal);

      expect(result).toBe(true);
      expect(tryDownloadCacheEntryToFileAsync).not.toHaveBeenCalled();
      expect(tryUntarAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          archivePath: '/cache/acme-wizard-cache-entry'
        })
      );
      expect(fakeLockRelease).toHaveBeenCalledTimes(1);
    });

    it('falls back to downloading independently when the download lock cannot be acquired', async () => {
      jest.spyOn(LockFile, 'acquireAsync').mockRejectedValue(new Error('Exceeded maximum wait time'));

      const tryDownloadCacheEntryToFileAsync: jest.Mock<Promise<boolean>, [ITerminal, string, string]> = jest
        .fn()
        .mockResolvedValue(true);
      const subject: OperationBuildCache = prepareDirectTransferSubject({
        tryDownloadCacheEntryToFileAsync
      });
      const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());
      const tryUntarAsync: jest.Mock = jest.fn().mockResolvedValue(0);

      jest.spyOn(FileSystem, 'deleteFolderAsync').mockResolvedValue();
      jest.spyOn(FileSystem, 'moveAsync').mockResolvedValue();
      Reflect.set(OperationBuildCache, '_tarUtilityPromise', Promise.resolve({ tryUntarAsync }));

      const result: boolean = await subject.tryRestoreFromCacheAsync(terminal);

      expect(result).toBe(true);
      expect(tryDownloadCacheEntryToFileAsync).toHaveBeenCalledTimes(1);
      // No lock instance was returned, so there is nothing to release.
      expect(fakeLockRelease).not.toHaveBeenCalled();
    });
  });

  describe('AppleDouble file exclusion', () => {
    const originalPlatform: NodeJS.Platform = process.platform;

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      jest.restoreAllMocks();
    });

    it('omits AppleDouble files with companions when enabled on macOS', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      const subject: OperationBuildCache = prepareSubject({ excludeAppleDoubleFiles: true });

      jest
        .spyOn(FileSystem, 'readFolderItemsAsync')
        .mockResolvedValue([
          createFolderItem('foo.txt', 'file'),
          createFolderItem('._foo.txt', 'file'),
          createFolderItem('bar.js', 'file'),
          createFolderItem('._bar.js', 'file')
        ]);

      const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(true);
      const terminal: Terminal = new Terminal(terminalProvider);

      const result: { outputFilePaths: string[]; filteredOutputFolderNames: string[] } | undefined =
        await subject['_tryCollectPathsToCacheAsync'](terminal);

      expect(result).toBeDefined();
      expect(result!.outputFilePaths).toEqual(['dist/bar.js', 'dist/foo.txt']);
      expect(result!.outputFilePaths).not.toContain('dist/._foo.txt');
      expect(result!.outputFilePaths).not.toContain('dist/._bar.js');
    });

    it('keeps AppleDouble files without companion files', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      const subject: OperationBuildCache = prepareSubject({ excludeAppleDoubleFiles: true });

      jest
        .spyOn(FileSystem, 'readFolderItemsAsync')
        .mockResolvedValue([createFolderItem('._orphan.txt', 'file'), createFolderItem('other.js', 'file')]);

      const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(true);
      const terminal: Terminal = new Terminal(terminalProvider);

      const result: { outputFilePaths: string[]; filteredOutputFolderNames: string[] } | undefined =
        await subject['_tryCollectPathsToCacheAsync'](terminal);

      expect(result).toBeDefined();
      expect(result!.outputFilePaths).toEqual(['dist/._orphan.txt', 'dist/other.js']);
    });

    it('does not exclude AppleDouble files when the experiment is disabled', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      const subject: OperationBuildCache = prepareSubject({ excludeAppleDoubleFiles: false });

      jest
        .spyOn(FileSystem, 'readFolderItemsAsync')
        .mockResolvedValue([createFolderItem('foo.txt', 'file'), createFolderItem('._foo.txt', 'file')]);

      const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(true);
      const terminal: Terminal = new Terminal(terminalProvider);

      const result: { outputFilePaths: string[]; filteredOutputFolderNames: string[] } | undefined =
        await subject['_tryCollectPathsToCacheAsync'](terminal);

      expect(result).toBeDefined();
      expect(result!.outputFilePaths).toEqual(['dist/._foo.txt', 'dist/foo.txt']);
    });

    it('does not exclude AppleDouble files on non-macOS platforms', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const subject: OperationBuildCache = prepareSubject({ excludeAppleDoubleFiles: true });

      jest
        .spyOn(FileSystem, 'readFolderItemsAsync')
        .mockResolvedValue([createFolderItem('foo.txt', 'file'), createFolderItem('._foo.txt', 'file')]);

      const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(true);
      const terminal: Terminal = new Terminal(terminalProvider);

      const result: { outputFilePaths: string[]; filteredOutputFolderNames: string[] } | undefined =
        await subject['_tryCollectPathsToCacheAsync'](terminal);

      expect(result).toBeDefined();
      expect(result!.outputFilePaths).toEqual(['dist/._foo.txt', 'dist/foo.txt']);
    });

    it('does not exclude files named exactly "._"', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      const subject: OperationBuildCache = prepareSubject({ excludeAppleDoubleFiles: true });

      jest
        .spyOn(FileSystem, 'readFolderItemsAsync')
        .mockResolvedValue([createFolderItem('._', 'file'), createFolderItem('other.txt', 'file')]);

      const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(true);
      const terminal: Terminal = new Terminal(terminalProvider);

      const result: { outputFilePaths: string[]; filteredOutputFolderNames: string[] } | undefined =
        await subject['_tryCollectPathsToCacheAsync'](terminal);

      expect(result).toBeDefined();
      expect(result!.outputFilePaths).toEqual(['dist/._', 'dist/other.txt']);
    });

    it('excludes AppleDouble files in nested directories', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      const subject: OperationBuildCache = prepareSubject({ excludeAppleDoubleFiles: true });

      // First call returns the top-level dist/ contents with a subdirectory
      // Second call returns the subdirectory contents
      jest
        .spyOn(FileSystem, 'readFolderItemsAsync')
        .mockResolvedValueOnce([
          createFolderItem('index.js', 'file'),
          createFolderItem('._index.js', 'file'),
          createFolderItem('sub', 'directory')
        ])
        .mockResolvedValueOnce([
          createFolderItem('nested.js', 'file'),
          createFolderItem('._nested.js', 'file')
        ]);

      const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(true);
      const terminal: Terminal = new Terminal(terminalProvider);

      const result: { outputFilePaths: string[]; filteredOutputFolderNames: string[] } | undefined =
        await subject['_tryCollectPathsToCacheAsync'](terminal);

      expect(result).toBeDefined();
      expect(result!.outputFilePaths).toEqual(['dist/index.js', 'dist/sub/nested.js']);
      expect(result!.outputFilePaths).not.toContain('dist/._index.js');
      expect(result!.outputFilePaths).not.toContain('dist/sub/._nested.js');
    });
  });
});
