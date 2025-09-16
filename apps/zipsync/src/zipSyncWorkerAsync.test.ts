// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { tmpdir } from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { zipSyncWorkerAsync } from './zipSyncWorkerAsync';

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

  const targetDirectories = ['demo-data-1', 'demo-data-2', 'demo-data-3', 'nested/demo/dir/4'].map(
    (folderName) => {
      const dataDir: string = path.join(baseDir, folderName);
      fs.mkdirSync(dataDir, { recursive: true });
      const subdir: string = path.join(dataDir, 'subdir');
      fs.mkdirSync(subdir);
      for (let i: number = 0; i < 5; ++i) {
        const filePath: string = path.join(subdir, `file-${i}.txt`);
        fs.writeFileSync(filePath, `This is file ${i} in ${folderName}/subdir\n`, { encoding: 'utf-8' });
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

describe('zipSyncWorkerAsync tests', () => {
  it('basic pack test', async () => {
    const demoDataDisposable = getDemoDataDirectoryDisposable();
    const { targetDirectories, baseDir } = demoDataDisposable;

    const archivePath: string = path.join(baseDir, 'archive.zip');
    const { zipSyncReturn: packResult } = await zipSyncWorkerAsync({
      mode: 'pack',
      compression: 'deflate',
      baseDir,
      targetDirectories,
      archivePath
    });

    expect(packResult).toMatchSnapshot();

    const unpackBaseDir = getTempDir();

    const { zipSyncReturn: unpackResult } = await zipSyncWorkerAsync({
      mode: 'unpack',
      archivePath,
      baseDir: unpackBaseDir,
      targetDirectories,
      compression: 'deflate'
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

    demoDataDisposable[Symbol.dispose]();
  });
});
