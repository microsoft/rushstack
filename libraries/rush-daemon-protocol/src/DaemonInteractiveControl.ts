// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonTerminalPolicyResult } from './DaemonTerminalPolicy';

/** Asks the thin client to change raw mode for one active request. @beta */
export interface IDaemonSetRawModeMessage {
  readonly kind: 'setRawMode';
  readonly payload: {
    readonly enabled: boolean;
    readonly requestId: string;
  };
}

/** Confirms that the thin client applied a request-scoped raw-mode change. @beta */
export interface IDaemonRawModeChangedMessage {
  readonly kind: 'rawModeChanged';
  readonly payload: {
    readonly enabled: boolean;
    readonly requestId: string;
  };
}

/** Reports whether a command can run in the daemon or requires client-side fallback. @beta */
export interface IDaemonTerminalPolicyMessage {
  readonly kind: 'terminalPolicy';
  readonly payload: IDaemonTerminalPolicyResult;
}
