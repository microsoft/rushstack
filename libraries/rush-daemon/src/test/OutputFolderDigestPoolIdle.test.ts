// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('node:worker_threads', () => {
  const actual: typeof import('node:worker_threads') = jest.requireActual('node:worker_threads');
  return {
    ...actual,
    Worker: jest.fn((...args: ConstructorParameters<typeof actual.Worker>) => new actual.Worker(...args))
  };
});

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Worker } from 'node:worker_threads';

import { digestOutputFolders, type IOutputFolderDigest, type IOutputFolderSet } from '../OutputFolderDigest';
import {
  OutputFolderDigestPool,
  OutputFolderDigester,
  type IBackgroundOutputFolderDigests
} from '../OutputFolderDigestPool';

const THREAD_COUNT: number = 2;
const IDLE_TIMEOUT_MS: number = 1000;

const actualWorkerThreads: typeof import('node:worker_threads') = jest.requireActual('node:worker_threads');
const workerMock: jest.MockInstance<Worker, ConstructorParameters<typeof Worker>> = jest.mocked(Worker);

function digestOnCallingThread(folderSets: ReadonlyArray<IOutputFolderSet>): IOutputFolderDigest[] {
  return folderSets.map((folderSet: IOutputFolderSet) => digestOutputFolders(folderSet));
}

function waitForFile(filePath: string): void {
  const sleep: Int32Array = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  const deadlineMs: number = performance.now() + 10000;
  while (!fs.existsSync(filePath)) {
    if (performance.now() > deadlineMs) {
      throw new Error(`${filePath} was not written`);
    }
    Atomics.wait(sleep, 0, 0, 10);
  }
}

/**
 * Writes a worker script that waits for the file `claim` before it claims every folder set of a job, then writes
 * `claimed`, waits for `publish` before it publishes their digests, and writes `published` after it counted them.
 */
function writeGatedWorker(root: string): string {
  const scriptPath: string = path.join(root, 'gated-worker.js');
  fs.writeFileSync(
    scriptPath,
    [
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "const { parentPort, workerData } = require('node:worker_threads');",
      `const { digestOutputFolders } = require(${JSON.stringify(require.resolve('../OutputFolderDigest'))});`,
      `const root = ${JSON.stringify(root)};`,
      'const sleep = new Int32Array(new SharedArrayBuffer(4));',
      'const waitFor = (name) => {',
      '  while (!fs.existsSync(path.join(root, name))) Atomics.wait(sleep, 0, 0, 5);',
      '};',
      'parentPort.on("message", ({ jobId, folderSets, state }) => {',
      "  waitFor('claim');",
      '  const claimed = [];',
      '  for (let index = Atomics.add(state, 0, 1); index < folderSets.length; index = Atomics.add(state, 0, 1)) {',
      '    claimed.push(index);',
      '  }',
      "  fs.writeFileSync(path.join(root, 'claimed'), '');",
      "  waitFor('publish');",
      '  for (const index of claimed) {',
      '    workerData.resultPort.postMessage([jobId, index, digestOutputFolders(folderSets[index])]);',
      '  }',
      '  Atomics.add(state, 1, claimed.length);',
      '  Atomics.notify(state, 1);',
      "  fs.writeFileSync(path.join(root, 'published'), '');",
      '});'
    ].join('\n')
  );
  return scriptPath;
}

let root: string;
let folderSets: IOutputFolderSet[];
let terminate: jest.SpyInstance<Promise<number>, []>;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-output-idle-'));
  folderSets = ['a', 'b', 'c'].map((name: string) => {
    const projectFolder: string = path.join(root, name);
    fs.mkdirSync(path.join(projectFolder, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(projectFolder, 'lib', 'output.js'), name);
    return { projectFolder, folderNames: ['lib'] };
  });
  terminate = jest.spyOn(actualWorkerThreads.Worker.prototype, 'terminate');
  jest.useFakeTimers({ doNotFake: ['nextTick', 'performance', 'setImmediate'] });
});

afterEach(() => {
  jest.useRealTimers();
  terminate.mockRestore();
  fs.rmSync(root, { recursive: true, force: true });
});

