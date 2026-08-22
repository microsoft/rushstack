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

export interface IAcquireWorkspaceRequestOptions {
  readonly admission: IDaemonRequestAdmissionOptions | undefined;
  readonly client: IRequestAdmissionClient;
  readonly exclusivityClass: RequestExclusivityClass;
  readonly requestId: string;
  readonly workspaceSession: IWorkspaceSession;
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

export async function acquireWorkspaceRequestLeaseAsync(
  options: IAcquireWorkspaceRequestOptions
): Promise<IRequestLease> {
  validateDaemonRequestAdmissionOptions(options.admission);
  const abortController: AbortController = new AbortController();
  const writer: QueuePositionWriter | undefined =
    options.client.supportsRequestAdmission === true
      ? new QueuePositionWriter(options.client, options.requestId, abortController)
      : undefined;
  const abortFromClient = (): void => abortController.abort(options.client.abortSignal.reason);
  if (options.client.abortSignal.aborted) {
    abortFromClient();
  } else {
    options.client.abortSignal.addEventListener('abort', abortFromClient, { once: true });
  }
  let lease: IRequestLease | undefined;
  try {
    lease = await getRequestScheduler(options.workspaceSession).acquireAsync({
      abortSignal: abortController.signal,
      exclusivityClass: options.exclusivityClass,
      noWait: options.admission?.noWait,
      onQueuePositionChanged: writer ? (position: number) => writer.enqueue(position) : undefined,
      waitTimeoutMs: options.admission?.waitTimeoutMs
    });
    await writer?.flushAsync();
    if (abortController.signal.aborted) {
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
  } finally {
    options.client.abortSignal.removeEventListener('abort', abortFromClient);
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

function getRequestScheduler(workspaceSession: IWorkspaceSession): RequestScheduler {
  let scheduler: RequestScheduler | undefined = REQUEST_SCHEDULER_BY_SESSION.get(workspaceSession);
  if (!scheduler) {
    scheduler = new RequestScheduler();
    REQUEST_SCHEDULER_BY_SESSION.set(workspaceSession, scheduler);
  }
  return scheduler;
}
