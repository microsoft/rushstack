// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { decodeDaemonStdinChunk } from '@rushstack/rush-daemon-protocol';
import type { IDaemonSetRawModeMessage } from '@rushstack/rush-daemon-protocol';

import { MAX_REQUESTS_PER_CONNECTION } from './DaemonConnectionLimits';

/** Why an incoming stdin frame cannot be routed. @beta */
export type InteractiveInputRoutingErrorCode =
  | 'duplicateRequest'
  | 'unknownRequest'
  | 'completedRequest'
  | 'nonInteractiveRequest'
  | 'requestLimitExceeded';

/** A request-scoped stdin routing failure. @beta */
export class InteractiveInputRoutingError extends Error {
  public readonly code: InteractiveInputRoutingErrorCode;

  public constructor(code: InteractiveInputRoutingErrorCode, message: string) {
    super(message);
    this.name = 'InteractiveInputRoutingError';
    this.code = code;
  }
}

/** A backpressured destination for arbitrary stdin bytes. @beta */
export interface IInteractiveRequestInputSink {
  writeInputAsync(chunk: Uint8Array): Promise<void>;
}

/** A client-side terminal control destination for one daemon request. @beta */
export interface IInteractiveRequestControlClient {
  readonly abortSignal: AbortSignal;
  /** Resolves after the thin client acknowledges that it applied the requested terminal state. */
  writeRawModeControlAsync(message: IDaemonSetRawModeMessage): Promise<void>;
}

/** Registration options for one request on a connection-scoped input router. @beta */
export interface IInteractiveRequestRegistrationOptions {
  readonly acceptsStdin: boolean;
  readonly client: IInteractiveRequestControlClient;
  readonly onFailure: (error: Error) => void;
  readonly requestId: string;
}

/** The request-owned interactive lifecycle exposed to command integrations. @beta */
export interface IInteractiveRequestSession {
  readonly requestId: string;
  attachInputSink(sink: IInteractiveRequestInputSink): Disposable;
  finishAsync(): Promise<void>;
  setRawModeAsync(enabled: boolean): Promise<void>;
}

interface IRequestState {
  readonly acceptsStdin: boolean;
  readonly client: IInteractiveRequestControlClient;
  readonly onAbort: () => void;
  readonly onFailure: (error: Error) => void;
  accepting: boolean;
  failure: Error | undefined;
  inputSink: IInteractiveRequestInputSink | undefined;
  inputTail: Promise<void>;
  pendingInputBytes: number;
  pendingInputFrameCount: number;
  rawModeRequested: boolean;
  rawModeTail: Promise<void>;
  requestId: string;
  sinkWaiters: Array<{
    readonly reject: (error: Error) => void;
    readonly resolve: (sink: IInteractiveRequestInputSink) => void;
  }>;
}

const MAX_PENDING_INPUT_BYTES: number = 1024 * 1024;
const MAX_PENDING_INPUT_FRAMES: number = 256;
const requestInputFailures: WeakSet<Error> = new WeakSet();

/** @internal */
export function isInteractiveRequestInputFailure(error: unknown): error is Error {
  return error instanceof Error && requestInputFailures.has(error);
}

class InteractiveRequestSession implements IInteractiveRequestSession {
  readonly #state: IRequestState;
  readonly #onFinished: () => void;
  #finishPromise: Promise<void> | undefined;

  public constructor(state: IRequestState, onFinished: () => void) {
    this.#state = state;
    this.#onFinished = onFinished;
  }

  public get requestId(): string {
    return this.#state.requestId;
  }

  public attachInputSink(sink: IInteractiveRequestInputSink): Disposable {
    const state: IRequestState = this.#state;
    assertAcceptingInput(state);
    if (state.inputSink) {
      throw new Error(`Interactive request "${state.requestId}" already has an input sink.`);
    }
    state.inputSink = sink;
    for (const waiter of state.sinkWaiters.splice(0)) {
      waiter.resolve(sink);
    }
    return {
      [Symbol.dispose]: (): void => {
        if (state.inputSink === sink) {
          state.inputSink = undefined;
        }
      }
    };
  }

