// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import * as fs from 'node:fs';

import { NoOpTerminalProvider } from '@rushstack/terminal/lib/NoOpTerminalProvider';
import { Terminal } from '@rushstack/terminal/lib/Terminal';

import { pack } from '../pack';
import { unpack } from '../unpack';
import { getDemoDataDirectoryDisposable } from '../testUtils';
import type { ZipSyncOptionCompression } from '../zipSyncUtils';

describe('zipSync tests', () => {
  it(`basic pack test`, () => {
    const compressionOptions = ['store', 'deflate', 'zstd', 'auto'] satisfies ZipSyncOptionCompression[];
    compressionOptions.forEach((compression) => {
      if (compression === 'zstd') {
        const [major, minor] = process.versions.node.split('.').map((x) => parseInt(x, 10));
        if (major < 22 || (major === 22 && minor < 15)) {
          // eslint-disable-next-line no-console
          console.warn(`Skipping zstd test on Node ${process.versions.node}`);
          return;
        }
      }

      using demoDataDisposable = getDemoDataDirectoryDisposable(5);
      const { targetDirectories, baseDir, metadata } = demoDataDisposable;

      const terminal = new Terminal(new NoOpTerminalProvider());

      const archivePath: string = path.join(baseDir, 'archive.zip');
      const packResult = pack({
        terminal: terminal,
        compression,
        baseDir,
        targetDirectories,
        archivePath
      });

      expect(packResult).toMatchObject({ filesPacked: 21, metadata });

      using unpackDemoDataDisposable = getDemoDataDirectoryDisposable(2);
      const { baseDir: unpackBaseDir } = unpackDemoDataDisposable;

      const unpackResult = unpack({
        terminal: terminal,
        archivePath,
        baseDir: unpackBaseDir,
        targetDirectories
      });

      expect(unpackResult).toMatchObject({
        filesDeleted: 0,
        filesExtracted: 12,
        filesSkipped: 8,
        foldersDeleted: 0,
        metadata
      });

      // Verify files were extracted
      for (const targetDirectory of targetDirectories) {
        const sourceDir: string = path.join(baseDir, targetDirectory);
        for (let i: number = 0; i < 5; ++i) {
          const sourceFile: string = path.join(sourceDir, 'subdir', `file-${i}.txt`);
          const destFile: string = path.join(unpackBaseDir, targetDirectory, 'subdir', `file-${i}.txt`);
          expect(fs.readFileSync(destFile, { encoding: 'utf-8' })).toEqual(
            fs.readFileSync(sourceFile, { encoding: 'utf-8' })
          );
        }
      }
    });
  });
});
