// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('node:os', () => ({ totalmem: () => 1000 }));

import { EventEmitter } from 'node:events';
import type { FifoQueue, WorkerPoolInterface } from 'jest-worker';

import { JestManagedWorkerQueue } from '../JestManagedWorkerQueue';

type WorkerHandle = ReturnType<WorkerPoolInterface['getWorkers']>[number];
type QueuedTask = Parameters<FifoQueue['enqueue']>[0];
type MockWorkerHandle = jest.Mocked<WorkerHandle> & EventEmitter & { state: WorkerHandle['state'] };

function createHandle(): MockWorkerHandle {
  return Object.assign(new EventEmitter(), {
    state: 'ok' as WorkerHandle['state'],
    send: jest.fn(),
    waitForExit: jest.fn(),
    forceExit: jest.fn(),
    getWorkerId: jest.fn(),
    getStderr: jest.fn(),
    getStdout: jest.fn(),
    getWorkerSystemId: jest.fn(),
    getMemoryUsage: jest.fn<Promise<number | null>, []>().mockResolvedValue(100),
    isWorkerRunning: jest.fn(),
    waitForWorkerReady: jest.fn()
  });
}

function setState(worker: ReturnType<typeof createHandle>, state: `${WorkerHandle['state']}`): void {
  worker.state = state as WorkerHandle['state'];
  worker.emit('state-change', worker.state);
}

function startTask(queue: JestManagedWorkerQueue, worker: WorkerHandle): QueuedTask {
  queue.enqueue({
    request: [1, false, 'run', []],
    onStart: jest.fn(),
    onEnd: jest.fn(),
    onCustomMessage: jest.fn()
  });
  const task: QueuedTask = queue.dequeue(0)!;
  task.onStart(worker);
  return task;
}

describe(JestManagedWorkerQueue.name, () => {
  let queue: JestManagedWorkerQueue;
  let worker: ReturnType<typeof createHandle>;

  beforeEach(() => {
    queue = new JestManagedWorkerQueue(undefined);
    worker = createHandle();
  });

  afterEach(() => {
    queue.beginShutdown();
    queue.dispose();
    expect(worker.listenerCount('state-change')).toBe(0);
  });

  it.each([
    [0.1, 100],
    [1, 1000],
    [100.9, 100]
  ])('normalizes limit %s and waits for replacement readiness only above %s bytes', async (limit, bytes) => {
    queue = new JestManagedWorkerQueue(limit);
    worker.getMemoryUsage.mockResolvedValueOnce(bytes);
    startTask(queue, worker).onEnd(null, 'first');
    await queue.waitForIdleAsync();
    expect(worker.getMemoryUsage).toHaveBeenCalledTimes(1);

    let acknowledgeReady!: (memory: number) => void;
    const ready: Promise<number> = new Promise((resolve) => {
      acknowledgeReady = resolve;
    });
    worker.getMemoryUsage.mockResolvedValueOnce(bytes + 1).mockReturnValueOnce(ready);
    startTask(queue, worker).onEnd(null, 'second');
    setState(worker, 'restarting');
    await Promise.resolve();
    setState(worker, 'starting');
    setState(worker, 'ok');
    let idle: boolean = false;
    const pending: Promise<void> = queue.waitForIdleAsync().then(() => {
      idle = true;
    });
    // Let the lifecycle and memory continuations run, but do not acknowledge the replacement.
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(worker.getMemoryUsage).toHaveBeenCalledTimes(3);
    expect(idle).toBe(false);
    acknowledgeReady(bytes);
    await pending;
    expect(worker.forceExit).not.toHaveBeenCalled();
  });

  it.each(['starting', 'restarting', 'oom', 'shutting-down', 'shut-down'] as const)(
    'retains unexpected %s failures and stops the owned worker',
    async (state) => {
      startTask(queue, worker);
      setState(worker, state);
      const error: Error = await queue.failure.catch((failure: Error) => failure);
      expect(error).toBeInstanceOf(Error);
      expect(() => queue.throwIfFailed()).toThrow(error);
      await expect(queue.waitForIdleAsync()).rejects.toBe(error);
      expect(worker.forceExit).toHaveBeenCalledTimes(
        state === 'shutting-down' || state === 'shut-down' ? 0 : 1
      );
      setState(worker, 'ok');
      expect(() => queue.throwIfFailed()).toThrow(error);
    }
  );

  it('observes an already stopped initial handle without waiting for another event', async () => {
    setState(worker, 'shut-down');
    startTask(queue, worker);
    await expect(queue.failure).rejects.toThrow('stopped unexpectedly (shut-down)');
  });

  it('stops both owned handles on unexpected handle replacement', async () => {
    startTask(queue, worker).onEnd(null, 'first');
    const replacement: ReturnType<typeof createHandle> = createHandle();
    startTask(queue, replacement);
    await expect(queue.failure).rejects.toThrow('handle was replaced unexpectedly');
    expect(worker.forceExit).toHaveBeenCalledTimes(1);
    expect(replacement.forceExit).toHaveBeenCalledTimes(1);
    queue.dispose();
    expect(replacement.listenerCount('state-change')).toBe(0);
  });

  it('fails and cleans up when idle memory is unavailable', async () => {
    queue = new JestManagedWorkerQueue(100);
    worker.getMemoryUsage.mockResolvedValue(null);
    startTask(queue, worker).onEnd(null, 'result');
    await expect(queue.waitForIdleAsync()).rejects.toThrow('did not report its idle memory');
    expect(worker.forceExit).toHaveBeenCalledTimes(1);
  });

  it.each(['restarting', 'oom', 'shut-down'] as const)(
    'does not hang or accept a final %s without memory evidence',
    async (state) => {
      queue = new JestManagedWorkerQueue(100);
      worker.getMemoryUsage.mockReturnValue(new Promise(() => {}));
      queue.markFinalTask();
      startTask(queue, worker).onEnd(null, 'result');
      setState(worker, state);
      await expect(queue.waitForIdleAsync()).rejects.toThrow(
        `stopped before reporting final memory usage (${state})`
      );
      expect(queue.replacedAfterFinalTask).toBe(false);
      expect(() => queue.throwIfFailed()).toThrow('stopped before reporting final memory');
    }
  );

  it.each([0, 100])('classifies final recycling at limit %s without waiting for readiness', async (limit) => {
    queue = new JestManagedWorkerQueue(limit);
    worker.getMemoryUsage.mockResolvedValue(101);
    queue.markFinalTask();
    const task: QueuedTask = startTask(queue, worker);
    if (limit === 0) setState(worker, 'restarting');
    task.onEnd(null, 'result');
    if (limit !== 0) setState(worker, 'restarting');
    await queue.waitForIdleAsync();
    expect(queue.replacedAfterFinalTask).toBe(true);
    expect(worker.getMemoryUsage).toHaveBeenCalledTimes(limit === 0 ? 0 : 1);
    queue.beginShutdown();
    setState(worker, 'shutting-down');
    setState(worker, 'shut-down');
    await queue.waitForIdleAsync();
    expect(worker.forceExit).not.toHaveBeenCalled();
  });

  it('does not classify a failed final task as a successful recycle', async () => {
    queue = new JestManagedWorkerQueue(100);
    queue.markFinalTask();
    const task: QueuedTask = startTask(queue, worker);
    const error: Error = new Error('task failed');
    task.onEnd(error, undefined);
    setState(worker, 'restarting');
    await expect(queue.failure).rejects.toThrow('restarted unexpectedly');
    expect(queue.replacedAfterFinalTask).toBe(false);
    expect(worker.getMemoryUsage).not.toHaveBeenCalled();
  });
});