  public setRawModeAsync(enabled: boolean): Promise<void> {
    const state: IRequestState = this.#state;
    if (!state.accepting) {
      return Promise.reject(createRoutingError('completedRequest', state.requestId));
    }
    if (!state.acceptsStdin) {
      return Promise.reject(createRoutingError('nonInteractiveRequest', state.requestId));
    }
    if (enabled) {
      state.rawModeRequested = true;
    }
    return queueRawModeAsync(state, enabled);
  }

  public finishAsync(): Promise<void> {
    const state: IRequestState = this.#state;
    stopAcceptingInput(state);
    this.#finishPromise ??= finishStateAsync(state).finally(this.#onFinished);
    return this.#finishPromise;
  }
}

/**
 * Routes request-tagged stdin frames with per-request ordering and backpressure.
 *
 * @remarks
 * One instance belongs to one client connection. Completed request records remain as tombstones so late stdin is
 * rejected distinctly from input for an unknown request.
 *
 * @beta
 */
export class InteractiveRequestInputRouter {
  readonly #stateByRequestId: Map<string, IRequestState> = new Map();
  readonly #completedRequestIds: Set<string> = new Set();

  public register(options: IInteractiveRequestRegistrationOptions): IInteractiveRequestSession {
    validateRequestId(options.requestId);
    if (this.#stateByRequestId.has(options.requestId) || this.#completedRequestIds.has(options.requestId)) {
      throw createRoutingError('duplicateRequest', options.requestId);
    }
    this.#assertRequestCapacity(options.requestId);
    const state: IRequestState = createRequestState(options);
    this.#stateByRequestId.set(options.requestId, state);
    return new InteractiveRequestSession(state, () => this.#completeRequest(options.requestId, state));
  }

  /** Records a request rejected before an interactive session was created. @internal */
  public markRequestCompleted(requestId: string): void {
    validateRequestId(requestId);
    if (this.#stateByRequestId.has(requestId)) {
      throw createRoutingError('duplicateRequest', requestId);
    }
    if (this.#completedRequestIds.has(requestId)) {
      return;
    }
    this.#assertRequestCapacity(requestId);
    this.#completedRequestIds.add(requestId);
  }

  public async routeStdinFrameAsync(payload: Uint8Array): Promise<void> {
    const { chunk, requestId } = decodeDaemonStdinChunk(payload);
    const state: IRequestState | undefined = this.#stateByRequestId.get(requestId);
    if (!state) {
      if (this.#completedRequestIds.has(requestId)) {
        throw createRoutingError('completedRequest', requestId);
      }
      throw createRoutingError('unknownRequest', requestId);
    }
    await queueInputAsync(state, chunk);
  }

  #completeRequest(requestId: string, state: IRequestState): void {
    if (this.#stateByRequestId.get(requestId) !== state) {
      return;
    }
    this.#stateByRequestId.delete(requestId);
    this.markRequestCompleted(requestId);
  }

  #assertRequestCapacity(requestId: string): void {
    if (this.#stateByRequestId.size + this.#completedRequestIds.size >= MAX_REQUESTS_PER_CONNECTION) {
      throw createRoutingError('requestLimitExceeded', requestId);
    }
  }
}

function createRequestState(options: IInteractiveRequestRegistrationOptions): IRequestState {
  const state: IRequestState = {
    acceptsStdin: options.acceptsStdin,
    accepting: !options.client.abortSignal.aborted,
    client: options.client,
    failure: undefined,
    inputSink: undefined,
    inputTail: Promise.resolve(),
    onAbort: () => stopAcceptingInput(state),
    onFailure: options.onFailure,
    pendingInputBytes: 0,
    pendingInputFrameCount: 0,
    rawModeRequested: false,
    rawModeTail: Promise.resolve(),
    requestId: options.requestId,
    sinkWaiters: []
  };
  options.client.abortSignal.addEventListener('abort', state.onAbort, { once: true });
  return state;
}

