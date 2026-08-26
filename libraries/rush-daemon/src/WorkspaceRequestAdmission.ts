// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  validateDaemonRequestAdmissionOptions
} from '@rushstack/rush-daemon-protocol';
import type {
  DaemonRequestAdmissionErrorCode,
  IDaemonRequestAdmissionOptions,
  IDaemonRequestQueuePositionMessage
} from '@rushstack/rush-daemon-protocol';

import {
  type IRequestLease,
  type RequestExclusivityClass,
  RequestScheduler,
  RequestSchedulerError,
  RequestSchedulerErrorCode
} from './RequestScheduler';
import type { IWorkspaceSession } from './WorkspaceSession';

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

class QueuePositionWriter {
  readonly #abortController: AbortController;
  readonly #requestId: string;
  readonly #writeQueuePositionAsync: (
    message: IDaemonRequestQueuePositionMessage
  ) => Promise<void>;
  #failure: unknown;
  #tail: Promise<void> = Promise.resolve();

  public constructor(
    client: IRequestAdmissionClient,
    requestId: string,
    abortController: AbortController
  ) {
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

export class RequestAdmissionController {
  readonly #abortController: AbortController = new AbortController();
  readonly #abortFromClient: () => void;
  readonly #admission: IDaemonRequestAdmissionOptions | undefined;
  readonly #client: IRequestAdmissionClient;
  readonly #deadlineMs: number | undefined;
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

  public async acquireAsync(
    scheduler: RequestScheduler,
    exclusivityClass: RequestExclusivityClass
  ): Promise<IRequestLease> {
    const writer: QueuePositionWriter | undefined = this.#writer;
    let lease: IRequestLease | undefined;
    try {
      lease = await scheduler.acquireAsync({
        abortSignal: this.#abortController.signal,
        exclusivityClass,
        noWait: this.#admission?.noWait,
        onQueuePositionChanged: writer ? (position: number) => writer.enqueue(position) : undefined,
        waitTimeoutMs: this.#getRemainingWaitTimeoutMs()
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
      throw error;
    }
  }

  public tryAcquire(
    scheduler: RequestScheduler,
    exclusivityClass: RequestExclusivityClass
  ): IRequestLease | undefined {
    return scheduler.tryAcquire({
      abortSignal: this.#abortController.signal,
      exclusivityClass,
      noWait: this.#admission?.noWait,
      waitTimeoutMs: this.#getRemainingWaitTimeoutMs()
    });
  }

  public dispose(): void {
    this.#client.abortSignal.removeEventListener('abort', this.#abortFromClient);
  }

  #getRemainingWaitTimeoutMs(): number | undefined {
    return this.#deadlineMs === undefined ? undefined : Math.max(0, this.#deadlineMs - Date.now());
  }
}

export function getRequestAdmissionErrorCode(
  error: RequestSchedulerError
): DaemonRequestAdmissionErrorCode {
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
    scheduler = new RequestScheduler();
    REQUEST_SCHEDULER_BY_SESSION.set(workspaceSession, scheduler);
  }
  return scheduler;
}
