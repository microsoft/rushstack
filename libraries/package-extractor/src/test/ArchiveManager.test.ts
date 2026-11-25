// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';

import JSZip from 'jszip';
import * as tar from 'tar';
import { FileSystem, Path, PosixModeBits } from '@rushstack/node-core-library';
import { Terminal, StringBufferTerminalProvider } from '@rushstack/terminal';

import { ArchiveManager } from '../ArchiveManager';
import { AssetHandler } from '../AssetHandler';
import { SymlinkAnalyzer } from '../SymlinkAnalyzer';

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
  const testFolder: string = path.resolve(__dirname, '../../test-output/archives');
  const sourceFolder: string = path.join(testFolder, 'source');
  const sourceFile: string = path.join(sourceFolder, 'input.bin');
  const binaryContent: Buffer = Buffer.from([0, 1, 127, 128, 255]);
  const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());

  beforeAll(async () => {
    await FileSystem.ensureEmptyFolderAsync(testFolder);
    await FileSystem.writeFileAsync(sourceFile, binaryContent, { ensureFolderExists: true });
    await FileSystem.changePosixModeBitsAsync(
      sourceFile,
      // eslint-disable-next-line no-bitwise
      PosixModeBits.AllRead | PosixModeBits.UserWrite | PosixModeBits.GroupWrite | PosixModeBits.AllExecute
    );
  });

  it.each(['.tar', '.tar.gz', '.tgz'])('creates %s archives with and without copying assets', async (ext) => {
    for (const createArchiveOnly of [false, true]) {
      const targetRootFolder: string = path.join(testFolder, `${ext.slice(1)}-${createArchiveOnly}`);
      await FileSystem.ensureFolderAsync(targetRootFolder);
      const archiveFilePath: string = path.join(targetRootFolder, `deploy${ext}`);
      const targetFilePath: string = path.join(targetRootFolder, 'nested', 'input.bin');
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
        sourceFileContent: 'generated content',
        targetFilePath: path.join(targetRootFolder, 'generated.txt')
      });
      await handler.finalizeAsync();

      const entries: Map<string, ITarEntry> = await readTarAsync(archiveFilePath);
      const archiveContent: Buffer = await FileSystem.readFileToBufferAsync(archiveFilePath);
      if (ext === '.tar') {
        expect(archiveContent.subarray(257, 262).toString()).toBe('ustar');
      } else {
        expect(archiveContent.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]));
      }

      expect([...entries.keys()].sort()).toEqual(['generated.txt', 'nested/input.bin']);
      expect(entries.get('nested/input.bin')?.data).toEqual(binaryContent);
      expect(entries.get('nested/input.bin')).toMatchObject({
        type: 'File',
        // eslint-disable-next-line no-bitwise
        mode: (await FileSystem.getStatisticsAsync(sourceFile)).mode & 0o7777
      });
      expect(entries.get('generated.txt')?.data.toString()).toBe('generated content');
      expect(await FileSystem.existsAsync(targetFilePath)).toBe(!createArchiveOnly);
      if (createArchiveOnly) {
        expect(await FileSystem.readFolderItemNamesAsync(targetRootFolder)).toEqual([`deploy${ext}`]);
      }
    }
  });

  const testSymlinks: typeof it = process.platform === 'win32' ? it.skip : it;
  testSymlinks.each(['.tar', '.tar.gz', '.tgz'])('preserves symbolic links in %s archives', async (ext) => {
    const linkPath: string = path.join(sourceFolder, `link${ext}`);
    await FileSystem.createSymbolicLinkFileAsync({
      newLinkPath: linkPath,
      linkTargetPath: 'input.bin'
    });
    const archiveFilePath: string = path.join(testFolder, `links${ext}`);
    const manager: ArchiveManager = new ArchiveManager(archiveFilePath);
    await manager.addToArchiveAsync({ filePath: linkPath, archivePath: 'nested\\link' });
    await manager.createArchiveAsync(archiveFilePath);

    const entries: Map<string, ITarEntry> = await readTarAsync(archiveFilePath);
    expect(entries.get('nested/link')).toMatchObject({
      type: 'SymbolicLink',
      linkpath: Path.convertToSlashes(await FileSystem.readLinkAsync(linkPath)),
      data: Buffer.alloc(0)
    });
  });

  it('continues to create ZIP archives', async () => {
    const archiveFilePath: string = path.join(testFolder, 'deploy.zip');
    const manager: ArchiveManager = new ArchiveManager(archiveFilePath);
    await manager.addToArchiveAsync({ filePath: sourceFile, archivePath: 'nested\\input.bin' });
    await manager.addToArchiveAsync({ fileData: 'generated content', archivePath: 'generated.txt' });
    await manager.createArchiveAsync(archiveFilePath);

    const zip: JSZip = await JSZip.loadAsync(await FileSystem.readFileToBufferAsync(archiveFilePath));
    expect(await zip.file('nested/input.bin')?.async('nodebuffer')).toEqual(binaryContent);
    expect(await zip.file('generated.txt')?.async('string')).toBe('generated content');
  });

  it('rejects unsupported extensions', () => {
    expect(() => new ArchiveManager('deploy.gz')).toThrow('Supported archive file extensions');
  });

  it('reports archive write failures', async () => {
    const archiveFilePath: string = path.join(testFolder, 'missing', 'deploy.tgz');
    const manager: ArchiveManager = new ArchiveManager(archiveFilePath);
    await manager.addToArchiveAsync({ fileData: 'content', archivePath: 'file.txt' });
    await expect(manager.createArchiveAsync(archiveFilePath)).rejects.toThrow();
  });
});