function queueInputAsync(state: IRequestState, chunk: Uint8Array): Promise<void> {
  assertAcceptingInput(state);
  reserveInputCapacity(state, chunk.byteLength);
  const writePromise: Promise<void> = state.inputTail.then(async () => {
    assertAcceptingInput(state);
    const sink: IInteractiveRequestInputSink = await getInputSinkAsync(state);
    assertAcceptingInput(state);
    try {
      await sink.writeInputAsync(chunk);
    } catch (error) {
      const normalizedError: Error = createInputFailure(error);
      failState(state, normalizedError);
      throw normalizedError;
    }
  });
  const trackedPromise: Promise<void> = writePromise.finally(() =>
    releaseInputCapacity(state, chunk.byteLength)
  );
  state.inputTail = trackedPromise.catch((error: unknown) => handleQueuedInputError(state, error));
  return trackedPromise;
}

function getInputSinkAsync(state: IRequestState): Promise<IInteractiveRequestInputSink> {
  if (state.inputSink) {
    return Promise.resolve(state.inputSink);
  }
  return new Promise<IInteractiveRequestInputSink>((resolve, reject) => {
    state.sinkWaiters.push({ reject, resolve });
  });
}

function queueRawModeAsync(state: IRequestState, enabled: boolean): Promise<void> {
  const message: IDaemonSetRawModeMessage = {
    kind: 'setRawMode',
    payload: { enabled, requestId: state.requestId }
  };
  const writePromise: Promise<void> = state.rawModeTail.then(() =>
    state.client.writeRawModeControlAsync(message)
  );
  state.rawModeTail = writePromise.catch((error: unknown) => failState(state, error));
  return writePromise;
}

async function finishStateAsync(state: IRequestState): Promise<void> {
  state.client.abortSignal.removeEventListener('abort', state.onAbort);
  await state.inputTail;
  if (state.rawModeRequested) {
    await queueRawModeAsync(state, false);
  }
  await state.rawModeTail;
  if (state.failure) {
    throw state.failure;
  }
}

function assertAcceptingInput(state: IRequestState): void {
  if (!state.accepting) {
    throw createRoutingError('completedRequest', state.requestId);
  }
  if (!state.acceptsStdin) {
    throw createRoutingError('nonInteractiveRequest', state.requestId);
  }
  if (state.failure) {
    throw state.failure;
  }
}

function failState(state: IRequestState, error: unknown): void {
  const normalizedError: Error = normalizeError(error);
  if (!state.failure) {
    state.failure = normalizedError;
    stopAcceptingInput(state);
    state.onFailure(normalizedError);
  }
}

function reserveInputCapacity(state: IRequestState, byteLength: number): void {
  if (
    state.pendingInputFrameCount >= MAX_PENDING_INPUT_FRAMES ||
    state.pendingInputBytes + byteLength > MAX_PENDING_INPUT_BYTES
  ) {
    const error: Error = createInputFailure(
      new Error(`Interactive request "${state.requestId}" exceeded its pending stdin buffer limit.`)
    );
    failState(state, error);
    throw error;
  }
  state.pendingInputBytes += byteLength;
  state.pendingInputFrameCount++;
}

function releaseInputCapacity(state: IRequestState, byteLength: number): void {
  state.pendingInputBytes -= byteLength;
  state.pendingInputFrameCount--;
}

function handleQueuedInputError(state: IRequestState, error: unknown): void {
  if (!(error instanceof InteractiveInputRoutingError) && !isInteractiveRequestInputFailure(error)) {
    failState(state, error);
  }
}

function createInputFailure(error: unknown): Error {
  const normalizedError: Error = normalizeError(error);
  requestInputFailures.add(normalizedError);
  return normalizedError;
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function stopAcceptingInput(state: IRequestState): void {
  state.accepting = false;
  const error: InteractiveInputRoutingError = createRoutingError('completedRequest', state.requestId);
  for (const waiter of state.sinkWaiters.splice(0)) {
    waiter.reject(error);
  }
}

function validateRequestId(requestId: string): void {
  if (requestId.length === 0 || requestId.trim() !== requestId) {
    throw new Error(`Invalid interactive request id: "${requestId}".`);
  }
}

function createRoutingError(
  code: InteractiveInputRoutingErrorCode,
  requestId: string
): InteractiveInputRoutingError {
  const message: string =
    code === 'requestLimitExceeded'
      ? `Cannot register request "${requestId}": the connection request limit was exceeded.`
      : `Cannot route stdin for request "${requestId}": ${code}.`;
  return new InteractiveInputRoutingError(code, message);
}
