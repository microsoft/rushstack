// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** The terminal capability required by a resolved command. @beta */
export type DaemonTerminalRequirement = 'none' | 'interactiveInput' | 'controllingTerminal';

/** The server-side execution decision for a resolved command. @beta */
export type DaemonTerminalPolicyDecision = 'runInDaemon' | 'requiresInProcess';

/** Why a command cannot run in the daemon. @beta */
export type DaemonTerminalPolicyReason = 'controllingTerminalRequired';

/**
 * A request-scoped decision that a future thin client can use to select daemon or in-process execution.
 *
 * @beta
 */
export interface IDaemonTerminalPolicyResult {
  readonly decision: DaemonTerminalPolicyDecision;
  readonly reason?: DaemonTerminalPolicyReason;
  readonly requestId: string;
}
