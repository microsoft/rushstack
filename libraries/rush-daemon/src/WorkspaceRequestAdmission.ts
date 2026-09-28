// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  MAX_DAEMON_REQUEST_WAIT_TIMEOUT_MS,
  validateDaemonRequestAdmissionOptions
} from '@rushstack/rush-daemon-protocol';
import type {
  DaemonRequestAdmissionErrorCode,
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
import type { IWorkspaceRestartTicket, WorkspaceRestartArbiter } from './WorkspaceRestartArbiter';

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
/** A request waits for another request's graph load or reload for up to this many times its wait timeout. */
const GRAPH_LOAD_WAIT_FACTOR: number = 10;
// Only the per-invocation flag is offered: Rush versions that do not recognize the environment variable reject it.
const WAIT_LONGER_HINT: string = 'Use --wait-timeout <seconds> to wait longer.';

function formatSeconds(ms: number): string {
  return `${Math.round(ms / 100) / 10}s`;
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

  public enqueue(position: number): void {
    this.#tail = this.#tail
      .then(() =>
        this.#writeQueuePositionAsync({
          kind: 'queuePosition',
          payload: { position, requestId: this.#requestId }
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
  #deadlineMs: number | undefined;
  readonly #writer: QueuePositionWriter | undefined;

  public constructor(options: IRequestAdmissionControllerOptions) {
    validateDaemonRequestAdmissionOptions(options.admission);
    this.#admission = options.admission;
    this.#client = options.client;
    this.#deadlineMs =
      options.admission?.waitTimeoutMs === undefined
        ? undefined
        : Date.now() + options.admission.waitTimeoutMs;
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

  /** Waits for workspace admission within the request's remaining admission budget. */
  public async acquireAsync(
    scheduler: RequestScheduler,
    exclusivityClass: RequestExclusivityClass
  ): Promise<IRequestLease> {
    return await this.#acquireAsync(
      scheduler,
      exclusivityClass,
      this.#getRemainingWaitTimeoutMs(),
      'workspace admission'
    );
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
        : this.#getRemainingWaitTimeoutMs();
    return await this.#acquireAsync(
      scheduler,
      exclusivityClass,
      waitTimeoutMs,
      'the running build of the workspace operation graph'
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
    const remainingMs: number | undefined = this.#getRemainingWaitTimeoutMs();
    const waitTimeoutMs: number | undefined = this.#admission?.waitTimeoutMs;
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
      const message: string = pausedLimitReached
        ? `The request was not admitted within ${GRAPH_LOAD_WAIT_FACTOR} times its ${waitTimeoutMs}ms wait ` +
          `timeout because ${waitingFor} was still running after ${formatSeconds(budget.pausedMs)}.`
        : `The request was not admitted within its ${waitTimeoutMs}ms wait timeout while waiting for ` +
          `${waitingFor}` +
          (budget.pausedMs > 0
            ? `; ${formatSeconds(budget.pausedMs)} spent while that request loaded the graph did not count.`
            : '.');
      throw new RequestSchedulerError(
        RequestSchedulerErrorCode.WaitTimeout,
        `${message} ${WAIT_LONGER_HINT}`
      );
    } finally {
      budget.stop();
      this.#deadlineMs = Date.now() + budget.remainingMs;
    }
  }

  /**
   * Runs `action`, such as routing and executing an admitted request, without spending the request's wait timeout.
   *
   * @remarks
   * Work after admission either runs or waits at a routing boundary that applies the timeout it received, such as the
   * graph-execution gate. A request that re-enters workspace admission afterwards, for example to reload the graph
   * after its inputs changed, therefore keeps the unspent timeout it had before `action`, whether that timeout is the
   * client default or explicit.
   */
  public async runOutsideWaitBudgetAsync<T>(action: () => Promise<T>): Promise<T> {
    const remainingMs: number | undefined = this.#getRemainingWaitTimeoutMs();
    if (remainingMs === undefined) {
      return await action();
    }
    try {
      return await action();
    } finally {
      this.#deadlineMs = Date.now() + remainingMs;
    }
  }

  async #acquireAsync(
    scheduler: RequestScheduler,
    exclusivityClass: RequestExclusivityClass,
    waitTimeoutMs: number | undefined,
    waitingFor: string,
    abortSignal: AbortSignal = this.#abortController.signal
  ): Promise<IRequestLease> {
    const writer: QueuePositionWriter | undefined = this.#writer;
    let lease: IRequestLease | undefined;
    try {
      lease = await scheduler.acquireAsync({
        abortSignal,
        exclusivityClass,
        noWait: this.#admission?.noWait,
        onQueuePositionChanged: writer ? (position: number) => writer.enqueue(position) : undefined,
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
   * An explicit `noWait` or `waitTimeoutMs` applies to the whole wait, using the same absolute deadline as workspace
   * admission.
   */
  public async waitForRestartDrainAsync(
    arbiter: WorkspaceRestartArbiter,
    ticket: IWorkspaceRestartTicket
  ): Promise<void> {
    const writer: QueuePositionWriter | undefined = this.#writer;
    try {
      // The arbiter reports its own admission errors, so this does not depend on the scheduler error mapping.
      const waivedMs: number = await arbiter.waitForDrainAsync(ticket, {
        abortSignal: this.#abortController.signal,
        noWait: this.#admission?.noWait,
        waitTimeoutMs: this.#getRemainingWaitTimeoutMs(),
        waivesTimeoutForServedWork: this.#admission?.waitTimeoutIsDefault === true,
        onServingCountChanged: writer ? (servingCount: number) => writer.enqueue(servingCount) : undefined
      });
      if (this.#deadlineMs !== undefined) this.#deadlineMs += waivedMs;
    } finally {
      await writer?.flushAsync();
    }
  }

  public dispose(): void {
    this.#client.abortSignal.removeEventListener('abort', this.#abortFromClient);
  }

  /** Passes the remaining admission budget to another existing routing boundary. */
  public get remainingAdmission(): IDaemonRequestAdmissionOptions | undefined {
    return this.#admission
      ? { ...this.#admission, waitTimeoutMs: this.#getRemainingWaitTimeoutMs() }
      : undefined;
  }

  #getRemainingWaitTimeoutMs(): number | undefined {
    return this.#deadlineMs === undefined ? undefined : Math.max(0, this.#deadlineMs - Date.now());
  }

  #getReportedError(error: unknown, waitingFor: string): unknown {
    const waitTimeoutMs: number | undefined = this.#admission?.waitTimeoutMs;
    if (
      waitTimeoutMs !== undefined &&
      error instanceof RequestSchedulerError &&
      error.code === RequestSchedulerErrorCode.WaitTimeout
    ) {
      return new RequestSchedulerError(
        RequestSchedulerErrorCode.WaitTimeout,
        `The request was not admitted within its ${waitTimeoutMs}ms wait timeout while waiting for ${waitingFor}. ` +
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
