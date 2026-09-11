// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonProtocolVersion } from './DaemonProtocolVersion';
import type { IDaemonWorkspaceStatus } from './DaemonWorkspaceStatus';

/** The liveness reply. @beta */
export interface IDaemonPongMessage {
  readonly kind: 'pong';
  readonly payload: {
    /** The daemon implementation version, when reported by protocol 0.2 or newer. */
    readonly daemonVersion?: string;
    /** The daemon wire protocol version, when reported by protocol 0.2 or newer. */
    readonly protocolVersion?: IDaemonProtocolVersion;
    /** The daemon process ID, when reported by protocol 0.6 or newer. */
    readonly pid?: number;
    /** The process's resident memory in bytes, when reported by protocol 0.6 or newer. */
    readonly residentMemoryBytes?: number;
    /** Optional generation and warm accounting; older peers may omit this snapshot. */
    readonly workspace?: IDaemonWorkspaceStatus;
    readonly uptimeMs: number;
  };
}
