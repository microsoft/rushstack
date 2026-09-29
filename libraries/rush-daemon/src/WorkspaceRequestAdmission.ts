// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  MAX_DAEMON_REQUEST_WAIT_TIMEOUT_MS,
  validateDaemonRequestAdmissionOptions
} from '@rushstack/rush-daemon-protocol';
import type {
  DaemonRequestAdmissionErrorCode,
  DaemonRestartReason,
  IDaemonNativeLockHolder,
  IDaemonRequestAdmissionOptions,
  IDaemonRequestQueuePositionMessage
} from '@rushstack/rush-daemon-protocol';
import {
  formatDaemonRestartCause,
  formatNativeLockHolder,
  type IDaemonRestartWaitDetails
} from '@rushstack/rush-client-core';

import {
  type IRequestLease,
  type IRequestSchedulerAcquireOptions,
  RequestExclusivityClass,
  RequestScheduler,
  RequestSchedulerError,
  RequestSchedulerErrorCode
} from './RequestScheduler';
import type { IWorkspaceSession } from './WorkspaceSession';
import { assertWorkspaceRequestResourcesHealthy } from './WorkspaceRequestResources';
import type {
  IWorkspaceRestartDrainOptions,
  IWorkspaceRestartRecheck,
  IWorkspaceRestartTicket,
  IWorkspaceRestartWaitReport,
  IWorkspaceRestartWaitResult,
  WorkspaceRestartArbiter
} from './WorkspaceRestartArbiter';

export interface IRequestAdmissionClient {
  readonly abortSignal: AbortSignal;
  readonly supportsRequestAdmission?: boolean;
  writeQueuePositionAsync?(message: IDaemonRequestQueuePositionMessage): Promise<void>;
}

export interface IRequestAdmissionControllerOptions {
  readonly admission: IDaemonRequestAdmissionOptions | undefined;
  readonly client: IRequestAdmissionClient;
  readonly requestId: string;
}

/**
 * A request's wait for native Rush's repository lock while another Rush process holds it; see
 * {@link RequestAdmissionController.beginNativeLockWait}.
 */
export interface INativeLockWait {
  /** How long to wait before trying the lock again: 250ms, or less when the wait timeout runs out sooner. */
  readonly retryDelayMs: number;
  /**
   * Records which process holds the lock, after the request failed to take it, and tells the client when that
   * process changed.
   *
   * @returns The error that ends the wait, if the request may not wait any longer.
   */
  update(holder: IDaemonNativeLockHolder): RequestSchedulerError | undefined;
  /**
   * Ends the wait: spends its time from the request's wait timeout, and waits until the client has been told about
   * it. Calling it again returns the same promise.
   */
  endAsync(): Promise<void>;
}

const REQUEST_SCHEDULER_BY_SESSION: WeakMap<IWorkspaceSession, RequestScheduler> = new WeakMap();

/** What a remaining admission budget does not show about the request that it came from. */
interface IAdmissionBudgetHistory {
  /** The wait timeout that the client asked for. */
  readonly waitTimeoutMs: number;
  /** Time spent behind another request's graph load or reload, which did not count against the wait timeout. */
  readonly pausedMs: number;
}

/**
 * The history of each remaining budget that a controller hands to another routing boundary, so that the boundary's
 * timeout message names the client's timeout and the time that did not count, rather than the remainder alone.
 */
const HISTORY_BY_REMAINING_ADMISSION: WeakMap<IDaemonRequestAdmissionOptions, IAdmissionBudgetHistory> =
  new WeakMap();
/** A request waits for another request's graph load or reload for up to this many times its wait timeout. */
const GRAPH_LOAD_WAIT_FACTOR: number = 10;
// Only the per-invocation flag is offered: Rush versions that do not recognize the environment variable reject it.
const WAIT_LONGER_HINT: string = 'Use --wait-timeout <seconds> to wait longer.';
/** Native Rush does not say when it releases the repository's lock, so a request that waits for it tries this often. */
const NATIVE_LOCK_RETRY_MS: number = 250;

function formatSeconds(ms: number): string {
  return `${Math.round(ms / 100) / 10}s`;
}

/**
 * Whether `found`, what can be found out now about the process that holds native Rush's repository lock, replaces
 * `known`, the process that the client was told about. A process that cannot be identified, for instance once the one
 * that was found exits, does not replace it. Nor does the same process without its command: a process's command can
 * no longer be read once it exits, yet it holds the lock until it is reaped.
 */
function replacesNativeLockHolder(known: IDaemonNativeLockHolder, found: IDaemonNativeLockHolder): boolean {
  if (found.pid === undefined) return known.pid === undefined;
  return found.pid !== known.pid || found.command !== undefined;
}

/** Describes time that did not count against a request's wait timeout, unless it rounds to nothing. */
function formatUncountedTime(pausedMs: number, spentWhile: string): string {
  const seconds: string = formatSeconds(pausedMs);
  return seconds === '0s' ? '' : `; ${seconds} spent ${spentWhile} did not count`;
}

