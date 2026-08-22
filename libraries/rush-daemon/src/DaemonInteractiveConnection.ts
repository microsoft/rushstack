// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  DaemonControlMessage,
  IDaemonRawModeChangedMessage,
  IDaemonSetRawModeMessage,
  IDaemonTerminalPolicyResult
} from '@rushstack/rush-daemon-protocol';

import {
  InteractiveRequestInputRouter
} from './InteractiveRequestInputRouter';
import type {
  IInteractiveRequestControlClient,
  IInteractiveRequestSession
} from './InteractiveRequestInputRouter';

interface IRawModeAcknowledgement {
  readonly enabled: boolean;
  readonly reject: (error: Error) => void;
  readonly resolve: () => void;
}

interface IRawModeWaiter {
  readonly acknowledgement: IRawModeAcknowledgement;
  readonly promise: Promise<void>;
}

/** Options for registering one command with its connection-owned input router. @beta */
export interface IDaemonInteractiveRequestOptions {
  readonly abortSignal: AbortSignal;
  readonly acceptsStdin: boolean;
  readonly onFailure: (error: Error) => void;
  readonly requestId: string;
}

/** Interactive I/O services owned by one live daemon connection. @beta */
export interface IDaemonInteractiveConnection {
  readonly abortSignal: AbortSignal;
  registerRequest(options: IDaemonInteractiveRequestOptions): IInteractiveRequestSession;
  writeTerminalPolicyAsync(result: IDaemonTerminalPolicyResult): Promise<void>;
}

type SendDaemonControlMessageAsync = (message: DaemonControlMessage) => Promise<void>;

/** Implements request input and acknowledged raw-mode control for one live connection. @internal */
export class DaemonInteractiveConnection implements IDaemonInteractiveConnection {
  readonly #abortController: AbortController = new AbortController();
  readonly #inputRouter: InteractiveRequestInputRouter = new InteractiveRequestInputRouter();
  readonly #pendingRawModeByRequestId: Map<string, IRawModeAcknowledgement> = new Map();
  readonly #sendControlMessageAsync: SendDaemonControlMessageAsync;
  #enabled: boolean = false;

  public constructor(sendControlMessageAsync: SendDaemonControlMessageAsync) {
    this.#sendControlMessageAsync = sendControlMessageAsync;
  }

  public get abortSignal(): AbortSignal {
    return this.#abortController.signal;
  }

  public setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
  }

  public registerRequest(options: IDaemonInteractiveRequestOptions): IInteractiveRequestSession {
    if (options.acceptsStdin) {
      this.#assertEnabled();
    }
    const requestAbortSignal: AbortSignal = AbortSignal.any([this.abortSignal, options.abortSignal]);
    const client: IInteractiveRequestControlClient = {
      abortSignal: requestAbortSignal,
      writeRawModeControlAsync: (message: IDaemonSetRawModeMessage): Promise<void> =>
        this.#writeRawModeControlAsync(message, requestAbortSignal)
    };
    return this.#inputRouter.register({ ...options, client });
  }

  public routeStdinFrameAsync(payload: Uint8Array): Promise<void> {
    this.#assertEnabled();
    return this.#inputRouter.routeStdinFrameAsync(payload);
  }

  public handleControlMessage(message: DaemonControlMessage): boolean {
    if (message.kind !== 'rawModeChanged') {
      return false;
    }
    this.#assertEnabled();
    this.#acknowledgeRawMode(message);
    return true;
  }

  public writeTerminalPolicyAsync(result: IDaemonTerminalPolicyResult): Promise<void> {
    this.#assertEnabled();
    return this.#sendControlMessageAsync({ kind: 'terminalPolicy', payload: result });
  }

  public close(error: Error | undefined): void {
    const reason: Error = error ?? new Error('The daemon client connection closed.');
    this.#abortController.abort(reason);
    for (const acknowledgement of this.#pendingRawModeByRequestId.values()) {
      acknowledgement.reject(reason);
    }
    this.#pendingRawModeByRequestId.clear();
  }

  async #writeRawModeControlAsync(
    message: IDaemonSetRawModeMessage,
    requestAbortSignal: AbortSignal
  ): Promise<void> {
    this.#assertEnabled();
    if (this.#pendingRawModeByRequestId.has(message.payload.requestId)) {
      throw new Error(`Request "${message.payload.requestId}" already has a pending raw-mode change.`);
    }
    const abortSignal: AbortSignal = message.payload.enabled
      ? requestAbortSignal
      : this.abortSignal;
    if (abortSignal.aborted) {
      throw normalizeAbortReason(abortSignal);
    }
    const { acknowledgement, promise }: IRawModeWaiter = createRawModeWaiter(
      message.payload.enabled,
      abortSignal,
      () => this.#pendingRawModeByRequestId.delete(message.payload.requestId)
    );
    this.#pendingRawModeByRequestId.set(message.payload.requestId, acknowledgement);
    if (abortSignal.aborted) {
      acknowledgement.reject(normalizeAbortReason(abortSignal));
      return await promise;
    }
    try {
      await this.#sendControlMessageAsync(message);
    } catch (error) {
      acknowledgement.reject(normalizeError(error));
    }
    await promise;
  }

  #acknowledgeRawMode(message: IDaemonRawModeChangedMessage): void {
    const acknowledgement: IRawModeAcknowledgement | undefined =
      this.#pendingRawModeByRequestId.get(message.payload.requestId);
    if (!acknowledgement || acknowledgement.enabled !== message.payload.enabled) {
      throw new Error(`Unexpected raw-mode acknowledgement for request "${message.payload.requestId}".`);
    }
    acknowledgement.resolve();
  }

  #assertEnabled(): void {
    if (!this.#enabled) {
      throw new Error('The daemon client did not negotiate request-scoped interactive I/O.');
    }
    if (this.abortSignal.aborted) {
      throw this.abortSignal.reason;
    }
  }
}

function createRawModeWaiter(
  enabled: boolean,
  abortSignal: AbortSignal,
  onSettled: () => void
): IRawModeWaiter {
  let resolvePromise: () => void = () => undefined;
  let rejectPromise: (error: Error) => void = () => undefined;
  const promise: Promise<void> = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  let removeAbortListener: () => void = () => undefined;
  const settle = (callback: () => void): void => {
    removeAbortListener();
    onSettled();
    callback();
  };
  const acknowledgement: IRawModeAcknowledgement = {
    enabled,
    reject: (error: Error) => settle(() => rejectPromise(error)),
    resolve: () => settle(resolvePromise)
  };
  const onAbort = (): void => acknowledgement.reject(normalizeAbortReason(abortSignal));
  removeAbortListener = () => abortSignal.removeEventListener('abort', onAbort);
  abortSignal.addEventListener('abort', onAbort, { once: true });
  return { acknowledgement, promise };
}

function normalizeAbortReason(abortSignal: AbortSignal): Error {
  return normalizeError(abortSignal.reason ?? new Error('The interactive request was aborted.'));
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
