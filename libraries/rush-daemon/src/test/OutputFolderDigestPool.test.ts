// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { digestOutputFolders, type IOutputFolderDigest, type IOutputFolderSet } from '../OutputFolderDigest';
import {
  OutputFolderDigestPool,
  OutputFolderDigester,
  WORKER_MAX_YOUNG_GENERATION_SIZE_MB,
  type IBackgroundOutputFolderDigests
} from '../OutputFolderDigestPool';

const PROJECT_COUNT: number = 12;

function createProjects(root: string): IOutputFolderSet[] {
  const folderSets: IOutputFolderSet[] = [];
  for (let projectIndex: number = 0; projectIndex < PROJECT_COUNT; projectIndex++) {
    const projectFolder: string = path.join(root, `project-${projectIndex}`);
    for (let fileIndex: number = 0; fileIndex <= projectIndex; fileIndex++) {
      const folderPath: string = path.join(projectFolder, 'lib', `folder-${fileIndex % 3}`, 'nested');
      fs.mkdirSync(folderPath, { recursive: true });
      fs.writeFileSync(path.join(folderPath, `file-${fileIndex}.js`), `// ${projectIndex}:${fileIndex}\n`);
    }
    fs.mkdirSync(path.join(projectFolder, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(projectFolder, 'dist', 'bundle.js'), 'bundle\n');
    fs.symlinkSync('bundle.js', path.join(projectFolder, 'dist', 'link.js'));
    fs.writeFileSync(path.join(projectFolder, 'lib.d.ts'), 'export {};\n');
    folderSets.push({ projectFolder, folderNames: ['lib', 'dist', 'lib.d.ts', 'missing'] });
  }
  return folderSets;
}

function digestOnCallingThread(folderSets: ReadonlyArray<IOutputFolderSet>): IOutputFolderDigest[] {
  return folderSets.map((folderSet: IOutputFolderSet) => digestOutputFolders(folderSet));
}

interface ITestWorkerOptions {
  /** How long the worker waits before it claims the folder sets of a job. */
  readonly claimDelayMs?: number;
  /** Written once the worker has claimed every folder set of a job. */
  readonly claimedMarkerPath?: string;
  /** How long the worker waits after it claimed the folder sets of a job, before it digests them. */
  readonly digestDelayMs?: number;
  /** Whether the worker publishes digests at all. */
  readonly publish?: boolean;
}

/** Writes a worker script that claims every folder set of a job at once, and digests them afterwards. */
function writeTestWorker(
  scriptPath: string,
  { claimDelayMs = 0, claimedMarkerPath, digestDelayMs = 0, publish = true }: ITestWorkerOptions
): string {
  fs.writeFileSync(
    scriptPath,
    [
      "const fs = require('node:fs');",
      "const { parentPort, workerData } = require('node:worker_threads');",
      `const { digestOutputFolders } = require(${JSON.stringify(require.resolve('../OutputFolderDigest'))});`,
      'const delay = new Int32Array(new SharedArrayBuffer(4));',
      'parentPort.on("message", ({ jobId, folderSets, state }) => {',
      `  Atomics.wait(delay, 0, 0, ${claimDelayMs});`,
      '  const claimed = [];',
      '  for (let index = Atomics.add(state, 0, 1); index < folderSets.length; index = Atomics.add(state, 0, 1)) {',
      '    claimed.push(index);',
      '  }',
      claimedMarkerPath ? `  fs.writeFileSync(${JSON.stringify(claimedMarkerPath)}, '');` : '',
      `  Atomics.wait(delay, 0, 0, ${digestDelayMs});`,
      publish ? '' : '  return;',
      '  for (const index of claimed) {',
      '    workerData.resultPort.postMessage([jobId, index, digestOutputFolders(folderSets[index])]);',
      '  }',
      '  Atomics.add(state, 1, claimed.length);',
      '  Atomics.notify(state, 1);',
      '});'
    ].join('\n')
  );
  return scriptPath;
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

function withoutDigests(count: number): undefined[] {
  return new Array(count).fill(undefined);
}

describe(OutputFolderDigestPool.name, () => {
  let root: string;
  let folderSets: IOutputFolderSet[];

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-output-digest-'));
    folderSets = createProjects(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('returns the digests of the calling thread when only workers claim folder sets', () => {
    const pool: OutputFolderDigestPool = new OutputFolderDigestPool({
      threadCount: 3,
      claimOnCallingThread: false
    });
    try {
      const expected: IOutputFolderDigest[] = digestOnCallingThread(folderSets);
      expect(new Set(expected.map(({ digest }: IOutputFolderDigest) => digest)).size).toBe(PROJECT_COUNT);
      expect(expected[PROJECT_COUNT - 1].entryCount).toBeGreaterThan(expected[0].entryCount);
      expect(pool.digest(folderSets)).toEqual(expected);

      // Same size and identity, later modification time, nested three levels down.
      const editedFile: string = path.join(folderSets[5].projectFolder, 'lib', 'folder-2', 'nested', 'file-2.js');
      const { size, ino, mtimeMs } = fs.statSync(editedFile);
      fs.writeFileSync(editedFile, '// 5:X\n');
      fs.utimesSync(editedFile, new Date(), new Date(mtimeMs + 5000));
      expect(fs.statSync(editedFile)).toMatchObject({ size, ino });

      const edited: IOutputFolderDigest[] = pool.digest(folderSets);
      expect(edited).toEqual(digestOnCallingThread(folderSets));
      expect(
        edited.flatMap(({ digest }: IOutputFolderDigest, index: number) =>
          digest === expected[index].digest ? [] : [index]
        )
      ).toEqual([5]);
      expect(pool.stalled).toBe(false);
    } finally {
      pool.dispose();
    }
  });

  it('shares folder sets between the calling thread and the workers', () => {
    const pool: OutputFolderDigestPool = new OutputFolderDigestPool({ threadCount: 2 });
    try {
      for (let attempt: number = 0; attempt < 3; attempt++) {
        expect(pool.digest(folderSets)).toEqual(digestOnCallingThread(folderSets));
      }
      expect(pool.digest([])).toEqual([]);
      expect(pool.digest(folderSets.slice(0, 1))).toEqual(digestOnCallingThread(folderSets.slice(0, 1)));
    } finally {
      pool.dispose();
    }
  });

  it("uses the results that workers publish for the caller's job only", () => {
    // Publishes marked digests late, then digests with the same indexes for an earlier job.
    const markingWorkerPath: string = path.join(root, 'marking-worker.js');
    fs.writeFileSync(
      markingWorkerPath,
      [
        "const { parentPort, workerData } = require('node:worker_threads');",
        `const { digestOutputFolders } = require(${JSON.stringify(require.resolve('../OutputFolderDigest'))});`,
        'const delay = new Int32Array(new SharedArrayBuffer(4));',
        'parentPort.on("message", ({ jobId, folderSets, state }) => {',
        '  Atomics.wait(delay, 0, 0, 100);',
        '  const claimed = [];',
        '  for (let index = Atomics.add(state, 0, 1); index < folderSets.length; index = Atomics.add(state, 0, 1)) {',
        '    const { digest, entryCount } = digestOutputFolders(folderSets[index]);',
        '    workerData.resultPort.postMessage([jobId, index, { digest: `worker:${digest}`, entryCount }]);',
        '    claimed.push(index);',
        '  }',
        '  for (const index of claimed) {',
        "    workerData.resultPort.postMessage([jobId - 1, index, { digest: 'earlier job', entryCount: 0 }]);",
        '  }',
        '  Atomics.add(state, 1, claimed.length);',
        '  Atomics.notify(state, 1);',
        '});'
      ].join('\n')
    );
    const pool: OutputFolderDigestPool = new OutputFolderDigestPool({
      threadCount: 2,
      workerScriptPath: markingWorkerPath,
      claimOnCallingThread: false
    });
    try {
      expect(pool.digest(folderSets)).toEqual(
        digestOnCallingThread(folderSets).map(({ digest, entryCount }: IOutputFolderDigest) => ({
          digest: `worker:${digest}`,
          entryCount
        }))
      );
      expect(pool.stalled).toBe(false);
    } finally {
      pool.dispose();
    }
  });

  it('digests folder sets that stalled workers claimed on the calling thread', () => {
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
    const pool: OutputFolderDigestPool = new OutputFolderDigestPool({
      threadCount: 1,
      workerScriptPath: stalledWorkerPath,
      stallTimeoutMs: 200,
      claimOnCallingThread: false
    });
    try {
      expect(pool.digest(folderSets)).toEqual(digestOnCallingThread(folderSets));
      expect(pool.stalled).toBe(true);
      // Later digests don't wait for the workers again.
      const startTimeMs: number = performance.now();
      expect(pool.digest(folderSets)).toEqual(digestOnCallingThread(folderSets));
      expect(performance.now() - startTimeMs).toBeLessThan(200);
    } finally {
      pool.dispose();
    }
  });

  describe('start', () => {
    it('digests folder sets on the workers while the caller runs other jobs', () => {
      const pool: OutputFolderDigestPool = new OutputFolderDigestPool({
        threadCount: 2,
        claimOnCallingThread: false
      });
      try {
        const background: IBackgroundOutputFolderDigests = pool.start(folderSets);
        // Each worker serves jobs in order, so this job ends only after every earlier folder set was claimed,
        // and it reads the digests that the workers published for the earlier job too.
        expect(pool.digest(folderSets.slice(0, 2))).toEqual(digestOnCallingThread(folderSets.slice(0, 2)));
        const digests: ReadonlyArray<IOutputFolderDigest | undefined> = background.finish();
        expect(digests).toEqual(digestOnCallingThread(folderSets));
        expect(background.finish()).toBe(digests);
        expect(pool.stalled).toBe(false);
      } finally {
        pool.dispose();
      }
    });

    it('has no digests for folder sets that no worker claimed', () => {
      const pool: OutputFolderDigestPool = new OutputFolderDigestPool({
        threadCount: 1,
        workerScriptPath: writeTestWorker(path.join(root, 'late-worker.js'), { claimDelayMs: 2000 }),
        claimOnCallingThread: false
      });
      try {
        const startTimeMs: number = performance.now();
        expect([...pool.start(folderSets).finish()]).toEqual(withoutDigests(PROJECT_COUNT));
        expect(performance.now() - startTimeMs).toBeLessThan(1000);
        expect(pool.stalled).toBe(false);
      } finally {
        pool.dispose();
      }
    });

    it('waits for the folder sets that workers claimed', () => {
      const claimedMarkerPath: string = path.join(root, 'claimed');
      const pool: OutputFolderDigestPool = new OutputFolderDigestPool({
        threadCount: 1,
        workerScriptPath: writeTestWorker(path.join(root, 'slow-worker.js'), {
          claimedMarkerPath,
          digestDelayMs: 300
        }),
        claimOnCallingThread: false
      });
      try {
        const background: IBackgroundOutputFolderDigests = pool.start(folderSets);
        waitForFile(claimedMarkerPath);
        expect(background.finish()).toEqual(digestOnCallingThread(folderSets));
        expect(pool.stalled).toBe(false);
      } finally {
        pool.dispose();
      }
    });

    it('drops the digests of a cancelled job', () => {
      const claimedMarkerPath: string = path.join(root, 'claimed');
      const pool: OutputFolderDigestPool = new OutputFolderDigestPool({
        threadCount: 1,
        workerScriptPath: writeTestWorker(path.join(root, 'slow-worker.js'), {
          claimedMarkerPath,
          digestDelayMs: 1000
        }),
        claimOnCallingThread: false
      });
      try {
        const background: IBackgroundOutputFolderDigests = pool.start(folderSets);
        waitForFile(claimedMarkerPath);
        background.cancel();
        const startTimeMs: number = performance.now();
        expect([...background.finish()]).toEqual(withoutDigests(PROJECT_COUNT));
        expect(performance.now() - startTimeMs).toBeLessThan(500);

        // The worker publishes the cancelled digests before it serves this job, which reads and drops them.
        expect(pool.digest(folderSets.slice(0, 2))).toEqual(digestOnCallingThread(folderSets.slice(0, 2)));
        expect([...background.finish()]).toEqual(withoutDigests(PROJECT_COUNT));
        expect(pool.stalled).toBe(false);
      } finally {
        pool.dispose();
      }
    });

    it('stops the pool if the workers stall', () => {
      const claimedMarkerPath: string = path.join(root, 'claimed');
      const pool: OutputFolderDigestPool = new OutputFolderDigestPool({
        threadCount: 1,
        workerScriptPath: writeTestWorker(path.join(root, 'stalled-worker.js'), {
          claimedMarkerPath,
          publish: false
        }),
        stallTimeoutMs: 200,
        claimOnCallingThread: false
      });
      try {
        const background: IBackgroundOutputFolderDigests = pool.start(folderSets);
        waitForFile(claimedMarkerPath);
        const dispose: jest.SpyInstance = jest.spyOn(pool, 'dispose');
        expect([...background.finish()]).toEqual(withoutDigests(PROJECT_COUNT));
        expect(pool.stalled).toBe(true);
        expect(dispose).toHaveBeenCalled();

        const startTimeMs: number = performance.now();
        expect([...pool.start(folderSets).finish()]).toEqual(withoutDigests(PROJECT_COUNT));
        expect(pool.digest(folderSets)).toEqual(digestOnCallingThread(folderSets));
        expect(performance.now() - startTimeMs).toBeLessThan(200);
      } finally {
        pool.dispose();
      }
    });

    it('does not wait for a job that started before the pool stalled', () => {
      const pool: OutputFolderDigestPool = new OutputFolderDigestPool({
        threadCount: 1,
        workerScriptPath: writeTestWorker(path.join(root, 'stalled-worker.js'), { publish: false }),
        stallTimeoutMs: 200,
        claimOnCallingThread: false
      });
      try {
        const background: IBackgroundOutputFolderDigests = pool.start(folderSets);
        // The worker claims the folder sets of both jobs and publishes nothing.
        expect(pool.digest(folderSets)).toEqual(digestOnCallingThread(folderSets));
        expect(pool.stalled).toBe(true);
        const startTimeMs: number = performance.now();
        expect([...background.finish()]).toEqual(withoutDigests(PROJECT_COUNT));
        expect(performance.now() - startTimeMs).toBeLessThan(100);
      } finally {
        pool.dispose();
      }
    });

    it('has nothing to digest without folder sets or after the pool was disposed', () => {
      const pool: OutputFolderDigestPool = new OutputFolderDigestPool({ threadCount: 1 });
      try {
        expect(pool.start([]).finish()).toEqual([]);
      } finally {
        pool.dispose();
      }
      const background: IBackgroundOutputFolderDigests = pool.start(folderSets);
      expect([...background.finish()]).toEqual(withoutDigests(PROJECT_COUNT));
      background.cancel();
    });
  });

  it('limits the young generation of each worker', () => {
    // Publishes the worker's own young generation limit as the digest of every folder set it claims.
    const limitsWorkerPath: string = path.join(root, 'limits-worker.js');
    fs.writeFileSync(
      limitsWorkerPath,
      [
        "const { parentPort, resourceLimits, workerData } = require('node:worker_threads');",
        'parentPort.on("message", ({ jobId, folderSets, state }) => {',
        '  let count = 0;',
        '  for (let index = Atomics.add(state, 0, 1); index < folderSets.length; index = Atomics.add(state, 0, 1)) {',
        '    const digest = `young:${resourceLimits.maxYoungGenerationSizeMb}`;',
        '    workerData.resultPort.postMessage([jobId, index, { digest, entryCount: 0 }]);',
        '    count++;',
        '  }',
        '  Atomics.add(state, 1, count);',
        '  Atomics.notify(state, 1);',
        '});'
      ].join('\n')
    );
    const pool: OutputFolderDigestPool = new OutputFolderDigestPool({
      threadCount: 2,
      workerScriptPath: limitsWorkerPath,
      claimOnCallingThread: false
    });
    try {
      expect(new Set(pool.digest(folderSets).map(({ digest }: IOutputFolderDigest) => digest))).toEqual(
        new Set([`young:${WORKER_MAX_YOUNG_GENERATION_SIZE_MB}`])
      );
      expect(pool.stalled).toBe(false);
    } finally {
      pool.dispose();
    }
  });
});

describe(OutputFolderDigester.name, () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-output-digester-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('starts a pool only after a digest on the calling thread takes longer than the threshold', () => {
    const folderSets: IOutputFolderSet[] = createProjects(root);
    const serial: OutputFolderDigester = new OutputFolderDigester({ threadCount: 2 });
    expect(serial.digest(folderSets)).toEqual(digestOnCallingThread(folderSets));
    expect(serial.isParallel).toBe(false);

    const parallel: OutputFolderDigester = new OutputFolderDigester({ threadCount: 2, poolStartThresholdMs: -1 });
    try {
      expect(parallel.digest(folderSets.slice(0, 1))).toEqual(digestOnCallingThread(folderSets.slice(0, 1)));
      expect(parallel.isParallel).toBe(false);
      expect(parallel.digest(folderSets)).toEqual(digestOnCallingThread(folderSets));
      expect(parallel.isParallel).toBe(true);
      expect(parallel.digest(folderSets)).toEqual(digestOnCallingThread(folderSets));
    } finally {
      parallel.dispose();
    }
    expect(parallel.isParallel).toBe(false);
    expect(parallel.digest(folderSets)).toEqual(digestOnCallingThread(folderSets));

    const disabled: OutputFolderDigester = new OutputFolderDigester({ threadCount: 0, poolStartThresholdMs: -1 });
    expect(disabled.digest(folderSets)).toEqual(digestOnCallingThread(folderSets));
    expect(disabled.isParallel).toBe(false);
  });

  it('starts background digests only while its pool runs', () => {
    const folderSets: IOutputFolderSet[] = createProjects(root);
    const digester: OutputFolderDigester = new OutputFolderDigester({
      threadCount: 2,
      poolStartThresholdMs: -1
    });
    try {
      expect(digester.start(folderSets)).toBeUndefined();
      digester.digest(folderSets);
      expect(digester.isParallel).toBe(true);
      const background: IBackgroundOutputFolderDigests | undefined = digester.start(folderSets);
      expect(background).toBeDefined();
      const expected: IOutputFolderDigest[] = digestOnCallingThread(folderSets);
      // Folder sets that no worker claimed yet have no digest.
      (background?.finish() ?? []).forEach((digest: IOutputFolderDigest | undefined, index: number) => {
        expect(digest).toEqual(digest && expected[index]);
      });
    } finally {
      digester.dispose();
    }
    expect(digester.start(folderSets)).toBeUndefined();
  });

  it('does not keep the process alive', () => {
    const folderSets: IOutputFolderSet[] = createProjects(root);
    const script: string = [
      `const { OutputFolderDigester } = require(${JSON.stringify(require.resolve('../OutputFolderDigestPool'))});`,
      'const folderSets = JSON.parse(process.argv[1]);',
      'const digester = new OutputFolderDigester({ threadCount: 2, poolStartThresholdMs: -1 });',
      'digester.digest(folderSets);',
      'const digests = digester.digest(folderSets);',
      'process.stdout.write(JSON.stringify({ isParallel: digester.isParallel, digests }));'
    ].join('\n');
    const result: SpawnSyncReturns<string> = spawnSync(
      process.execPath,
      ['-e', script, JSON.stringify(folderSets)],
      { encoding: 'utf8', timeout: 10000 }
    );
    expect(result).toMatchObject({ status: 0, signal: null, stderr: '' });
    expect(JSON.parse(result.stdout)).toEqual({
      isParallel: true,
      digests: digestOnCallingThread(folderSets)
    });
  }, 20000);
});
