// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'node:os';
import * as path from 'node:path';
import { MessageChannel, receiveMessageOnPort, Worker, type MessagePort } from 'node:worker_threads';

import { digestOutputFolders, type IOutputFolderDigest, type IOutputFolderSet } from './OutputFolderDigest';

/** Slot of a job's shared state that holds the index of the next folder set to claim. */
const NEXT_INDEX_SLOT: number = 0;
/** Slot of a job's shared state that counts the folder sets whose digest was published. */
const COMPLETED_COUNT_SLOT: number = 1;
const JOB_STATE_SLOT_COUNT: number = 2;

/** How often a waiting caller checks whether the workers still make progress. */
const WAIT_SLICE_MS: number = 1000;
/**
 * Every thread publishes a digest every few milliseconds, so this long without any progress means a worker
 * died after claiming a folder set. Stopping the pool then only costs speed.
 */
const DEFAULT_STALL_TIMEOUT_MS: number = 10000;

/** A digest on the calling thread that takes longer than this starts a pool for later digests. */
const POOL_START_THRESHOLD_MS: number = 50;
const MAX_POOL_THREAD_COUNT: number = 7;
/**
 * A walk allocates only short-lived objects. With the default young generation, each worker's heap keeps
 * growing over repeated digests (by about 150 MB per worker at repo scale), while this size keeps the same
 * speed.
 */
export const WORKER_MAX_YOUNG_GENERATION_SIZE_MB: number = 4;

interface IOutputFolderDigestJob {
  readonly jobId: number;
  readonly folderSets: ReadonlyArray<IOutputFolderSet>;
  readonly state: Int32Array;
}

/** `[jobId, index, digest]` */
type OutputFolderDigestResult = readonly [number, number, IOutputFolderDigest];

/** The `workerData` of a pool worker. */
export interface IOutputFolderDigestWorkerData {
  readonly resultPort: MessagePort;
}

/** Options for {@link OutputFolderDigestPool}. */
export interface IOutputFolderDigestPoolOptions {
  readonly threadCount: number;
  /** Defaults to the compiled `OutputFolderDigestWorker.js` next to this module. */
  readonly workerScriptPath?: string;
  /**
   * How long a caller waits for claimed folder sets without progress before it digests them itself and
   * stops the pool. Defaults to 10 seconds.
   */
  readonly stallTimeoutMs?: number;
  /** Whether the calling thread claims folder sets too, rather than only waiting. Defaults to `true`. */
  readonly claimOnCallingThread?: boolean;
}

/** Options for {@link OutputFolderDigester}. */
export interface IOutputFolderDigesterOptions {
  /** Defaults to one less than the available parallelism, at most 7. Zero never starts a pool. */
  readonly threadCount?: number;
  /** A digest on the calling thread that takes longer than this starts the pool. Defaults to 50 ms. */
  readonly poolStartThresholdMs?: number;
}

interface IPoolThread {
  readonly worker: Worker;
  readonly resultPort: MessagePort;
}

/** Serves the jobs of an {@link OutputFolderDigestPool}; runs in each pool worker. */
export function serveOutputFolderDigestJobs(jobPort: MessagePort, resultPort: MessagePort): void {
  jobPort.on('message', ({ jobId, folderSets, state }: IOutputFolderDigestJob) => {
    claimAndDigest(folderSets, state, (index: number, digest: IOutputFolderDigest) => {
      const result: OutputFolderDigestResult = [jobId, index, digest];
      resultPort.postMessage(result);
    });
  });
}

/**
 * Digests output folder sets on the calling thread and a set of worker threads together.
 *
 * @remarks
 * `digest` is synchronous, so it can run inside the synchronous `configureIteration` hook. The calling thread
 * claims folder sets the same way the workers do, then blocks in `Atomics.wait` until the folder sets that
 * workers claimed are published, and reads them with `receiveMessageOnPort`. A walk is dominated by `readdir`
 * and `lstat` system calls, so it shortens roughly in proportion to the number of threads. If the workers
 * never start or stop making progress, the calling thread digests what is left, so the results always equal
 * {@link digestOutputFolders}.
 */
export class OutputFolderDigestPool {
  readonly #threads: IPoolThread[] = [];
  readonly #stallTimeoutMs: number;
  readonly #claimOnCallingThread: boolean;
  #nextJobId: number = 0;
  #stalled: boolean = false;

