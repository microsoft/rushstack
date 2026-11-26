// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';

import JSZip from 'jszip';
import * as tar from 'tar';
import { FileSystem, Path } from '@rushstack/node-core-library';
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
  const testFolder: string = path.resolve(`${__dirname}/../../test-output/archives`);
  const sourceFolder: string = `${__dirname}/../../src/test/fixtures/archive`;
  const sourceFile: string = `${sourceFolder}/input.txt`;
  const tempFolder: string = `${testFolder}/common/temp`;
  let fileContent: Buffer;
  let generatedContent: string;
  const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());

  function createHandler(archiveFilePath: string, createArchiveOnly: boolean = true): AssetHandler {
    return new AssetHandler({
      terminal,
      mainProjectName: 'test',
      projectConfigurations: [],
      sourceRootFolder: sourceFolder,
      targetRootFolder: path.dirname(archiveFilePath),
      overwriteExisting: false,
      linkCreation: 'none',
      symlinkAnalyzer: new SymlinkAnalyzer(),
      createArchiveFilePath: archiveFilePath,
      archiveTempFolder: tempFolder,
      createArchiveOnly
    });
  }

  beforeAll(async () => {
    await FileSystem.ensureEmptyFolderAsync(testFolder);
    await FileSystem.ensureFolderAsync(tempFolder);
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
        archiveTempFolder: tempFolder,
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

      expect(await FileSystem.readFolderItemNamesAsync(tempFolder)).toEqual([]);
    }
  });

  it.each(['.tar', '.tar.gz', '.tgz'])('preserves symbolic links in %s archives', async (ext) => {
    const linksFolder: string = `${testFolder}/links-${ext.slice(1)}`;
    const linkPath: string = `${linksFolder}/nested/link`;
    const linkTargetPath: string = `${linksFolder}/linked-folder`;
    await FileSystem.ensureFolderAsync(`${linksFolder}/nested`);
    await FileSystem.ensureFolderAsync(linkTargetPath);
    await FileSystem.createSymbolicLinkFolderAsync({ newLinkPath: linkPath, linkTargetPath });
    const archiveFilePath: string = `${testFolder}/links${ext}`;
    const manager: ArchiveManager = new ArchiveManager(ArchiveManager.getArchiveFormat(archiveFilePath));
    await manager.addToArchiveAsync({ filePath: linkPath, archivePath: 'nested\\link' });
    await manager.createArchiveAsync(archiveFilePath, { terminal, sourceFolder: linksFolder });

    const entries: Map<string, ITarEntry> = await readTarAsync(archiveFilePath);
    expect(entries.get('nested/link')).toMatchObject({
      type: 'SymbolicLink',
      linkpath: expect.stringContaining('linked-folder'),
      data: Buffer.alloc(0)
    });
  });

  it('continues to create ZIP archives', async () => {
    const archiveFilePath: string = `${testFolder}/deploy.zip`;
    const manager: ArchiveManager = new ArchiveManager(ArchiveManager.getArchiveFormat(archiveFilePath));
    await manager.addToArchiveAsync({ filePath: sourceFile, archivePath: 'nested\\input.txt' });
    await manager.addToArchiveAsync({
      filePath: `${sourceFolder}/generated.txt`,
      archivePath: 'generated.txt'
    });
    await manager.createArchiveAsync(archiveFilePath);

    const zip: JSZip = await JSZip.loadAsync(await FileSystem.readFileToBufferAsync(archiveFilePath));
    expect(await zip.file('nested/input.txt')?.async('nodebuffer')).toEqual(fileContent);
    expect(await zip.file('generated.txt')?.async('string')).toBe(generatedContent);
  });

  it.each(['.zip', '.tar', '.tgz'])('writes generated %s assets only once per deployment', async (ext) => {
    for (const createArchiveOnly of [false, true]) {
      const targetRootFolder: string = `${testFolder}/single-write-${ext.slice(1)}-${createArchiveOnly}`;
      await FileSystem.ensureFolderAsync(targetRootFolder);
      const archiveFilePath: string = `${targetRootFolder}/deploy${ext}`;
      const targetFilePath: string = `${targetRootFolder}/generated.txt`;
      const handler: AssetHandler = createHandler(archiveFilePath, createArchiveOnly);
      const writeSpy = jest.spyOn(FileSystem, 'writeFileAsync');
      const addSpy = jest.spyOn(ArchiveManager.prototype, 'addToArchiveAsync');
      await handler.includeAssetAsync({ sourceFileContent: generatedContent, targetFilePath });
      await handler.includeAssetAsync({
        sourceFileContent: '',
        targetFilePath: `${targetRootFolder}/empty.txt`
      });
      await handler.finalizeAsync();

      const writes = writeSpy.mock.calls.filter(([, content]) => content === generatedContent);
      expect(writes).toHaveLength(1);
      const [[writtenPath]] = writes;
      expect(addSpy).toHaveBeenCalledWith({
        filePath: writtenPath,
        archivePath: 'generated.txt'
      });
      if (createArchiveOnly) {
        expect(Path.convertToSlashes(writtenPath)).toContain(`${Path.convertToSlashes(tempFolder)}/`);
        expect(await FileSystem.existsAsync(targetFilePath)).toBe(false);
      } else {
        expect(writtenPath).toBe(targetFilePath);
      }

      if (ext === '.zip') {
        const zip: JSZip = await JSZip.loadAsync(await FileSystem.readFileToBufferAsync(archiveFilePath));
        expect(await zip.file('generated.txt')?.async('string')).toBe(generatedContent);
        expect(await zip.file('empty.txt')?.async('string')).toBe('');
      } else {
        const entries: Map<string, ITarEntry> = await readTarAsync(archiveFilePath);
        expect(entries.get('generated.txt')?.data.toString()).toBe(generatedContent);
        expect(entries.get('empty.txt')?.data.length).toBe(0);
      }

      expect(await FileSystem.readFolderItemNamesAsync(tempFolder)).toEqual([]);
      jest.restoreAllMocks();
    }
  });

  it('archives the materialized target rather than the original source in ZIP deployments', async () => {
    const targetRootFolder: string = `${testFolder}/zip-target`;
    await FileSystem.ensureFolderAsync(targetRootFolder);
    const archiveFilePath: string = `${targetRootFolder}/deploy.zip`;
    const targetFilePath: string = `${targetRootFolder}/input.txt`;
    const handler: AssetHandler = createHandler(archiveFilePath, false);
    await handler.includeAssetAsync({ sourceFilePath: sourceFile, targetFilePath });
    await FileSystem.writeFileAsync(targetFilePath, 'updated target');
    await handler.finalizeAsync();
    const zip: JSZip = await JSZip.loadAsync(await FileSystem.readFileToBufferAsync(archiveFilePath));
    expect(await zip.file('input.txt')?.async('string')).toBe('updated target');
  });

  it('preserves executable permissions when staging archive-only assets', async () => {
    const archiveFilePath: string = `${testFolder}/permissions.tar`;
    const executablePath: string = `${sourceFolder}/executable.sh`;
    const handler: AssetHandler = createHandler(archiveFilePath);
    await handler.includeAssetAsync({
      sourceFilePath: executablePath,
      targetFilePath: `${testFolder}/executable.sh`
    });
    await handler.finalizeAsync();
    const entry: ITarEntry | undefined = (await readTarAsync(archiveFilePath)).get('executable.sh');
    expect(entry?.data).toEqual(await FileSystem.readFileToBufferAsync(executablePath));
    if (process.platform !== 'win32') {
      expect(entry?.mode).toBe(0o755);
    }
  });

  it('uses native tar without staging materialized files', async () => {
    const nativeTar: TarExecutable | undefined = await TarExecutable.tryInitializeAsync(terminal);
    if (!nativeTar) {
      throw new Error('Native tar is required for the native-tar test');
    }

    jest.spyOn(TarExecutable, 'tryInitializeAsync').mockResolvedValue(nativeTar);
    const createSpy = jest.spyOn(nativeTar, 'tryCreateArchiveAsync');
    const archiveFilePath: string = `${testFolder}/native.tar`;
    const manager: ArchiveManager = new ArchiveManager(ArchiveManager.getArchiveFormat(archiveFilePath));
    await manager.addToArchiveAsync({ filePath: sourceFile, archivePath: 'input.txt' });
    await manager.createArchiveAsync(archiveFilePath, { terminal, sourceFolder });
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ baseFolderPath: sourceFolder, paths: ['input.txt'], gzip: false })
    );
    expect((await readTarAsync(archiveFilePath)).get('input.txt')?.data).toEqual(fileContent);
    expect(await FileSystem.existsAsync(`${archiveFilePath}.log`)).toBe(false);
    expect(await FileSystem.readFolderItemNamesAsync(tempFolder)).toEqual([]);
  });

  it('rejects unsupported extensions', () => {
    expect(() => ArchiveManager.getArchiveFormat('deploy.gz')).toThrow('Supported archive file extensions');
  });

  it('cleans up staging when generating an asset during finalization fails', async () => {
    const archiveFilePath: string = `${testFolder}/copy-failure.tgz`;
    const handler: AssetHandler = createHandler(archiveFilePath);
    await handler.includeAssetAsync({
      sourceFileContent: generatedContent,
      targetFilePath: `${testFolder}/generated.txt`
    });
    jest.spyOn(FileSystem, 'writeFileAsync').mockRejectedValue(new Error('write failed'));
    await expect(
      handler.finalizeAsync({
        onAfterExtractSymlinksAsync: async () => {
          await handler.includeAssetAsync({
            sourceFileContent: 'content',
            targetFilePath: `${testFolder}/other.txt`
          });
        }
      })
    ).rejects.toThrow('write failed');
    expect(await FileSystem.readFolderItemNamesAsync(tempFolder)).toEqual([]);
    expect(await FileSystem.existsAsync(archiveFilePath)).toBe(false);
  });

  it.each(['unavailable', 'incompatible'])('fails explicitly when native tar is %s', async (reason) => {
    const nativeTar: TarExecutable | undefined = await TarExecutable.tryInitializeAsync(terminal);
    const initializeSpy = jest.spyOn(TarExecutable, 'tryInitializeAsync');
    const archiveFilePath: string = `${testFolder}/failure-${reason}.tgz`;
    if (reason === 'unavailable') {
      initializeSpy.mockResolvedValue(undefined);
    } else {
      if (!nativeTar) {
        throw new Error('Native tar is required for the incompatible-tar test');
      }

      jest.spyOn(nativeTar, 'tryCreateArchiveAsync').mockImplementation(async ({ baseFolderPath }) => {
        expect(Path.convertToSlashes(baseFolderPath)).toContain(
          `${Path.convertToSlashes(tempFolder)}/deploy-archive-`
        );
        expect(await FileSystem.readFileToBufferAsync(`${baseFolderPath}/input.txt`)).toEqual(fileContent);
        await FileSystem.writeFileAsync(archiveFilePath, 'partial archive');
        return 1;
      });
      initializeSpy.mockResolvedValue(nativeTar);
    }

    const handler: AssetHandler = createHandler(archiveFilePath);
    await handler.includeAssetAsync({
      sourceFilePath: sourceFile,
      targetFilePath: `${testFolder}/input.txt`
    });
    await expect(handler.finalizeAsync()).rejects.toThrow(
      reason === 'unavailable' ? 'Native tar is required' : 'Native tar exited with code 1'
    );
    expect(initializeSpy).toHaveBeenCalled();
    expect(await FileSystem.readFolderItemNamesAsync(tempFolder)).toEqual([]);
    expect(await FileSystem.existsAsync(archiveFilePath)).toBe(false);
  });

  it('uses isolated staging folders for concurrent archive-only deployments', async () => {
    const nativeTar: TarExecutable | undefined = await TarExecutable.tryInitializeAsync(terminal);
    if (!nativeTar) {
      throw new Error('Native tar is required for the staging test');
    }

    const createSpy = jest.spyOn(nativeTar, 'tryCreateArchiveAsync');
    const archivePaths: string[] = [`${testFolder}/concurrent-1.tgz`, `${testFolder}/concurrent-2.tgz`];
    await Promise.all(
      archivePaths.map(async (archivePath, index) => {
        const handler: AssetHandler = createHandler(archivePath);
        await handler.includeAssetAsync({
          sourceFileContent: `content ${index}`,
          targetFilePath: `${testFolder}/input.txt`
        });
        await handler.finalizeAsync();
        expect((await readTarAsync(archivePath)).get('input.txt')?.data.toString()).toBe(`content ${index}`);
      })
    );
    const stagingFolders: string[] = createSpy.mock.calls.map(([{ baseFolderPath }]) => baseFolderPath);
    expect(new Set(stagingFolders).size).toBe(2);
    for (const stagingFolder of stagingFolders) {
      expect(Path.convertToSlashes(stagingFolder)).toContain(
        `${Path.convertToSlashes(tempFolder)}/deploy-archive-`
      );
      expect(await FileSystem.existsAsync(stagingFolder)).toBe(false);
    }
  });

  it('treats whitespace and leading dashes in member names literally', async () => {
    const archiveFilePath: string = `${testFolder}/special-paths.tar`;
    const memberNames: string[] = ['-C', ' leading spaces', 'nested/file with spaces.txt'];
    if (process.platform !== 'win32') {
      memberNames.push(' trailing spaces ', 'line\nbreak', 'line\rbreak');
    }

    const handler: AssetHandler = createHandler(archiveFilePath);
    for (const archivePath of memberNames) {
      await handler.includeAssetAsync({
        sourceFileContent: archivePath,
        targetFilePath: `${testFolder}/${archivePath}`
      });
    }

    await handler.finalizeAsync();
    const entries: Map<string, ITarEntry> = await readTarAsync(archiveFilePath);
    for (const memberName of memberNames) {
      expect(entries.get(memberName)?.data.toString()).toBe(memberName);
    }
  });

  it('rejects archive entries outside the staging folder', async () => {
    const manager: ArchiveManager = new ArchiveManager('tar');
    await expect(
      manager.addToArchiveAsync({ filePath: sourceFile, archivePath: '../outside' })
    ).rejects.toThrow('relative paths within the archive');
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

  it('memoizes native discovery independently for each explicit executable', async () => {
    const provider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
    const discoveryTerminal: Terminal = new Terminal(provider);
    const executablePath: string = `${testFolder}/memoized-tar`;
    const [first, second] = await Promise.all([
      TarExecutable.tryInitializeAsync(discoveryTerminal, executablePath),
      TarExecutable.tryInitializeAsync(discoveryTerminal, executablePath)
    ]);
    expect(first).toBe(second);
    expect(provider.getVerboseOutput().match(/Trying to find/g)).toHaveLength(1);
    const other: TarExecutable | undefined = await TarExecutable.tryInitializeAsync(
      terminal,
      process.execPath
    );
    expect(first).not.toBe(other);
  });
});
