// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';

export function getTempDir(): string {
  const randomId: string = crypto.randomUUID();
  const tempDir: string = path.join(tmpdir(), `zipsync-test-${randomId}`);
  fs.mkdirSync(tempDir);
  return tempDir;
}

export function getDemoDataDirectoryDisposable(numFiles: number): {
  targetDirectories: string[];
  baseDir: string;
  [Symbol.dispose](): void;
} {
  const baseDir: string = getTempDir();

  const targetDirectories: string[] = ['demo-data-1', 'demo-data-2', 'demo-data-3', 'nested/demo/dir/4'].map(
    (folderName) => {
      const dataDir: string = path.join(baseDir, folderName);
      fs.mkdirSync(dataDir, { recursive: true });
      const subdir: string = path.join(dataDir, 'subdir');
      fs.mkdirSync(subdir);
      for (let i: number = 0; i < numFiles; ++i) {
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
