// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonProtocolVersion } from './DaemonProtocolVersion';

/** The liveness reply. @beta */
export interface IDaemonPongMessage {
  readonly kind: 'pong';
  readonly payload: {
    readonly daemonVersion: string;
    readonly protocolVersion: IDaemonProtocolVersion;
    readonly uptimeMs: number;
  };
}