/** Resolves after `delayMs`, or as soon as `abortSignal` aborts. */
function delayAsync(delayMs: number, abortSignal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve: () => void) => {
    const timer: ReturnType<typeof setTimeout> = setTimeout(finish, delayMs);
    abortSignal.addEventListener('abort', finish, { once: true });
    if (abortSignal.aborted) finish();

    function finish(): void {
      clearTimeout(timer);
      abortSignal.removeEventListener('abort', finish);
      resolve();
    }
  });
}

/** Returns a frozen copy of admission options that keeps the history of a remaining budget. */
export function freezeDaemonRequestAdmissionOptions(
  admission: IDaemonRequestAdmissionOptions
): IDaemonRequestAdmissionOptions {
  const copy: IDaemonRequestAdmissionOptions = Object.freeze({ ...admission });
  const history: IAdmissionBudgetHistory | undefined = HISTORY_BY_REMAINING_ADMISSION.get(admission);
  if (history) HISTORY_BY_REMAINING_ADMISSION.set(copy, history);
  return copy;
}

class WorkspaceRequestScheduler extends RequestScheduler {
  readonly #session: IWorkspaceSession;

  public constructor(session: IWorkspaceSession) {
    super();
    this.#session = session;
  }

  public override async acquireAsync(options: IRequestSchedulerAcquireOptions): Promise<IRequestLease> {
    assertWorkspaceRequestResourcesHealthy(this.#session);
    const lease: IRequestLease = await super.acquireAsync(options);
    try {
      assertWorkspaceRequestResourcesHealthy(this.#session);
      return lease;
    } catch (error) {
      lease.release();
      throw error;
    }
  }
}

/**
 * Admits the rushx scripts that a daemon runs, each with a shared lease that it holds until it exits, and tells a
 * request that waits for all of them to exit (see {@link RequestAdmissionController.waitForServedScriptsAsync}) how
 * many still run. Its leases can only be released: they cannot be downgraded or marked preemptible.
 */
export class ServedScriptScheduler extends RequestScheduler {
  readonly #listeners: Set<(runningCount: number) => void> = new Set();

  public override async acquireAsync(options: IRequestSchedulerAcquireOptions): Promise<IRequestLease> {
    const lease: IRequestLease = await super.acquireAsync(options);
    let released: boolean = false;
    return {
      get exclusivityClass(): RequestExclusivityClass {
        return lease.exclusivityClass;
      },
      release: (): void => {
        if (released) return;
        released = true;
        // Counted first: the release can admit the request that waits, which then holds a lease itself.
        const runningCount: number = this.activeRequestCount - 1;
        lease.release();
        if (runningCount > 0) {
          for (const listener of [...this.#listeners]) listener(runningCount);
        }
      }
    };
  }

  /**
   * Calls `listener` with the number of leases that are still held each time one is released while others remain,
   * until the returned function is called.
   */
  public onLeaseReleased(listener: (runningCount: number) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}

/**
 * Lets the rushx scripts that a daemon runs pass a graph transition while it waits for another Rush process, which
 * may run for any length of time. While the passage is open, a script is admitted at once with a lease of its own,
 * which it holds until it starts, instead of waiting for the transition. Closing the passage waits until every
 * script that passed it has started or failed, so that none of them starts on a generation that has been replaced.
 */
export class ScriptPassage {
  readonly #scheduler: RequestScheduler = new RequestScheduler();
  #opened: AbortController = new AbortController();

  public get isOpen(): boolean {
    return this.#opened.signal.aborted;
  }

  /** Aborted when the passage next opens, so that a script that waits for the transition can pass instead. */
  public get opened(): AbortSignal {
    return this.#opened.signal;
  }

  public open(): void {
    this.#opened.abort();
  }

  /** Admits a script while the passage is open. */
  public passAsync(admission: RequestAdmissionController): Promise<IRequestLease> {
    return admission.acquireAsync(this.#scheduler, RequestExclusivityClass.SharedBuild);
  }

  /** Closes the passage and waits until every script that passed it has released its lease. */
  public async closeAsync(): Promise<void> {
    if (this.isOpen) this.#opened = new AbortController();
    (await this.#scheduler.acquireAsync({ exclusivityClass: RequestExclusivityClass.Exclusive })).release();
  }
}

class QueuePositionWriter {
  readonly #abortController: AbortController;
  readonly #requestId: string;
  readonly #writeQueuePositionAsync: (message: IDaemonRequestQueuePositionMessage) => Promise<void>;
  #failure: unknown;
  #tail: Promise<void> = Promise.resolve();

  public constructor(client: IRequestAdmissionClient, requestId: string, abortController: AbortController) {
    const writeQueuePositionAsync: IRequestAdmissionClient['writeQueuePositionAsync'] =
      client.writeQueuePositionAsync;
    if (!writeQueuePositionAsync) {
      throw new Error('The client negotiated request admission without a queue-position writer.');
    }
    this.#abortController = abortController;
    this.#requestId = requestId;
    this.#writeQueuePositionAsync = (message: IDaemonRequestQueuePositionMessage) =>
      writeQueuePositionAsync.call(client, message);
  }

  /** Reports a wait for native Rush's repository lock, which `holder` holds, as the first queue position. */
  public enqueueNativeLockWait(holder: IDaemonNativeLockHolder): void {
    this.#tail = this.#tail
      .then(() =>
        this.#writeQueuePositionAsync({
          kind: 'queuePosition',
          payload: { position: 1, requestId: this.#requestId, nativeLockHolder: holder }
        })
      )
      .catch((error: unknown) => {
        this.#failure ??= error;
        this.#abortController.abort(error);
      });
  }

  public enqueue(
    position: number,
    restartReason?: DaemonRestartReason,
    restartWait?: IDaemonRestartWaitDetails
  ): void {
    const { scriptCount, restartsForAnotherRequest } = restartWait ?? {};
    this.#enqueuePayload({
      position,
      requestId: this.#requestId,
      ...(restartReason && {
        restartReason,
        ...(scriptCount ? { scriptCount } : undefined),
        ...(restartsForAnotherRequest && { restartsForAnotherRequest })
      })
    });
  }

  /**
   * Reports a wait for the rushx scripts that the daemon runs to exit, as a position that counts them. With a
   * `restartReason`, the daemon then restarts for it. Without one, the request runs once they exit, and then restarts
   * the daemon, as a native install or update does. A request that waits for no script reports nothing.
   */
  public enqueueScriptWait(scriptCount: number, restartReason: DaemonRestartReason | undefined): void {
    if (scriptCount < 1) return;
    this.#enqueuePayload({
      position: scriptCount,
      requestId: this.#requestId,
      ...(restartReason && { restartReason }),
      scriptCount
    });
  }

  #enqueuePayload(payload: IDaemonRequestQueuePositionMessage['payload']): void {
    this.#tail = this.#tail
      .then(() => this.#writeQueuePositionAsync({ kind: 'queuePosition', payload }))
      .catch((error: unknown) => {
        this.#failure ??= error;
        this.#abortController.abort(error);
      });
  }

  public async flushAsync(): Promise<void> {
    await this.#tail;
    if (this.#failure !== undefined) {
      throw this.#failure;
    }
  }
}

/** Reports a request's queue position in a scheduler's queue to its client. */
type ReportQueuePosition = (writer: QueuePositionWriter, position: number) => void;

const reportQueuePosition: ReportQueuePosition = (writer: QueuePositionWriter, position: number) =>
  writer.enqueue(position);

/**
 * Reports whether a request that other requests wait behind is doing work on their behalf, such as loading the
 * workspace graph that they need.
 */
export class AdmissionProgress {
  readonly #listeners: Set<() => void> = new Set();
  #active: boolean = false;

  public get active(): boolean {
    return this.#active;
  }

  public setActive(active: boolean): void {
    if (this.#active === active) return;
    this.#active = active;
    for (const listener of [...this.#listeners]) listener();
  }

  public subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}

/**
 * A wait budget that is spent only while `progress` is inactive.
 *
 * @remarks
 * Waiting while `progress` is active is limited separately, to `maxPausedMs` in total, so that a wedged transition
 * does not hold the requests behind it indefinitely. `onExhausted` receives whether that limit, rather than the
 * budget, ran out.
 */
class ProgressPausedBudget {
  readonly #maxPausedMs: number;
  readonly #onExhausted: (pausedLimitReached: boolean) => void;
  readonly #progress: AdmissionProgress;
  readonly #unsubscribe: () => void;
  #intervalStartMs: number = 0;
  #paused: boolean = false;
  #pausedMs: number = 0;
  #remainingMs: number;
  #timer: ReturnType<typeof setTimeout> | undefined;

  public constructor(
    remainingMs: number,
    maxPausedMs: number,
    progress: AdmissionProgress,
    onExhausted: (pausedLimitReached: boolean) => void
  ) {
    this.#remainingMs = remainingMs;
    this.#maxPausedMs = maxPausedMs;
    this.#progress = progress;
    this.#onExhausted = onExhausted;
    this.#unsubscribe = progress.subscribe(() => {
      this.#endInterval();
      this.#startInterval();
    });
    this.#startInterval();
  }

  /** The time that was not spent from the budget because `progress` was active. */
  public get pausedMs(): number {
    return this.#pausedMs;
  }

  /** The unspent budget. */
  public get remainingMs(): number {
    return this.#remainingMs;
  }

  /** Stops spending; `pausedMs` and `remainingMs` are final afterwards. Calling it again has no effect. */
  public stop(): void {
    this.#unsubscribe();
    this.#endInterval();
  }

  #startInterval(): void {
    this.#paused = this.#progress.active;
    this.#intervalStartMs = Date.now();
    const delayMs: number = this.#paused ? this.#maxPausedMs - this.#pausedMs : this.#remainingMs;
    this.#timer = setTimeout(() => this.#onExhausted(this.#paused), Math.max(0, delayMs));
  }

  #endInterval(): void {
    if (this.#timer === undefined) return;
    clearTimeout(this.#timer);
    this.#timer = undefined;
    const elapsedMs: number = Date.now() - this.#intervalStartMs;
    if (this.#paused) {
      this.#pausedMs += elapsedMs;
    } else {
      this.#remainingMs = Math.max(0, this.#remainingMs - elapsedMs);
    }
  }
}

export class RequestAdmissionController {
  readonly #abortController: AbortController = new AbortController();
  readonly #abortFromClient: () => void;
  readonly #admission: IDaemonRequestAdmissionOptions | undefined;
  readonly #client: IRequestAdmissionClient;
  /** The wait timeout that the client asked for; `#admission` holds only the remainder at a later boundary. */
  readonly #configuredWaitTimeoutMs: number | undefined;
  /** Time spent behind another request's graph load or reload, which did not count against the wait timeout. */
  #pausedMs: number;
  /**
   * The unspent wait timeout, or undefined when waiting is not limited. Only this controller's waits for other
   * requests spend it, so the request's own work, such as capturing its inputs, loading or reloading the workspace
   * graph, routing and execution, does not.
   */
  #remainingMs: number | undefined;
  readonly #writer: QueuePositionWriter | undefined;

  public constructor(options: IRequestAdmissionControllerOptions) {
    validateDaemonRequestAdmissionOptions(options.admission);
    this.#admission = options.admission;
    const history: IAdmissionBudgetHistory | undefined =
      options.admission && HISTORY_BY_REMAINING_ADMISSION.get(options.admission);
    this.#configuredWaitTimeoutMs = history?.waitTimeoutMs ?? options.admission?.waitTimeoutMs;
    this.#pausedMs = history?.pausedMs ?? 0;
    this.#client = options.client;
    this.#remainingMs = options.admission?.waitTimeoutMs;
    this.#writer =
      options.client.supportsRequestAdmission === true
        ? new QueuePositionWriter(options.client, options.requestId, this.#abortController)
        : undefined;
    this.#abortFromClient = () => this.#abortController.abort(options.client.abortSignal.reason);
    if (options.client.abortSignal.aborted) {
      this.#abortFromClient();
    } else {
      options.client.abortSignal.addEventListener('abort', this.#abortFromClient, { once: true });
    }
  }

  /**
   * Waits for workspace admission within the request's remaining admission budget. A wait-timeout error says the
   * request was waiting for `waitingFor`.
   */
  public async acquireAsync(
    scheduler: RequestScheduler,
    exclusivityClass: RequestExclusivityClass,
    waitingFor: string = 'workspace admission'
  ): Promise<IRequestLease> {
    return await this.#acquireAsync(scheduler, exclusivityClass, this.#remainingMs, waitingFor);
  }

  /**
   * Waits for the per-graph execution gate after workspace admission.
   *
   * @remarks
   * A shared-build request that reaches this gate is only waiting behind running compatible shared builds, which is
   * progress rather than contention. A client-default timeout therefore does not apply to that wait; an explicit
   * `noWait` or `waitTimeoutMs` still applies, using the request's remaining admission budget.
   */
  public async acquireGraphExecutionAsync(
    scheduler: RequestScheduler,
    exclusivityClass: RequestExclusivityClass
  ): Promise<IRequestLease> {
    const waitTimeoutMs: number | undefined =
      exclusivityClass === RequestExclusivityClass.SharedBuild && this.#admission?.waitTimeoutIsDefault
        ? undefined
        : this.#remainingMs;
    return await this.#acquireAsync(
      scheduler,
      exclusivityClass,
      waitTimeoutMs,
      'the running build of the workspace operation graph'
    );
  }

  /**
   * After the restart drain ({@link RequestAdmissionController.waitForRestartDrainAsync}), waits until no other
   * request holds `scheduler`, so that this request can be answered with a restart result for `restartReason`
   * without interrupting them.
   *
   * @remarks
   * Once the drain is over, only requests that the drain does not track can still hold `scheduler`, such as
   * observers that are winding down after their cancellation, so this wait uses the request's remaining admission
   * budget. Queue positions carry `restartReason`, and a timeout names it, so that the client can say why it waits.
   */
  public async acquireBeforeRestartAsync(
    scheduler: RequestScheduler,
    restartReason: DaemonRestartReason
  ): Promise<IRequestLease> {
    return await this.#acquireAsync(
      scheduler,
      RequestExclusivityClass.Exclusive,
      this.#remainingMs,
      'the running requests to finish before the daemon restarts ' +
        (formatDaemonRestartCause(restartReason, 'thisRequest') ?? 'for its environment'),
      this.#abortController.signal,
      (writer: QueuePositionWriter, position: number) => writer.enqueue(position, restartReason)
    );
  }

  /**
   * Waits until none of the rushx scripts that `scripts` admits still runs, for a request that holds the workspace's
   * exclusive gate, so that no script can start meanwhile. What comes next would end them with this process: the
   * daemon restarts for `restartReason`, or without one, the request runs and then restarts the daemon, as a native
   * install or update does.
   *
   * @remarks
   * Queue positions count the scripts that still run (`scriptCount`), and carry `restartReason`, so that the client
   * can say what the request waits for, and why. The request's remaining admission budget applies, since a script
   * may not exit until it is stopped, and a timeout names what the request waited for.
   */
  public async waitForServedScriptsAsync(
    scripts: ServedScriptScheduler,
    restartReason: DaemonRestartReason | undefined
  ): Promise<void> {
    const cause: string | undefined = restartReason && formatDaemonRestartCause(restartReason, 'thisRequest');
    const unsubscribe: () => void = scripts.onLeaseReleased((runningCount: number) =>
      this.#writer?.enqueueScriptWait(runningCount, restartReason)
    );
    try {
      const lease: IRequestLease = await this.#acquireAsync(
        scripts,
        RequestExclusivityClass.Exclusive,
        this.#remainingMs,
        `a rushx script that this daemon runs to exit${cause ? `, before the daemon restarts ${cause}` : ''}`,
        this.#abortController.signal,
        // Until it is admitted, the request does not hold a lease itself.
        (writer: QueuePositionWriter) => writer.enqueueScriptWait(scripts.activeRequestCount, restartReason)
      );
      lease.release();
    } finally {
      unsubscribe();
    }
  }

  /**
   * Waits for shared-build workspace admission while another request loads or reloads the workspace graph.
   *
   * @remarks
   * While `transition` reports progress, the other request holds the exclusive gate and is loading the graph that
   * this request needs, so the request's wait timeout is not spent: at a cold start every concurrent build waits for
   * the first build's graph load, whether its timeout is the client default or explicit. That wait is limited
   * separately, to `GRAPH_LOAD_WAIT_FACTOR` times the wait timeout, so a wedged load does not hold its followers
   * indefinitely. The timeout is still spent while the transition itself waits for another request, so a transition
   * that cannot start does not hold its followers either. Unspent time carries over to later waits of this request.
   * `noWait` still fails at once.
   *
   * With `admitAheadOfQueue`, a request that the transition's owner waits for anyway, such as a running build, lets
   * this request be admitted at once, ahead of the owner and of the requests that wait behind it; see
   * `IRequestSchedulerAcquireOptions.admitAheadOfQueue`. The lifecycle sets it for a rushx script while the owner of
   * a reload has yet to replace the current generation, which the script needs only to start.
   */
  public acquireBehindTransitionAsync(
    scheduler: RequestScheduler,
    transition: AdmissionProgress,
    admitAheadOfQueue?: boolean
  ): Promise<IRequestLease>;
  /**
   * Waits as the other overload does, but only until `stopWaiting` is aborted, and then returns undefined. The time
   * that the request waited is spent as it would be if it had been admitted then.
   */
  public acquireBehindTransitionAsync(
    scheduler: RequestScheduler,
    transition: AdmissionProgress,
    admitAheadOfQueue: boolean,
    stopWaiting: AbortSignal
  ): Promise<IRequestLease | undefined>;
  public async acquireBehindTransitionAsync(
    scheduler: RequestScheduler,
    transition: AdmissionProgress,
    admitAheadOfQueue: boolean = false,
    stopWaiting?: AbortSignal
  ): Promise<IRequestLease | undefined> {
    const waitingFor: string = "another request's load or reload of the workspace graph";
    const remainingMs: number | undefined = this.#remainingMs;
    const waitTimeoutMs: number | undefined = this.#configuredWaitTimeoutMs;
    const abortSignals: AbortSignal[] = stopWaiting
      ? [this.#abortController.signal, stopWaiting]
      : [this.#abortController.signal];
    const stoppedWaiting = (): boolean => !!stopWaiting?.aborted && !this.#abortController.signal.aborted;
    if (remainingMs === undefined || waitTimeoutMs === undefined) {
      try {
        return await this.#acquireAsync(
          scheduler,
          RequestExclusivityClass.SharedBuild,
          remainingMs,
          waitingFor,
          AbortSignal.any(abortSignals),
          reportQueuePosition,
          admitAheadOfQueue
        );
      } catch (error) {
        if (stoppedWaiting()) return undefined;
        throw error;
      }
    }
    const exhausted: AbortController = new AbortController();
    let pausedLimitReached: boolean = false;
    const budget: ProgressPausedBudget = new ProgressPausedBudget(
      remainingMs,
      Math.min(GRAPH_LOAD_WAIT_FACTOR * waitTimeoutMs, MAX_DAEMON_REQUEST_WAIT_TIMEOUT_MS),
      transition,
      (reachedPausedLimit: boolean) => {
        if (!exhausted.signal.aborted) {
          pausedLimitReached = reachedPausedLimit;
          exhausted.abort();
        }
      }
    );
    try {
      return await this.#acquireAsync(
        scheduler,
        RequestExclusivityClass.SharedBuild,
        undefined,
        waitingFor,
        AbortSignal.any([...abortSignals, exhausted.signal]),
        reportQueuePosition,
        admitAheadOfQueue
      );
    } catch (error) {
      budget.stop();
      if (stoppedWaiting() && !exhausted.signal.aborted) return undefined;
      if (!exhausted.signal.aborted || this.#abortController.signal.aborted) throw error;
      // A zero timeout has no paused allowance, so it fails at once without reaching a limit worth naming.
      const message: string =
        pausedLimitReached && waitTimeoutMs > 0
          ? `The request was not admitted within ${GRAPH_LOAD_WAIT_FACTOR} times its ${waitTimeoutMs}ms wait ` +
            `timeout because ${waitingFor} was still running after ${formatSeconds(budget.pausedMs)}.`
          : `The request was not admitted within its ${waitTimeoutMs}ms wait timeout while waiting for ` +
            `${waitingFor}` +
            `${formatUncountedTime(this.#pausedMs + budget.pausedMs, 'while that request loaded the graph')}.`;
      throw new RequestSchedulerError(
        RequestSchedulerErrorCode.WaitTimeout,
        `${message} ${WAIT_LONGER_HINT}`
      );
    } finally {
      budget.stop();
      this.#pausedMs += budget.pausedMs;
      this.#remainingMs = budget.remainingMs;
    }
  }

  async #acquireAsync(
    scheduler: RequestScheduler,
    exclusivityClass: RequestExclusivityClass,
    waitTimeoutMs: number | undefined,
    waitingFor: string,
    abortSignal: AbortSignal = this.#abortController.signal,
    reportPosition: ReportQueuePosition = reportQueuePosition,
    admitAheadOfQueue: boolean = false
  ): Promise<IRequestLease> {
    const writer: QueuePositionWriter | undefined = this.#writer;
    const startMs: number = Date.now();
    let lease: IRequestLease | undefined;
    try {
      lease = await scheduler.acquireAsync({
        abortSignal,
        admitAheadOfQueue,
        exclusivityClass,
        noWait: this.#admission?.noWait,
        onQueuePositionChanged: writer ? (position: number) => reportPosition(writer, position) : undefined,
        waitTimeoutMs
      });
      await writer?.flushAsync();
      if (this.#abortController.signal.aborted) {
        throw new RequestSchedulerError(
          RequestSchedulerErrorCode.Aborted,
          'The request was aborted before execution.'
        );
      }
      return lease;
    } catch (error) {
      lease?.release();
      await writer?.flushAsync();
      throw this.#getReportedError(error, waitingFor);
    } finally {
      // A wait that the timeout does not limit does not spend it either; see `acquireGraphExecutionAsync`.
      if (waitTimeoutMs !== undefined) this.#spend(Date.now() - startMs);
    }
  }

  /**
   * Waits until a restart would not preempt another request. The client is told how many requests it waits for,
   * as a queue position, since a restart waits as long as their builds.
   *
   * @remarks
   * Like the per-graph execution gate, waiting for the requests that this process was already serving when the wait
   * began is progress rather than contention. A client-default timeout therefore does not apply while one of them is
   * still being served and no rushx script is, and that time does not count against it. The default still limits
   * the wait while a rushx script is served, since a script may not exit until it is stopped, and waiting for
   * requests that arrived later, which could otherwise keep the request waiting for as long as they keep arriving.
   * An explicit `noWait` or `waitTimeoutMs` applies to the whole wait, using the same budget as workspace admission.
   *
   * A `restartReason` says why the request needs the restart. Queue positions carry it, as do those of rushx scripts
   * that wait for the restart, and admission errors name it. Without it, they say that the daemon restarts for the
   * request's environment. Queue positions also say how many of the requests that they count run a rushx script.
   *
   * @returns true once the drain finishes, or false if `recheck` found that the request no longer needs the restart.
   */
  public async waitForRestartDrainAsync(
    arbiter: WorkspaceRestartArbiter,
    ticket: IWorkspaceRestartTicket,
    restartReason?: DaemonRestartReason,
    recheck?: IWorkspaceRestartRecheck
  ): Promise<boolean> {
    const result: IWorkspaceRestartWaitResult = await this.#waitForRestartArbiterAsync(
      (options: IWorkspaceRestartDrainOptions) => arbiter.waitForDrainAsync(ticket, options, recheck),
      restartReason
    );
    return !result.restartWithdrawn;
  }

  /**
   * Waits, for a rushx script, until no other request needs to restart the daemon, so that the restart does not also
   * wait for the script. The client is told how many requests are served or need a restart, as a queue position,
   * and why the first request that needs a restart needs it.
   *
   * @remarks
   * The wait timeout applies as it does to the restart drain, relative to the requests served when this wait began:
   * a client-default timeout is not spent while one of them is still being served and no rushx script is.
   */
  public async waitForPendingRestartAsync(
    arbiter: WorkspaceRestartArbiter,
    ticket: IWorkspaceRestartTicket
  ): Promise<void> {
    await this.#waitForRestartArbiterAsync(
      (options: IWorkspaceRestartDrainOptions) => arbiter.waitForPendingRestartAsync(ticket, options),
      undefined,
      true
    );
  }

