// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';

import type { IMetadata } from '../zipSyncUtils.ts';

export function getTempDir(): string {
  const randomId: string = crypto.randomUUID();
  const tempDir: string = path.join(tmpdir(), `zipsync-test-${randomId}`);
  fs.mkdirSync(tempDir);
  return tempDir;
}

export function getDemoDataDirectoryDisposable(numFiles: number): {
  targetDirectories: string[];
  baseDir: string;
  metadata: IMetadata;
  [Symbol.dispose](): void;
} {
  const baseDir: string = getTempDir();

  const metadata: IMetadata = { files: {}, version: '1.0' };

  const targetDirectories: string[] = ['demo-data-1', 'demo-data-2', 'demo-data-3', 'nested/demo/dir/4'].map(
    (folderName) => {
      const dataDir: string = path.join(baseDir, folderName);
      fs.mkdirSync(dataDir, { recursive: true });
      const subdir: string = path.join(dataDir, 'subdir');
      fs.mkdirSync(subdir);
      for (let i: number = 0; i < numFiles; ++i) {
        const filePath: string = path.join(subdir, `file-${i}.txt`);
        const content: string = `This is file ${i} in ${folderName}/subdir\n`;
        const sha1Hash: string = crypto.createHash('sha1').update(content).digest('hex');
        fs.writeFileSync(filePath, content, { encoding: 'utf-8' });
        const relativeFilePath: string = path.relative(baseDir, filePath).replace(/\\/g, '/');
        metadata.files[relativeFilePath] = { size: content.length, sha1Hash };
      }
      return folderName;
    }
  );

  return {
    targetDirectories,
    baseDir,
    metadata,
    [Symbol.dispose]() {
      fs.rmSync(baseDir, { recursive: true, force: true });
    }
  };
}
