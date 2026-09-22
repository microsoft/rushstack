// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonCommandResult } from './DaemonCommandResult';
import type { IDaemonPhasedRequestResult } from './DaemonPhasedRequest';
import type { IDaemonRequestEnvelope } from './DaemonRequestEnvelope';

/** Why a request was rejected before producing a command result. @beta */
export type DaemonRequestRejectionCode =
  | 'invalidRequest'
  | 'routingFailed'
  | 'unsupported'
  | 'workspaceRecreationRequired';

/** Starts one request after handshake and capability subscription. @beta */
export interface IDaemonRequestStartMessage {
  readonly kind: 'requestStart';
  readonly payload: IDaemonRequestEnvelope;
}

/** Cancels one active or queued request on this connection. @beta */
export interface IDaemonRequestCancelMessage {
  readonly kind: 'requestCancel';
  readonly payload: { readonly requestId: string };
}

/** Terminates a request that could not be routed or started. @beta */
export interface IDaemonRequestRejectedMessage {
  readonly kind: 'requestRejected';
  readonly payload: {
    readonly code: DaemonRequestRejectionCode;
    readonly message: string;
    readonly requestId: string;
  };
}

/** Delivers the authoritative final result after preceding request output drains. @beta */
export interface IDaemonRequestResultMessage {
  readonly kind: 'requestResult';
  readonly payload: IDaemonCommandResult | IDaemonPhasedRequestResult;
}
