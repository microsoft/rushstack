// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The payload shape of `extension` events: a namespaced name plus data.
 *
 * @beta
 */
export interface IDaemonExtensionEventPayload<TData = unknown> {
  /** The namespaced extension event name, for example `rushd.operation-stream-closed`. */
  readonly name: string;
  /** The extension's data. */
  readonly data: TData;
}

/** Extension event name: an operation's output stream was closed. @beta */
export const RUSHD_OPERATION_STREAM_CLOSED: 'rushd.operation-stream-closed' =
  'rushd.operation-stream-closed';

/** Extension event name: an operation's collated header was displayed. @beta */
export const RUSHD_OPERATION_HEADER: 'rushd.operation-header' = 'rushd.operation-header';

/** Data payload of a {@link RUSHD_OPERATION_STREAM_CLOSED} event. @beta */
export interface IDaemonOperationStreamClosedPayload {
  /** The operation whose stream closed. */
  readonly operationId: string;
}

/** Data payload of a {@link RUSHD_OPERATION_HEADER} event. @beta */
export interface IDaemonOperationHeaderPayload {
  /** The operation whose output was displayed. */
  readonly operationId: string;
  /** The 1-based count of operations displayed so far. */
  readonly completedOperations: number;
  /** The total operations in the iteration. */
  readonly totalOperations: number;
}
