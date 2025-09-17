// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import * as fs from 'node:fs';

import { NoOpTerminalProvider } from '@rushstack/terminal/lib/NoOpTerminalProvider';
import { Terminal } from '@rushstack/terminal/lib/Terminal';

import { pack } from './pack';
import { unpack } from './unpack';
import { getCompressionOptions, getDemoDataDirectoryDisposable } from './testUtils';
import type { ZipSyncOptionCompression } from './zipSyncUtils';

const compressionOptions = getCompressionOptions() satisfies ZipSyncOptionCompression[];

describe('zipSync tests', () => {
  compressionOptions.forEach((compression: ZipSyncOptionCompression) => {
    it(`basic pack test (${compression})`, () => {
      using demoDataDisposable = getDemoDataDirectoryDisposable(5);
      const { targetDirectories, baseDir } = demoDataDisposable;

      const terminal = new Terminal(new NoOpTerminalProvider());

      const archivePath: string = path.join(baseDir, 'archive.zip');
      const packResult = pack({
        terminal: terminal,
        compression,
        baseDir,
        targetDirectories,
        archivePath
      });

      expect(packResult).toMatchSnapshot();

      using unpackDemoDataDisposable = getDemoDataDirectoryDisposable(2);
      const { baseDir: unpackBaseDir } = unpackDemoDataDisposable;

      const unpackResult = unpack({
        terminal: terminal,
        archivePath,
        baseDir: unpackBaseDir,
        targetDirectories
      });

      expect(unpackResult).toMatchSnapshot();

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
