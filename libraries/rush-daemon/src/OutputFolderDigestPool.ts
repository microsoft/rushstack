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
/**
 * The workers stop after this long without a new job, so that an idle daemon does not keep their memory: about 11 MB
 * per worker once it starts, and more after repeated walks. Requests a few seconds apart keep the same workers. The
 * first job after an idle period starts new ones, and the calling thread walks while they start.
 */
const DEFAULT_IDLE_TIMEOUT_MS: number = 30000;

/**
 * Digests of several folder sets on the calling thread that take longer than this together start a pool for later
 * digests.
 */
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

/** A job whose digests are still wanted. */
interface IPendingJob {
  readonly results: (IOutputFolderDigest | undefined)[];
  readonly state: Int32Array;
  readonly folderSetCount: number;
}

/**
 * Folder sets that the workers of an {@link OutputFolderDigestPool} digest while the calling thread does other
 * work. Call `finish` or `cancel` once.
 */
export interface IBackgroundOutputFolderDigests {
  /**
   * Stops the workers from claiming more folder sets, waits for the ones they claimed, and returns their digests,
   * indexed like the folder sets. A folder set that no worker claimed has no digest.
   */
  finish(): ReadonlyArray<IOutputFolderDigest | undefined>;
  /** Stops the workers from claiming more folder sets, and drops the digests. */
  cancel(): void;
}

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
  /**
   * How long the workers stay after the last job was posted, before they stop to free their memory. They stay
   * longer while a job whose digests are still wanted has folder sets left to digest. The next job starts new
   * workers. Defaults to 30 seconds.
   */
  readonly idleTimeoutMs?: number;
  /** Whether the calling thread claims folder sets too, rather than only waiting. Defaults to `true`. */
  readonly claimOnCallingThread?: boolean;
}

/** Options for {@link OutputFolderDigester}. */
export interface IOutputFolderDigesterOptions {
  /** Defaults to one less than the available parallelism, at most 7. Zero never starts a pool. */
  readonly threadCount?: number;
  /**
   * Digests of several folder sets on the calling thread that take longer than this together start the pool (see
   * `recordCallingThreadDigests`). Defaults to 50 ms.
   */
  readonly poolStartThresholdMs?: number;
  /** How long the pool's workers stay without a new job; see {@link IOutputFolderDigestPoolOptions.idleTimeoutMs}. */
  readonly idleTimeoutMs?: number;
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
 *
 * `start` gives folder sets to the workers only, so that the calling thread can do other work while they are
 * walked, and collects the digests that are ready when it needs them.
 *
 * The workers stop once no job was posted for the idle timeout and every job whose digests are still wanted was
 * digested, so that an idle process does not keep their memory. The next job starts new ones.
 */
export class OutputFolderDigestPool {
  readonly #threads: IPoolThread[] = [];
  readonly #threadCount: number;
  readonly #workerScriptPath: string;
  readonly #stallTimeoutMs: number;
  readonly #idleTimeoutMs: number;
  readonly #claimOnCallingThread: boolean;
  /** Each job whose digests are still wanted, by job ID. */
  readonly #pendingJobsById: Map<number, IPendingJob> = new Map();
  #nextJobId: number = 0;
  #stalled: boolean = false;
  #idleTimer: NodeJS.Timeout | undefined;

