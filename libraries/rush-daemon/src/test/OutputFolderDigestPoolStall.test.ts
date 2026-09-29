// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Worker } from 'node:worker_threads';

import { digestOutputFolders, type IOutputFolderDigest, type IOutputFolderSet } from '../OutputFolderDigest';
import { OutputFolderDigestPool } from '../OutputFolderDigestPool';

const THREAD_COUNT: number = 2;

describe(OutputFolderDigestPool.name, () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-output-stall-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('stops its workers when they stall', async () => {
    const folderSets: IOutputFolderSet[] = ['a', 'b', 'c'].map((name: string) => {
      const projectFolder: string = path.join(root, name);
      fs.mkdirSync(path.join(projectFolder, 'lib'), { recursive: true });
      fs.writeFileSync(path.join(projectFolder, 'lib', 'output.js'), name);
      return { projectFolder, folderNames: ['lib'] };
    });
    // Claims every folder set and never publishes a result.
    const stalledWorkerPath: string = path.join(root, 'stalled-worker.js');
    fs.writeFileSync(
      stalledWorkerPath,
      [
        "const { parentPort } = require('node:worker_threads');",
        'parentPort.on("message", ({ folderSets, state }) => {',
        '  while (Atomics.add(state, 0, 1) < folderSets.length) {}',
        '});'
      ].join('\n')
    );
    const terminate: jest.SpyInstance<Promise<number>, []> = jest.spyOn(Worker.prototype, 'terminate');
    const pool: OutputFolderDigestPool = new OutputFolderDigestPool({
      threadCount: THREAD_COUNT,
      workerScriptPath: stalledWorkerPath,
      stallTimeoutMs: 200,
      claimOnCallingThread: false
    });
    try {
      expect(pool.digest(folderSets)).toEqual(
        folderSets.map((folderSet: IOutputFolderSet): IOutputFolderDigest => digestOutputFolders(folderSet))
      );
      expect(pool.stalled).toBe(true);
      // The digest itself stopped each worker once, and each worker's thread exits.
      const stoppedWorkers: Worker[] = terminate.mock.contexts;
      expect(terminate).toHaveBeenCalledTimes(THREAD_COUNT);
      expect(new Set(stoppedWorkers).size).toBe(THREAD_COUNT);
      await Promise.all(terminate.mock.results.map(({ value }: jest.MockResult<Promise<number>>) => value));
      expect(stoppedWorkers.map(({ threadId }: Worker) => threadId)).toEqual([-1, -1]);
    } finally {
      pool.dispose();
      terminate.mockRestore();
    }
  }, 20_000);
});
