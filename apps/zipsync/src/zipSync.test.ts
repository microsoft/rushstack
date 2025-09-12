// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { tmpdir } from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { zipSync } from './zipSync';
import { NoOpTerminalProvider, Terminal } from '@rushstack/terminal';

function getTempDir(): string {
  const randomId = crypto.randomUUID();
  const tempDir = path.join(tmpdir(), `zipsync-test-${randomId}`);
  fs.mkdirSync(tempDir);
  return tempDir;
}

function getDemoDataDirectoryDisposable(): {
  targetDirectories: string[];
  baseDir: string;
  [Symbol.dispose](): void;
} {
  const baseDir: string = getTempDir();

  let demoCounter: number = 0;
  const targetDirectories = ['demo-data-1', 'demo-data-2', 'demo-data-3', 'nested/demo/dir/4'].map(
    (folderName) => {
      const dataDir: string = path.join(baseDir, folderName);
      fs.mkdirSync(dataDir, { recursive: true });
      const subdir: string = path.join(dataDir, 'subdir');
      fs.mkdirSync(subdir);
      for (let i: number = 0; i < 5; ++i) {
        const filePath: string = path.join(subdir, `file-${demoCounter}.txt`);
        fs.writeFileSync(filePath, `This is file ${demoCounter}\n`, { encoding: 'utf-8' });
        demoCounter += 1;
      }
      return folderName;
    }
  );

  return {
    targetDirectories,
    baseDir,
    [Symbol.dispose]() {
      fs.rmSync(baseDir, { recursive: true, force: true });
    }
  };
}

describe('zipsync tests', () => {
  it('basic pack test', () => {
    const demoDataDisposable = getDemoDataDirectoryDisposable();
    const { targetDirectories, baseDir } = demoDataDisposable;

    const terminal = new Terminal(new NoOpTerminalProvider());

    const archivePath: string = path.join(baseDir, 'archive.zip');
    const packResult = zipSync({
      mode: 'pack',
      terminal: terminal,
      compression: 'deflate',
      baseDir,
      targetDirectories,
      archivePath
    });

    expect(packResult).toMatchSnapshot();

    const extractDir: string = path.join(baseDir, 'extract-here');
    fs.mkdirSync(extractDir);

    const unpackBaseDir = getTempDir();

    const unpackResult = zipSync({
      mode: 'unpack',
      terminal: terminal,
      archivePath,
      baseDir: unpackBaseDir,
      targetDirectories,
      compression: 'deflate'
    });

    // expect(unpackResult).toMatchSnapshot();

    // // Verify files were extracted
    // for (const targetDirectory of targetDirectories) {
    //   const sourceDir: string = path.join(baseDir, targetDirectory);
    //   const destDir: string = path.join(extractDir, targetDirectory);
    //   for (let i: number = 0; i < 5; ++i) {
    //     const filePath: string = path.join(sourceDir, 'subdir', `file-${i}.txt`);
    //     const extractedFilePath: string = path.join(destDir, 'subdir', `file-${i}.txt`);
    //     expect(fs.existsSync(extractedFilePath)).toBe(true);
    //     expect(fs.readFileSync(extractedFilePath, { encoding: 'utf-8' })).toEqual(
    //       fs.readFileSync(filePath, { encoding: 'utf-8' })
    //     );
    //   }
    // }

    // demoDataDisposable[Symbol.dispose]();
  });
});
