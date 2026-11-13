// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Worker, type JestWorkerFarm } from 'jest-worker';

import { JestManagedWorkerQueue } from '../JestManagedWorkerQueue';
import type * as fixture from './fixtures/managedWorker';

type FixtureWorker = JestWorkerFarm<typeof fixture>;
type WorkerIdentity = fixture.IWorkerIdentity;

const fixturePath: string = path.resolve(
  __dirname,
  '..',
  '..',
  'lib-commonjs',
  'test',
  'fixtures',
  'managedWorker.js'
);
const tempPath: string = path.resolve(__dirname, '..', '..', 'temp', 'managed-workers');

describe.each([false, true])('Jest managed worker lifecycle (threads=%s)', (enableWorkerThreads) => {
  let folder: string;
  let logPath: string;
  let worker: FixtureWorker | undefined;
  let queue: JestManagedWorkerQueue;

  beforeEach(async () => {
    await fs.mkdir(tempPath, { recursive: true });
    folder = await fs.mkdtemp(path.join(tempPath, 'worker-'));
    logPath = path.join(folder, 'events.log');
  });

  afterEach(async () => {
    try {
      if (worker) {
        await endAsync();
      }
    } finally {
      await fs.rm(folder, { recursive: true, force: true });
    }
  });

  function createWorker(idleMemoryLimit?: number, env?: NodeJS.ProcessEnv): FixtureWorker {
    queue = new JestManagedWorkerQueue(idleMemoryLimit);
    worker = new Worker(fixturePath, {
      numWorkers: 1,
      maxRetries: 0,
      idleMemoryLimit,
      enableWorkerThreads,
      taskQueue: queue,
      exposedMethods: ['run'],
      forkOptions: {
        serialization: 'json',
        // Preload before Jest's bootstrap to exercise initial-handle supervision and readiness.
        execArgv: ['--require', fixturePath],
        env: { ...process.env, MANAGED_WORKER_LOG: logPath, ...env }
      }
    }) as FixtureWorker;
    return worker;
  }

  async function endAsync(): Promise<Awaited<ReturnType<Worker['end']>>> {
    const active: FixtureWorker = worker!;
    worker = undefined;
    queue.beginShutdown();
    try {
      return await active.end();
    } finally {
      queue.dispose();
    }
  }

  async function finishAsync(): Promise<void> {
    queue.throwIfFailed();
    const result: Awaited<ReturnType<Worker['end']>> = await endAsync();
    expect(result.forceExited && !queue.replacedAfterFinalTask).toBe(false);
  }

  it.each([undefined, 1024, 0])(
    'reuses or recycles between tasks without replay (idleMemoryLimit=%s)',
    async (limit) => {
      const farm: FixtureWorker = createWorker(limit);
      const identities: WorkerIdentity[] = [];
      for (let index: number = 0; index < 3; index++) {
        if (index === 2) queue.markFinalTask();
        identities.push(await queue.waitForTaskAsync(farm.run(`task-${index}`)));
        await queue.waitForIdleAsync();
      }
      const recycles: boolean = limit === 1024 || (limit === 0 && !enableWorkerThreads);
      expect(new Set(identities.map(({ pid, threadId }) => `${pid}:${threadId}`)).size).toBe(
        recycles ? 3 : 1
      );
      expect(identities.every((identity) => identity.isMainThread === !enableWorkerThreads)).toBe(true);
      expect(queue.replacedAfterFinalTask).toBe(recycles);
      await finishAsync();
      const events: string = await fs.readFile(logPath, 'utf8');
      expect(events.split('\n').filter((line) => line.startsWith('run '))).toHaveLength(3);
    },
    30000
  );

  it('waits for a slow replacement bootstrap before another task or graceful shutdown', async () => {
    const farm: FixtureWorker = createWorker(1024, { MANAGED_WORKER_BOOT_DELAY: '1' });
    const first: WorkerIdentity = await queue.waitForTaskAsync(farm.run('first'));
    await queue.waitForIdleAsync();
    const beforeNext: string = await fs.readFile(logPath, 'utf8');
    expect(beforeNext.split('\n').filter((line) => line.startsWith('ready '))).toHaveLength(2);
    const second: WorkerIdentity = await queue.waitForTaskAsync(farm.run('second'));
    expect(second).not.toEqual(first);
    await queue.waitForIdleAsync();
    const beforeEnd: string = await fs.readFile(logPath, 'utf8');
    expect(beforeEnd.split('\n').filter((line) => line.startsWith('ready '))).toHaveLength(3);
    expect(beforeEnd.split('\n').filter((line) => line.startsWith('run '))).toHaveLength(2);
    // Deliberately do not mark a final task: readiness must make normal shutdown graceful.
    expect(queue.replacedAfterFinalTask).toBe(false);
    await finishAsync();
  }, 30000);

  it.each([0, 7])(
    'surfaces exit %s without replaying in-flight work',
    async (exitCode) => {
      const farm: FixtureWorker = createWorker();
      await expect(queue.waitForTaskAsync(farm.run('crash', exitCode))).rejects.toThrow();
      await expect(queue.waitForIdleAsync()).rejects.toThrow(
        /Managed Jest worker (stopped|restarted) unexpectedly/
      );
      expect(() => queue.throwIfFailed()).toThrow();
      expect(queue.replacedAfterFinalTask).toBe(false);
      await endAsync();
      const events: string = await fs.readFile(logPath, 'utf8');
      expect(events.split('\n').filter((line) => line.startsWith('run crash '))).toHaveLength(1);
    },
    30000
  );

  it.each([0, 7])(
    'supervises initial bootstrap exit %s before the first task starts',
    async (exitCode) => {
      const farm: FixtureWorker = createWorker(undefined, { MANAGED_WORKER_BOOT_EXIT: String(exitCode) });
      await expect(queue.waitForTaskAsync(farm.run('never-started'))).rejects.toThrow();
      await expect(queue.waitForIdleAsync()).rejects.toThrow(
        /Managed Jest worker (stopped|restarted) unexpectedly/
      );
      await endAsync();
      const events: string = await fs.readFile(logPath, 'utf8');
      expect(events).not.toContain('run ');
    },
    30000
  );
});