  public constructor({
    threadCount,
    workerScriptPath = path.join(__dirname, 'OutputFolderDigestWorker.js'),
    stallTimeoutMs = DEFAULT_STALL_TIMEOUT_MS,
    idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
    claimOnCallingThread = true
  }: IOutputFolderDigestPoolOptions) {
    this.#threadCount = threadCount;
    this.#workerScriptPath = workerScriptPath;
    this.#stallTimeoutMs = stallTimeoutMs;
    this.#idleTimeoutMs = idleTimeoutMs;
    this.#claimOnCallingThread = claimOnCallingThread;
    try {
      this.#startThreads();
    } catch (error) {
      this.dispose();
      throw error;
    }
    this.#scheduleIdleStop();
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
    const state: Int32Array = createJobState();
    const parallel: boolean = !this.#stalled && (folderSets.length > 1 || !this.#claimOnCallingThread);
    const jobId: number | undefined = parallel ? this.#postJob(folderSets, state, results) : undefined;
    if (this.#claimOnCallingThread || !parallel) {
      claimAndDigest(folderSets, state, (index: number, digest: IOutputFolderDigest) => {
        results[index] = digest;
      });
    }
    if (jobId !== undefined) {
      this.#waitForClaimedFolderSets(state, folderSets.length);
      this.#receiveResults();
      this.#pendingJobsById.delete(jobId);
    }
    if (this.#stalled) {
      this.dispose();
    }
    return folderSets.map(
      (folderSet: IOutputFolderSet, index: number) => results[index] ?? digestOutputFolders(folderSet)
    );
  }

  /**
   * Starts digesting the folder sets on the workers only, so that the calling thread can do other work meanwhile.
   * Each digest equals that of {@link digestOutputFolders} at the time its walk ran.
   */
  public start(folderSets: ReadonlyArray<IOutputFolderSet>): IBackgroundOutputFolderDigests {
    const results: (IOutputFolderDigest | undefined)[] = new Array(folderSets.length);
    const state: Int32Array = createJobState();
    const jobId: number | undefined =
      this.#stalled || folderSets.length === 0 ? undefined : this.#postJob(folderSets, state, results);
    if (jobId === undefined) {
      return { finish: () => results, cancel: () => undefined };
    }
    let settled: boolean = false;
    /** Returns the number of folder sets that workers claimed. */
    const stopClaims = (): number => {
      settled = true;
      return Math.min(Atomics.exchange(state, NEXT_INDEX_SLOT, folderSets.length), folderSets.length);
    };
    return {
      finish: (): ReadonlyArray<IOutputFolderDigest | undefined> => {
        if (!settled) {
          const claimedCount: number = stopClaims();
          if (!this.#stalled) {
            this.#waitForClaimedFolderSets(state, claimedCount);
            this.#receiveResults();
          }
          this.#pendingJobsById.delete(jobId);
          if (this.#stalled) {
            this.dispose();
          }
        }
        return results;
      },
      cancel: (): void => {
        if (!settled) {
          stopClaims();
          this.#pendingJobsById.delete(jobId);
        }
      }
    };
  }

  /** Stops the workers. Later digests run on the calling thread. */
  public dispose(): void {
    this.#stalled = true;
    clearTimeout(this.#idleTimer);
    this.#idleTimer = undefined;
    this.#stopThreads();
  }

  #startThreads(): void {
    for (let threadIndex: number = 0; threadIndex < this.#threadCount; threadIndex++) {
      const { port1, port2 } = new MessageChannel();
      const workerData: IOutputFolderDigestWorkerData = { resultPort: port2 };
      const worker: Worker = new Worker(this.#workerScriptPath, {
        workerData,
        transferList: [port2],
        resourceLimits: { maxYoungGenerationSizeMb: WORKER_MAX_YOUNG_GENERATION_SIZE_MB }
      });
      // Workers never keep the daemon alive. A worker that fails leaves its claims to the caller.
      worker.unref();
      worker.on('error', () => undefined);
      this.#threads.push({ worker, resultPort: port1 });
    }
  }

