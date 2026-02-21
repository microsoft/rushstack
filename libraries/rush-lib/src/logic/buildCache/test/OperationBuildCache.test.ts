// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, type FolderItem } from '@rushstack/node-core-library';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import type { BuildCacheConfiguration } from '../../../api/BuildCacheConfiguration.ts';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject.ts';
import type { IGenerateCacheEntryIdOptions } from '../CacheEntryId.ts';
import type { FileSystemBuildCacheProvider } from '../FileSystemBuildCacheProvider.ts';

import { OperationBuildCache } from '../OperationBuildCache.ts';

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
        dependencyProjects: []
      } as unknown as RushConfigurationProject,
      // Value from past tests, for consistency.
      // The project build cache is not responsible for calculating this value.
      operationStateHash: '1926f30e8ed24cb47be89aea39e7efd70fcda075',
      terminal,
      phaseName: 'build',
      excludeAppleDoubleFiles: !!options.excludeAppleDoubleFiles
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
