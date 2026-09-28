// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { validateDaemonRequestAdmissionOptions } from '@rushstack/rush-daemon-protocol';
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

/** A wait budget that is spent only while `progress` is inactive. */
class ProgressPausedBudget {
  readonly #onExhausted: () => void;
  readonly #progress: AdmissionProgress;
  readonly #unsubscribe: () => void;
  #remainingMs: number;
  #runningSinceMs: number | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;

  public constructor(remainingMs: number, progress: AdmissionProgress, onExhausted: () => void) {
    this.#remainingMs = remainingMs;
    this.#progress = progress;
    this.#onExhausted = onExhausted;
    this.#unsubscribe = progress.subscribe(() => this.#update());
    this.#update();
  }

  /** Stops spending and returns the unspent budget. */
  public stop(): number {
    this.#unsubscribe();
    this.#pause();
    return this.#remainingMs;
  }

  #update(): void {
    if (this.#progress.active) {
      this.#pause();
    } else if (this.#runningSinceMs === undefined) {
      this.#runningSinceMs = Date.now();
      this.#timer = setTimeout(this.#onExhausted, this.#remainingMs);
    }
  }

  #pause(): void {
    if (this.#runningSinceMs === undefined) return;
    this.#remainingMs = Math.max(0, this.#remainingMs - (Date.now() - this.#runningSinceMs));
    this.#runningSinceMs = undefined;
    clearTimeout(this.#timer);
    this.#timer = undefined;
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
   * `noWait` or `waitTimeoutMs` still applies, using the same absolute deadline as workspace admission.
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
   * this request needs, so a client-default timeout is not spent: at a cold start every concurrent build waits for
   * the first build's graph load. The default budget is still spent while the transition itself waits for another
   * request, so a transition that cannot start does not hold its followers indefinitely. Unspent budget carries over
   * to later waits of this request. An explicit `noWait` or `waitTimeoutMs` applies unchanged.
   */
  public async acquireBehindTransitionAsync(
    scheduler: RequestScheduler,
    transition: AdmissionProgress
  ): Promise<IRequestLease> {
    const waitingFor: string = "another request's load or reload of the workspace graph";
    const remainingMs: number | undefined = this.#getRemainingWaitTimeoutMs();
    if (!this.#admission?.waitTimeoutIsDefault || remainingMs === undefined) {
      return await this.#acquireAsync(scheduler, RequestExclusivityClass.SharedBuild, remainingMs, waitingFor);
    }
    const exhausted: AbortController = new AbortController();
    const budget: ProgressPausedBudget = new ProgressPausedBudget(remainingMs, transition, () =>
      exhausted.abort()
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
      if (!exhausted.signal.aborted || this.#abortController.signal.aborted) throw error;
      throw this.#getReportedError(
        new RequestSchedulerError(
          RequestSchedulerErrorCode.WaitTimeout,
          `The request was not admitted within ${this.#admission.waitTimeoutMs}ms.`
        ),
        waitingFor
      );
    } finally {
      this.#deadlineMs = Date.now() + budget.stop();
    }
  }

  /**
   * Runs `action`, such as routing and executing an admitted request, without spending a client-default budget.
   *
   * @remarks
   * Work after admission either runs or waits behind progress, such as the exempt graph-execution gate. A request that
   * re-enters workspace admission afterwards, for example to reload the graph after its inputs changed, therefore
   * keeps the budget it had before `action`. An explicit `noWait` or `waitTimeoutMs` keeps its absolute deadline.
   */
  public async runOutsideDefaultBudgetAsync<T>(action: () => Promise<T>): Promise<T> {
    const remainingMs: number | undefined = this.#getRemainingWaitTimeoutMs();
    if (!this.#admission?.waitTimeoutIsDefault || remainingMs === undefined) {
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

  /** Waits, within the same admission budget, until a restart would not preempt another request. */
  public async waitForRestartDrainAsync(
    arbiter: WorkspaceRestartArbiter,
    ticket: IWorkspaceRestartTicket
  ): Promise<void> {
    // The arbiter reports its own admission errors, so this does not depend on the scheduler error mapping.
    await arbiter.waitForDrainAsync(ticket, {
      abortSignal: this.#abortController.signal,
      noWait: this.#admission?.noWait,
      waitTimeoutMs: this.#getRemainingWaitTimeoutMs()
    });
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
        `The request was not admitted within ${waitTimeoutMs}ms while waiting for ${waitingFor}. ` +
          'Use --wait-timeout <seconds> or RUSH_DAEMON_QUEUE_TIMEOUT_SECONDS to wait longer.'
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