  #stopThreads(): void {
    for (const { worker, resultPort } of this.#threads.splice(0)) {
      resultPort.close();
      void worker.terminate();
    }
  }

  /**
   * Posts a job to every worker, after starting new workers if the idle ones stopped. Returns undefined if they
   * could not start; the pool is then stalled, and the calling thread digests everything.
   */
  #postJob(
    folderSets: ReadonlyArray<IOutputFolderSet>,
    state: Int32Array,
    results: (IOutputFolderDigest | undefined)[]
  ): number | undefined {
    if (this.#threads.length === 0) {
      try {
        this.#startThreads();
      } catch {
        this.dispose();
        return undefined;
      }
    }
    const jobId: number = ++this.#nextJobId;
    this.#pendingJobsById.set(jobId, { results, state, folderSetCount: folderSets.length });
    const job: IOutputFolderDigestJob = { jobId, folderSets, state };
    for (const { worker } of this.#threads) {
      worker.postMessage(job);
    }
    this.#scheduleIdleStop();
    return jobId;
  }

  #scheduleIdleStop(): void {
    clearTimeout(this.#idleTimer);
    this.#idleTimer = setTimeout(() => this.#stopIdleThreads(), this.#idleTimeoutMs);
    // The timer never keeps the daemon alive either.
    this.#idleTimer.unref();
  }

  /**
   * Stops the workers unless a job whose digests are still wanted has folder sets whose digests they have yet to
   * publish, and keeps the digests that they published. Checks again after another idle timeout otherwise.
   */
  #stopIdleThreads(): void {
    this.#idleTimer = undefined;
    for (const { state, folderSetCount } of this.#pendingJobsById.values()) {
      if (Atomics.load(state, COMPLETED_COUNT_SLOT) < folderSetCount) {
        this.#scheduleIdleStop();
        return;
      }
    }
    this.#receiveResults();
    this.#stopThreads();
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

  /**
   * Reads every published result, and keeps those of jobs whose digests are still wanted. Results of a job that
   * finished, was cancelled or stalled are dropped.
   */
  #receiveResults(): void {
    for (const { resultPort } of this.#threads) {
      for (
        let received: { message: unknown } | undefined = receiveMessageOnPort(resultPort);
        received !== undefined;
        received = receiveMessageOnPort(resultPort)
      ) {
        const [jobId, index, digest] = received.message as OutputFolderDigestResult;
        const job: IPendingJob | undefined = this.#pendingJobsById.get(jobId);
        if (job) {
          job.results[index] = digest;
        }
      }
    }
  }
}

/**
 * Digests output folder sets on the calling thread until digests of several folder sets take longer than a threshold,
 * and through an {@link OutputFolderDigestPool} after that, so a workspace with small outputs never starts threads.
 */
export class OutputFolderDigester {
  readonly #poolStartThresholdMs: number;
  readonly #idleTimeoutMs: number | undefined;
  #threadCount: number;
  #pool: OutputFolderDigestPool | undefined;

  public constructor({
    threadCount = getDefaultThreadCount(),
    poolStartThresholdMs = POOL_START_THRESHOLD_MS,
    idleTimeoutMs
  }: IOutputFolderDigesterOptions = {}) {
    this.#threadCount = threadCount;
    this.#poolStartThresholdMs = poolStartThresholdMs;
    this.#idleTimeoutMs = idleTimeoutMs;
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
    this.recordCallingThreadDigests(folderSets.length, performance.now() - startTimeMs);
    return digests;
  }

  /**
   * Starts the pool for later digests if digests of several folder sets on the calling thread took longer than the
   * threshold together, including a caller's digests of one folder set at a time.
   */
  public recordCallingThreadDigests(folderSetCount: number, durationMs: number): void {
    if (
      !this.#pool &&
      this.#threadCount > 0 &&
      folderSetCount > 1 &&
      durationMs > this.#poolStartThresholdMs
    ) {
      try {
        this.#pool = new OutputFolderDigestPool({
          threadCount: this.#threadCount,
          idleTimeoutMs: this.#idleTimeoutMs
        });
      } catch {
        this.#threadCount = 0;
      }
    }
  }

  /**
   * Starts digesting the folder sets on the pool's workers, so that the calling thread can do other work meanwhile.
   * Returns undefined if no pool is running; see {@link OutputFolderDigestPool.start}.
   */
  public start(folderSets: ReadonlyArray<IOutputFolderSet>): IBackgroundOutputFolderDigests | undefined {
    return this.#pool && !this.#pool.stalled ? this.#pool.start(folderSets) : undefined;
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

function createJobState(): Int32Array {
  return new Int32Array(new SharedArrayBuffer(JOB_STATE_SLOT_COUNT * Int32Array.BYTES_PER_ELEMENT));
}