describe(OutputFolderDigestPool.name, () => {
  it('stops its workers once no job was posted for the idle timeout, and starts new ones for the next job', async () => {
    const pool: OutputFolderDigestPool = new OutputFolderDigestPool({
      threadCount: THREAD_COUNT,
      idleTimeoutMs: IDLE_TIMEOUT_MS,
      claimOnCallingThread: false
    });
    try {
      const expected: IOutputFolderDigest[] = digestOnCallingThread(folderSets);
      for (let request: number = 0; request < 3; request++) {
        jest.advanceTimersByTime(IDLE_TIMEOUT_MS - 1);
        expect(pool.digest(folderSets)).toEqual(expected);
      }
      expect(terminate).not.toHaveBeenCalled();

      jest.advanceTimersByTime(IDLE_TIMEOUT_MS);
      expect(terminate).toHaveBeenCalledTimes(THREAD_COUNT);
      const idleWorkers: Worker[] = [...terminate.mock.contexts];
      await Promise.all(terminate.mock.results.map(({ value }: jest.MockResult<Promise<number>>) => value));
      expect(idleWorkers.map(({ threadId }: Worker) => threadId)).toEqual([-1, -1]);
      expect(pool.stalled).toBe(false);

      // The calling thread claims no folder sets, so new workers digest this job.
      expect(pool.digest(folderSets)).toEqual(expected);
      expect(pool.stalled).toBe(false);
      expect(workerMock).toHaveBeenCalledTimes(2 * THREAD_COUNT);
      jest.advanceTimersByTime(IDLE_TIMEOUT_MS);
      expect(terminate).toHaveBeenCalledTimes(2 * THREAD_COUNT);
    } finally {
      pool.dispose();
    }
    expect(terminate).toHaveBeenCalledTimes(2 * THREAD_COUNT);
  });

  it('keeps workers that have folder sets of a started job to claim or publish, and the digests they published', () => {
    const pool: OutputFolderDigestPool = new OutputFolderDigestPool({
      threadCount: 1,
      workerScriptPath: writeGatedWorker(root),
      idleTimeoutMs: IDLE_TIMEOUT_MS,
      claimOnCallingThread: false
    });
    try {
      const background: IBackgroundOutputFolderDigests = pool.start(folderSets);
      jest.advanceTimersByTime(IDLE_TIMEOUT_MS);
      expect(terminate).not.toHaveBeenCalled();

      fs.writeFileSync(path.join(root, 'claim'), '');
      waitForFile(path.join(root, 'claimed'));
      jest.advanceTimersByTime(IDLE_TIMEOUT_MS);
      expect(terminate).not.toHaveBeenCalled();

      fs.writeFileSync(path.join(root, 'publish'), '');
      waitForFile(path.join(root, 'published'));
      jest.advanceTimersByTime(IDLE_TIMEOUT_MS);
      expect(terminate).toHaveBeenCalledTimes(1);

      expect(background.finish()).toEqual(digestOnCallingThread(folderSets));
      expect(pool.stalled).toBe(false);
    } finally {
      pool.dispose();
    }
  });

  it('does not keep workers for a cancelled job', () => {
    const pool: OutputFolderDigestPool = new OutputFolderDigestPool({
      threadCount: 1,
      workerScriptPath: writeGatedWorker(root),
      idleTimeoutMs: IDLE_TIMEOUT_MS,
      claimOnCallingThread: false
    });
    try {
      const background: IBackgroundOutputFolderDigests = pool.start(folderSets);
      background.cancel();
      jest.advanceTimersByTime(IDLE_TIMEOUT_MS);
      expect(terminate).toHaveBeenCalledTimes(1);
      expect([...background.finish()]).toEqual([undefined, undefined, undefined]);
      expect(pool.stalled).toBe(false);
    } finally {
      pool.dispose();
    }
  });

  it('stops the pool if new workers cannot start', () => {
    const pool: OutputFolderDigestPool = new OutputFolderDigestPool({
      threadCount: THREAD_COUNT,
      idleTimeoutMs: IDLE_TIMEOUT_MS,
      claimOnCallingThread: false
    });
    try {
      jest.advanceTimersByTime(IDLE_TIMEOUT_MS);
      expect(terminate).toHaveBeenCalledTimes(THREAD_COUNT);

      workerMock
        .mockImplementationOnce(
          (...args: ConstructorParameters<typeof Worker>) => new actualWorkerThreads.Worker(...args)
        )
        .mockImplementationOnce(() => {
          throw new Error('No more threads');
        });
      expect([...pool.start(folderSets).finish()]).toEqual([undefined, undefined, undefined]);
      expect(pool.stalled).toBe(true);
      expect(workerMock).toHaveBeenCalledTimes(2 * THREAD_COUNT);
      // The worker that did start stopped with the pool.
      expect(terminate).toHaveBeenCalledTimes(THREAD_COUNT + 1);

      expect(pool.digest(folderSets)).toEqual(digestOnCallingThread(folderSets));
      expect(workerMock).toHaveBeenCalledTimes(2 * THREAD_COUNT);
    } finally {
      pool.dispose();
    }
  });
});

describe(OutputFolderDigester.name, () => {
  it("passes the idle timeout to its pool, which stays parallel after the pool's workers stop", () => {
    const digester: OutputFolderDigester = new OutputFolderDigester({
      threadCount: THREAD_COUNT,
      poolStartThresholdMs: -1,
      idleTimeoutMs: IDLE_TIMEOUT_MS
    });
    try {
      digester.recordCallingThreadDigests(2, 0);
      expect(digester.isParallel).toBe(true);
      jest.advanceTimersByTime(IDLE_TIMEOUT_MS);
      expect(terminate).toHaveBeenCalledTimes(THREAD_COUNT);
      expect(digester.isParallel).toBe(true);

      const background: IBackgroundOutputFolderDigests | undefined = digester.start(folderSets);
      expect(background).toBeDefined();
      expect(workerMock).toHaveBeenCalledTimes(2 * THREAD_COUNT);
      background?.cancel();
      expect(digester.digest(folderSets)).toEqual(digestOnCallingThread(folderSets));
    } finally {
      digester.dispose();
    }
    expect(terminate).toHaveBeenCalledTimes(2 * THREAD_COUNT);
  });
});
