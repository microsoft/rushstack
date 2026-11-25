// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import JSZip from 'jszip';
import * as tar from 'tar';
import { FileSystem, type FileSystemStats } from '@rushstack/node-core-library';
import { Terminal, StringBufferTerminalProvider } from '@rushstack/terminal';

import { ArchiveManager } from '../ArchiveManager';
import { AssetHandler } from '../AssetHandler';
import { SymlinkAnalyzer } from '../SymlinkAnalyzer';
import { TarExecutable } from '../TarExecutable';

interface ITarEntry {
  type: string;
  mode?: number;
  linkpath?: string;
  data: Buffer;
}

async function readTarAsync(archivePath: string): Promise<Map<string, ITarEntry>> {
  const entries: Map<string, ITarEntry> = new Map();
  await tar.list({
    file: archivePath,
    onReadEntry: (entry) => {
      const chunks: Buffer[] = [];
      entry.on('data', (chunk: Buffer) => chunks.push(chunk));
      entry.on('end', () => {
        const { path: entryPath, type, mode, linkpath } = entry;
        entries.set(entryPath, { type, mode, linkpath, data: Buffer.concat(chunks) });
      });
    }
  });

  return entries;
}

describe(ArchiveManager.name, () => {
  const testFolder: string = `${__dirname}/../../test-output/archives`;
  const sourceFolder: string = `${__dirname}/../../src/test/fixtures/archive`;
  const sourceFile: string = `${sourceFolder}/input.txt`;
  let fileContent: Buffer;
  let generatedContent: string;
  const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());

  beforeAll(async () => {
    await FileSystem.ensureEmptyFolderAsync(testFolder);
    fileContent = await FileSystem.readFileToBufferAsync(sourceFile);
    generatedContent = await FileSystem.readFileAsync(`${sourceFolder}/generated.txt`);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each(['.tar', '.tar.gz', '.tgz'])('creates %s archives with and without copying assets', async (ext) => {
    for (const createArchiveOnly of [false, true]) {
      const targetRootFolder: string = `${testFolder}/${ext.slice(1)}-${createArchiveOnly}`;
      await FileSystem.ensureFolderAsync(targetRootFolder);
      const archiveFilePath: string = `${targetRootFolder}/deploy${ext}`;
      const targetFilePath: string = `${targetRootFolder}/nested/input.txt`;
      const handler: AssetHandler = new AssetHandler({
        terminal,
        mainProjectName: 'test',
        projectConfigurations: [],
        sourceRootFolder: sourceFolder,
        targetRootFolder,
        overwriteExisting: false,
        linkCreation: 'none',
        symlinkAnalyzer: new SymlinkAnalyzer(),
        createArchiveFilePath: archiveFilePath,
        createArchiveOnly
      });

      await handler.includeAssetAsync({ sourceFilePath: sourceFile, targetFilePath });
      await handler.includeAssetAsync({
        sourceFileContent: generatedContent,
        targetFilePath: `${targetRootFolder}/generated.txt`
      });
      await handler.finalizeAsync();

      const entries: Map<string, ITarEntry> = await readTarAsync(archiveFilePath);
      const archiveContent: Buffer = await FileSystem.readFileToBufferAsync(archiveFilePath);
      if (ext === '.tar') {
        expect(archiveContent.subarray(257, 262).toString()).toBe('ustar');
      } else {
        expect(archiveContent.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]));
      }

      expect([...entries.keys()].sort()).toEqual(['generated.txt', 'nested/input.txt']);
      expect(entries.get('nested/input.txt')?.data).toEqual(fileContent);
      expect(entries.get('nested/input.txt')).toMatchObject({
        type: 'File'
      });
      if (process.platform !== 'win32') {
        expect(entries.get('nested/input.txt')?.mode).toBe(
          // eslint-disable-next-line no-bitwise
          (await FileSystem.getStatisticsAsync(sourceFile)).mode & 0o7777
        );
      }

      expect(entries.get('generated.txt')?.data.toString()).toBe(generatedContent);
      expect(await FileSystem.existsAsync(targetFilePath)).toBe(!createArchiveOnly);
      if (createArchiveOnly) {
        expect(await FileSystem.readFolderItemNamesAsync(targetRootFolder)).toEqual([`deploy${ext}`]);
      }
    }
  });

  it.each(['.tar', '.tar.gz', '.tgz'])('preserves symbolic links in %s archives', async (ext) => {
    const linkPath: string = `${sourceFolder}/link${ext}`;
    const stats: FileSystemStats = await FileSystem.getStatisticsAsync(sourceFile);
    jest.spyOn(stats, 'isSymbolicLink').mockReturnValue(true);
    jest.spyOn(FileSystem, 'readLinkAsync').mockResolvedValue('../input.txt');
    const archiveFilePath: string = `${testFolder}/links${ext}`;
    const manager: ArchiveManager = new ArchiveManager(archiveFilePath);
    await manager.addToArchiveAsync({ filePath: linkPath, archivePath: 'nested\\link', stats });
    await manager.createArchiveAsync(archiveFilePath);

    const entries: Map<string, ITarEntry> = await readTarAsync(archiveFilePath);
    expect(entries.get('nested/link')).toMatchObject({
      type: 'SymbolicLink',
      linkpath: '../input.txt',
      data: Buffer.alloc(0)
    });
  });

  it('continues to create ZIP archives', async () => {
    const archiveFilePath: string = `${testFolder}/deploy.zip`;
    const manager: ArchiveManager = new ArchiveManager(archiveFilePath);
    await manager.addToArchiveAsync({ filePath: sourceFile, archivePath: 'nested\\input.txt' });
    await manager.addToArchiveAsync({ fileData: generatedContent, archivePath: 'generated.txt' });
    await manager.createArchiveAsync(archiveFilePath);

    const zip: JSZip = await JSZip.loadAsync(await FileSystem.readFileToBufferAsync(archiveFilePath));
    expect(await zip.file('nested/input.txt')?.async('nodebuffer')).toEqual(fileContent);
    expect(await zip.file('generated.txt')?.async('string')).toBe(generatedContent);
  });

  it('preserves executable permissions for in-memory tar entries', async () => {
    const archiveFilePath: string = `${testFolder}/permissions.tar`;
    const executablePath: string = `${sourceFolder}/executable.sh`;
    const stats: FileSystemStats = await FileSystem.getStatisticsAsync(executablePath);
    stats.mode = 0o100775;
    const manager: ArchiveManager = new ArchiveManager(archiveFilePath);
    await manager.addToArchiveAsync({ filePath: executablePath, archivePath: 'executable.sh', stats });
    await manager.createArchiveAsync(archiveFilePath);
    expect((await readTarAsync(archiveFilePath)).get('executable.sh')?.mode).toBe(0o775);
  });

  it('prefers native tar for materialized files', async () => {
    const nativeTar: TarExecutable | undefined = await TarExecutable.tryInitializeAsync(terminal);
    if (!nativeTar) {
      throw new Error('Native tar is required for the native-tar test');
    }

    jest.spyOn(TarExecutable, 'tryInitializeAsync').mockResolvedValue(nativeTar);
    const createSpy = jest.spyOn(nativeTar, 'tryCreateArchiveAsync');
    const archiveFilePath: string = `${testFolder}/native.tar`;
    const manager: ArchiveManager = new ArchiveManager(archiveFilePath);
    await manager.addToArchiveAsync({ filePath: sourceFile, archivePath: 'input.txt' });
    await manager.createArchiveAsync(archiveFilePath, { terminal, sourceFolder });
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ baseFolderPath: sourceFolder, paths: ['input.txt'], gzip: false })
    );
    expect((await readTarAsync(archiveFilePath)).get('input.txt')?.data).toEqual(fileContent);
    expect(await FileSystem.existsAsync(`${archiveFilePath}.log`)).toBe(false);
  });

  it('rejects unsupported extensions', () => {
    expect(() => new ArchiveManager('deploy.gz')).toThrow('Supported archive file extensions');
  });

  it('reports archive write failures', async () => {
    const archiveFilePath: string = `${testFolder}/missing/deploy.tgz`;
    const manager: ArchiveManager = new ArchiveManager(archiveFilePath);
    await manager.addToArchiveAsync({ fileData: 'content', archivePath: 'file.txt' });
    await expect(manager.createArchiveAsync(archiveFilePath)).rejects.toThrow();
  });

  it.each(['unavailable', 'incompatible'])('falls back when native tar is %s', async (reason) => {
    const nativeTar: TarExecutable | undefined = await TarExecutable.tryInitializeAsync(terminal);
    const initializeSpy = jest.spyOn(TarExecutable, 'tryInitializeAsync');
    if (reason === 'unavailable') {
      initializeSpy.mockResolvedValue(undefined);
    } else {
      if (!nativeTar) {
        throw new Error('Native tar is required for the incompatible-tar test');
      }

      jest.spyOn(nativeTar, 'tryCreateArchiveAsync').mockResolvedValue(1);
      initializeSpy.mockResolvedValue(nativeTar);
    }

    const archiveFilePath: string = `${testFolder}/fallback-${reason}.tgz`;
    const manager: ArchiveManager = new ArchiveManager(archiveFilePath);
    await manager.addToArchiveAsync({ filePath: sourceFile, archivePath: 'input.txt' });
    await manager.createArchiveAsync(archiveFilePath, { terminal, sourceFolder });
    expect(initializeSpy).toHaveBeenCalled();
    expect((await readTarAsync(archiveFilePath)).get('input.txt')?.data).toEqual(fileContent);
  });

  it('handles a native executable that exits before reading the file list', async () => {
    const incompatibleTar: TarExecutable | undefined = await TarExecutable.tryInitializeAsync(
      terminal,
      process.execPath
    );
    if (!incompatibleTar) {
      throw new Error('The Node executable could not be located');
    }

    const exitCode: number = await incompatibleTar.tryCreateArchiveAsync({
      archivePath: `${testFolder}/incompatible.tgz`,
      baseFolderPath: sourceFolder,
      paths: new Array<string>(10000).fill('input.txt'),
      logFilePath: `${testFolder}/incompatible.log`
    });
    expect(exitCode).not.toBe(0);
    expect(await FileSystem.readFileAsync(`${testFolder}/incompatible.log`)).toContain('Exited with code');
  });
});