  async #waitForRestartArbiterAsync(
    waitAsync: (options: IWorkspaceRestartDrainOptions) => Promise<IWorkspaceRestartWaitResult>,
    restartReason?: DaemonRestartReason,
    restartsForAnotherRequest?: boolean
  ): Promise<IWorkspaceRestartWaitResult> {
    const writer: QueuePositionWriter | undefined = this.#writer;
    const startMs: number = Date.now();
    let waivedMs: number = 0;
    try {
      // The arbiter reports its own admission errors, so this does not depend on the scheduler error mapping.
      const result: IWorkspaceRestartWaitResult = await waitAsync({
        abortSignal: this.#abortController.signal,
        noWait: this.#admission?.noWait,
        waitTimeoutMs: this.#remainingMs,
        waivesTimeoutForServedWork: this.#admission?.waitTimeoutIsDefault === true,
        restartReason,
        onServingCountChanged: writer
          ? (count: number, report: IWorkspaceRestartWaitReport) =>
              writer.enqueue(count, report.restartReason, {
                scriptCount: report.scriptCount,
                restartsForAnotherRequest
              })
          : undefined
      });
      waivedMs = result.waivedMs;
      return result;
    } finally {
      await writer?.flushAsync();
      this.#spend(Date.now() - startMs - waivedMs);
    }
  }

  public dispose(): void {
    this.#client.abortSignal.removeEventListener('abort', this.#abortFromClient);
  }

  /** Passes the remaining admission budget to another existing routing boundary. */
  public get remainingAdmission(): IDaemonRequestAdmissionOptions | undefined {
    if (!this.#admission) return undefined;
    const remaining: IDaemonRequestAdmissionOptions = {
      ...this.#admission,
      waitTimeoutMs: this.#remainingMs
    };
    if (this.#configuredWaitTimeoutMs !== undefined) {
      HISTORY_BY_REMAINING_ADMISSION.set(remaining, {
        waitTimeoutMs: this.#configuredWaitTimeoutMs,
        pausedMs: this.#pausedMs
      });
    }
    return remaining;
  }

  /**
   * Begins a wait for native Rush's repository lock while another Rush process holds it. The request waits as it
   * does for another request, within its remaining admission budget: `noWait` and a zero timeout fail at once, and
   * otherwise the client is told which process the request waits for, as the first queue position, each time that
   * process changes. A client-default timeout applies, since the other process can run for any length of time.
   *
   * @remarks
   * {@link RequestAdmissionController.acquireNativeLockAsync} waits for the lock with it. A caller that waits once for
   * several requests uses it directly: it tries the lock again, and then calls `update` for each request, which says
   * when the request may not wait any longer, and finally `endAsync`.
   */
  public beginNativeLockWait(): INativeLockWait {
    const writer: QueuePositionWriter | undefined = this.#writer;
    const startMs: number = Date.now();
    const budgetMs: number | undefined = this.#remainingMs;
    let holder: IDaemonNativeLockHolder = {};
    let reportedHolder: string | undefined;
    let ended: Promise<void> | undefined;
    return {
      get retryDelayMs(): number {
        return budgetMs === undefined
          ? NATIVE_LOCK_RETRY_MS
          : Math.min(NATIVE_LOCK_RETRY_MS, Math.max(0, budgetMs - (Date.now() - startMs)));
      },
      update: (foundHolder: IDaemonNativeLockHolder): RequestSchedulerError | undefined => {
        if (replacesNativeLockHolder(holder, foundHolder)) holder = foundHolder;
        const error: RequestSchedulerError | undefined = this.#getNativeLockWaitError(
          formatNativeLockHolder(holder),
          Date.now() - startMs,
          budgetMs
        );
        const key: string = `${holder.pid}:${holder.command}`;
        if (!error && !ended && key !== reportedHolder) {
          reportedHolder = key;
          writer?.enqueueNativeLockWait(holder);
        }
        return error;
      },
      endAsync: (): Promise<void> => {
        if (!ended) {
          this.#spend(Date.now() - startMs);
          ended = writer ? writer.flushAsync() : Promise.resolve();
        }
        return ended;
      }
    };
  }

  /**
   * Takes native Rush's repository lock with `tryAcquire`, which returns undefined while another Rush process holds
   * it, and waits for that process as {@link RequestAdmissionController.beginNativeLockWait} describes. `findHolder`
   * says which process holds the lock.
   *
   * @remarks
   * The lock is tried every 250ms, since native Rush does not say when it releases it, and it is released again if
   * the client could not be told about the wait.
   */
  public async acquireNativeLockAsync<TLock extends { release(): void }>(
    tryAcquire: () => TLock | undefined,
    findHolder: () => IDaemonNativeLockHolder
  ): Promise<TLock> {
    let lock: TLock | undefined = tryAcquire();
    if (lock) return lock;
    const wait: INativeLockWait = this.beginNativeLockWait();
    const abortSignal: AbortSignal = this.#abortController.signal;
    try {
      while (!lock) {
        const error: RequestSchedulerError | undefined = wait.update(findHolder());
        if (error) throw error;
        await delayAsync(wait.retryDelayMs, abortSignal);
        if (!abortSignal.aborted) lock = tryAcquire();
      }
      await wait.endAsync();
      return lock;
    } catch (error) {
      lock?.release();
      await wait.endAsync();
      throw error;
    }
  }

  /** Returns the error that ends a wait for native Rush's repository lock, which `holder` holds, if it must end. */
  #getNativeLockWaitError(
    holder: string,
    elapsedMs: number,
    budgetMs: number | undefined
  ): RequestSchedulerError | undefined {
    if (this.#abortController.signal.aborted) {
      return new RequestSchedulerError(
        RequestSchedulerErrorCode.Aborted,
        `The request was aborted while waiting for ${holder} to release this repository's lock.`
      );
    }
    if (this.#admission?.noWait) {
      return new RequestSchedulerError(
        RequestSchedulerErrorCode.NoWait,
        `The request cannot be admitted immediately because ${holder} holds this repository's lock, and ` +
          '--no-wait was specified.'
      );
    }
    if (this.#configuredWaitTimeoutMs === 0) {
      return new RequestSchedulerError(
        RequestSchedulerErrorCode.WaitTimeout,
        `The request cannot be admitted immediately because ${holder} holds this repository's lock. ` +
          'Use --wait-timeout <seconds> to wait for it.'
      );
    }
    if (budgetMs === undefined || elapsedMs < budgetMs) return undefined;
    const waitingFor: string = `${holder} to release this repository's lock`;
    return this.#getReportedError(
      new RequestSchedulerError(
        RequestSchedulerErrorCode.WaitTimeout,
        `The request timed out while waiting for ${waitingFor}.`
      ),
      waitingFor
    ) as RequestSchedulerError;
  }

  /** Spends `elapsedMs` of the wait timeout, if one applies. */
  #spend(elapsedMs: number): void {
    if (this.#remainingMs !== undefined) {
      this.#remainingMs = Math.max(0, this.#remainingMs - Math.max(0, elapsedMs));
    }
  }

  #getReportedError(error: unknown, waitingFor: string): unknown {
    const waitTimeoutMs: number | undefined = this.#configuredWaitTimeoutMs;
    if (
      waitTimeoutMs !== undefined &&
      error instanceof RequestSchedulerError &&
      error.code === RequestSchedulerErrorCode.WaitTimeout
    ) {
      return new RequestSchedulerError(
        RequestSchedulerErrorCode.WaitTimeout,
        `The request was not admitted within its ${waitTimeoutMs}ms wait timeout while waiting for ${waitingFor}` +
          `${formatUncountedTime(this.#pausedMs, 'earlier while another request loaded the workspace graph')}. ` +
          WAIT_LONGER_HINT
      );
    }
    return error;
  }
}

export function getRequestAdmissionErrorCode(error: RequestSchedulerError): DaemonRequestAdmissionErrorCode {
  switch (error.code) {
    case RequestSchedulerErrorCode.Aborted:
      return 'aborted';
    case RequestSchedulerErrorCode.NoWait:
      return 'no-wait';
    case RequestSchedulerErrorCode.WaitTimeout:
      return 'wait-timeout';
  }
}

export function getWorkspaceRequestScheduler(workspaceSession: IWorkspaceSession): RequestScheduler {
  let scheduler: RequestScheduler | undefined = REQUEST_SCHEDULER_BY_SESSION.get(workspaceSession);
  if (!scheduler) {
    scheduler = new WorkspaceRequestScheduler(workspaceSession);
    REQUEST_SCHEDULER_BY_SESSION.set(workspaceSession, scheduler);
  }
  return scheduler;
}