  public constructor({
    threadCount,
    workerScriptPath = path.join(__dirname, 'OutputFolderDigestWorker.js'),
    stallTimeoutMs = DEFAULT_STALL_TIMEOUT_MS,
    claimOnCallingThread = true
  }: IOutputFolderDigestPoolOptions) {
    this.#stallTimeoutMs = stallTimeoutMs;
    this.#claimOnCallingThread = claimOnCallingThread;
    try {
      for (let threadIndex: number = 0; threadIndex < threadCount; threadIndex++) {
        const { port1, port2 } = new MessageChannel();
        const workerData: IOutputFolderDigestWorkerData = { resultPort: port2 };
        const worker: Worker = new Worker(workerScriptPath, {
          workerData,
          transferList: [port2],
          resourceLimits: { maxYoungGenerationSizeMb: WORKER_MAX_YOUNG_GENERATION_SIZE_MB }
        });
        // Workers never keep the daemon alive. A worker that fails leaves its claims to the caller.
        worker.unref();
        worker.on('error', () => undefined);
        this.#threads.push({ worker, resultPort: port1 });
      }
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  /**
   * Whether the pool no longer uses its workers, because they stopped making progress or the pool was
   * disposed. The calling thread then digests everything.
   */
  public get stalled(): boolean {
    return this.#stalled;
  }

  /** Returns the digest of each folder set, in order. */
  public digest(folderSets: ReadonlyArray<IOutputFolderSet>): IOutputFolderDigest[] {
    const results: (IOutputFolderDigest | undefined)[] = new Array(folderSets.length);
    const state: Int32Array = new Int32Array(
      new SharedArrayBuffer(JOB_STATE_SLOT_COUNT * Int32Array.BYTES_PER_ELEMENT)
    );
    const jobId: number = ++this.#nextJobId;
    const parallel: boolean = !this.#stalled && (folderSets.length > 1 || !this.#claimOnCallingThread);
    if (parallel) {
      const job: IOutputFolderDigestJob = { jobId, folderSets, state };
      for (const { worker } of this.#threads) {
        worker.postMessage(job);
      }
    }
    if (this.#claimOnCallingThread || !parallel) {
      claimAndDigest(folderSets, state, (index: number, digest: IOutputFolderDigest) => {
        results[index] = digest;
      });
    }
    if (parallel) {
      this.#waitForClaimedFolderSets(state, folderSets.length);
      this.#receiveResults(jobId, results);
    }
    if (this.#stalled) {
      this.dispose();
    }
    return folderSets.map(
      (folderSet: IOutputFolderSet, index: number) => results[index] ?? digestOutputFolders(folderSet)
    );
  }

  /** Stops the workers. Later digests run on the calling thread. */
  public dispose(): void {
    this.#stalled = true;
    for (const { worker, resultPort } of this.#threads.splice(0)) {
      resultPort.close();
      void worker.terminate();
    }
  }

  #waitForClaimedFolderSets(state: Int32Array, count: number): void {
    let completed: number = Atomics.load(state, COMPLETED_COUNT_SLOT);
    let progressTimeMs: number = performance.now();
    while (completed < count) {
      Atomics.wait(state, COMPLETED_COUNT_SLOT, completed, Math.min(WAIT_SLICE_MS, this.#stallTimeoutMs));
      const current: number = Atomics.load(state, COMPLETED_COUNT_SLOT);
      if (current !== completed) {
        completed = current;
        progressTimeMs = performance.now();
      } else if (performance.now() - progressTimeMs >= this.#stallTimeoutMs) {
        this.#stalled = true;
        return;
      }
    }
  }

  #receiveResults(jobId: number, results: (IOutputFolderDigest | undefined)[]): void {
    for (const { resultPort } of this.#threads) {
      for (
        let received: { message: unknown } | undefined = receiveMessageOnPort(resultPort);
        received !== undefined;
        received = receiveMessageOnPort(resultPort)
      ) {
        const [resultJobId, index, digest] = received.message as OutputFolderDigestResult;
        // Results of an earlier job that stalled are dropped.
        if (resultJobId === jobId) {
          results[index] = digest;
        }
      }
    }
  }
}

/**
 * Digests output folder sets on the calling thread until one call takes longer than a threshold, and through
 * an {@link OutputFolderDigestPool} after that, so a workspace with small outputs never starts threads.
 */
export class OutputFolderDigester {
  readonly #poolStartThresholdMs: number;
  #threadCount: number;
  #pool: OutputFolderDigestPool | undefined;

  public constructor({
    threadCount = getDefaultThreadCount(),
    poolStartThresholdMs = POOL_START_THRESHOLD_MS
  }: IOutputFolderDigesterOptions = {}) {
    this.#threadCount = threadCount;
    this.#poolStartThresholdMs = poolStartThresholdMs;
  }

  /** Whether later digests use worker threads. */
  public get isParallel(): boolean {
    return this.#pool !== undefined && !this.#pool.stalled;
  }

  /** Returns the digest of each folder set, in order. */
  public digest(folderSets: ReadonlyArray<IOutputFolderSet>): IOutputFolderDigest[] {
    if (this.#pool && !this.#pool.stalled) {
      return this.#pool.digest(folderSets);
    }
    const startTimeMs: number = performance.now();
    const digests: IOutputFolderDigest[] = folderSets.map((folderSet: IOutputFolderSet) =>
      digestOutputFolders(folderSet)
    );
    if (
      !this.#pool &&
      this.#threadCount > 0 &&
      folderSets.length > 1 &&
      performance.now() - startTimeMs > this.#poolStartThresholdMs
    ) {
      try {
        this.#pool = new OutputFolderDigestPool({ threadCount: this.#threadCount });
      } catch {
        this.#threadCount = 0;
      }
    }
    return digests;
  }

  /** Stops the pool, if one was started. Later digests run on the calling thread. */
  public dispose(): void {
    this.#threadCount = 0;
    this.#pool?.dispose();
  }
}

let sharedDigester: OutputFolderDigester | undefined;

/** The process-wide digester, so that every warm graph of the daemon shares one pool. */
export function getSharedOutputFolderDigester(): OutputFolderDigester {
  sharedDigester ??= new OutputFolderDigester();
  return sharedDigester;
}

/** Claims folder sets one at a time until none are left, and publishes each digest before counting it. */
function claimAndDigest(
  folderSets: ReadonlyArray<IOutputFolderSet>,
  state: Int32Array,
  publish: (index: number, digest: IOutputFolderDigest) => void
): void {
  for (
    let index: number = Atomics.add(state, NEXT_INDEX_SLOT, 1);
    index < folderSets.length;
    index = Atomics.add(state, NEXT_INDEX_SLOT, 1)
  ) {
    publish(index, digestOutputFolders(folderSets[index]));
    Atomics.add(state, COMPLETED_COUNT_SLOT, 1);
    Atomics.notify(state, COMPLETED_COUNT_SLOT);
  }
}

function getDefaultThreadCount(): number {
  const parallelism: number = os.availableParallelism?.() ?? os.cpus().length;
  return Math.max(0, Math.min(MAX_POOL_THREAD_COUNT, parallelism - 1));
}
