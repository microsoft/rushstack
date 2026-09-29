// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  MAX_DAEMON_REQUEST_WAIT_TIMEOUT_MS,
  validateDaemonRequestAdmissionOptions
} from '@rushstack/rush-daemon-protocol';
import type {
  DaemonRequestAdmissionErrorCode,
  DaemonRestartReason,
  IDaemonRequestAdmissionOptions,
  IDaemonRequestQueuePositionMessage
} from '@rushstack/rush-daemon-protocol';

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
  IWorkspaceRestartTicket,
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

function formatSeconds(ms: number): string {
  return `${Math.round(ms / 100) / 10}s`;
}

/** Describes time that did not count against a request's wait timeout, unless it rounds to nothing. */
function formatUncountedTime(pausedMs: number, spentWhile: string): string {
  const seconds: string = formatSeconds(pausedMs);
  return seconds === '0s' ? '' : `; ${seconds} spent ${spentWhile} did not count`;
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

/** Says why the daemon restarts, completing "the daemon could restart <cause>". */
function formatRestartCause(restartReason: DaemonRestartReason): string {
  return restartReason.kind === 'environmentChanged'
    ? `because a command's environment differs from its own in ${restartReason.variableNames.join(', ')}`
    : `because its installation at ${restartReason.folder} was ${restartReason.change}`;
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

  public enqueue(position: number, restartReason?: DaemonRestartReason): void {
    this.#tail = this.#tail
      .then(() =>
        this.#writeQueuePositionAsync({
          kind: 'queuePosition',
          payload: { position, requestId: this.#requestId, ...(restartReason && { restartReason }) }
        })
      )
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
      `the running requests to finish before the daemon restarts ${formatRestartCause(restartReason)}`,
      this.#abortController.signal,
      restartReason
    );
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
   */
  public async acquireBehindTransitionAsync(
    scheduler: RequestScheduler,
    transition: AdmissionProgress
  ): Promise<IRequestLease> {
    const waitingFor: string = "another request's load or reload of the workspace graph";
    const remainingMs: number | undefined = this.#remainingMs;
    const waitTimeoutMs: number | undefined = this.#configuredWaitTimeoutMs;
    if (remainingMs === undefined || waitTimeoutMs === undefined) {
      return await this.#acquireAsync(
        scheduler,
        RequestExclusivityClass.SharedBuild,
        remainingMs,
        waitingFor
      );
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
        AbortSignal.any([this.#abortController.signal, exhausted.signal])
      );
    } catch (error) {
      budget.stop();
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
    restartReason?: DaemonRestartReason
  ): Promise<IRequestLease> {
    const writer: QueuePositionWriter | undefined = this.#writer;
    const startMs: number = Date.now();
    let lease: IRequestLease | undefined;
    try {
      lease = await scheduler.acquireAsync({
        abortSignal,
        exclusivityClass,
        noWait: this.#admission?.noWait,
        onQueuePositionChanged: writer
          ? (position: number) => writer.enqueue(position, restartReason)
          : undefined,
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
   * A `restartReason` says that the daemon restarts for that reason rather than for the request's environment. Queue
   * positions then carry it, and admission errors name it.
   */
  public async waitForRestartDrainAsync(
    arbiter: WorkspaceRestartArbiter,
    ticket: IWorkspaceRestartTicket,
    restartReason?: DaemonRestartReason
  ): Promise<void> {
    await this.#waitForRestartArbiterAsync(
      (options: IWorkspaceRestartDrainOptions) => arbiter.waitForDrainAsync(ticket, options),
      restartReason
    );
  }

  /**
   * Waits, for a rushx script, until no other request needs to restart the daemon for its environment, so that the
   * restart does not also wait for the script. The client is told how many requests are served or need a restart, as
   * a queue position.
   *
   * @remarks
   * The wait timeout applies as it does to the restart drain, relative to the requests served when this wait began:
   * a client-default timeout is not spent while one of them is still being served and no rushx script is.
   */
  public async waitForPendingRestartAsync(
    arbiter: WorkspaceRestartArbiter,
    ticket: IWorkspaceRestartTicket
  ): Promise<void> {
    await this.#waitForRestartArbiterAsync((options: IWorkspaceRestartDrainOptions) =>
      arbiter.waitForPendingRestartAsync(ticket, options)
    );
  }

  async #waitForRestartArbiterAsync(
    waitAsync: (options: IWorkspaceRestartDrainOptions) => Promise<number>,
    restartReason?: DaemonRestartReason
  ): Promise<void> {
    const writer: QueuePositionWriter | undefined = this.#writer;
    const startMs: number = Date.now();
    let waivedMs: number = 0;
    try {
      // The arbiter reports its own admission errors, so this does not depend on the scheduler error mapping.
      waivedMs = await waitAsync({
        abortSignal: this.#abortController.signal,
        noWait: this.#admission?.noWait,
        waitTimeoutMs: this.#remainingMs,
        waivesTimeoutForServedWork: this.#admission?.waitTimeoutIsDefault === true,
        restartCause: restartReason && formatRestartCause(restartReason),
        onServingCountChanged: writer ? (count: number) => writer.enqueue(count, restartReason) : undefined
      });
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
