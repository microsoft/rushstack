// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  DaemonTerminalRequirement,
  IDaemonTerminalPolicyResult
} from '@rushstack/rush-daemon-protocol';

/**
 * A typed signal that a thin client must execute the command in-process.
 *
 * @beta
 */
export class DaemonRequiresInProcessError extends Error {
  public readonly policy: IDaemonTerminalPolicyResult;

  public constructor(policy: IDaemonTerminalPolicyResult) {
    super('The command requires a real controlling terminal and cannot run in the Rush daemon.');
    this.name = 'DaemonRequiresInProcessError';
    this.policy = policy;
  }
}

/** Evaluates the terminal requirement without probing or mutating daemon stdio. @beta */
export function evaluateDaemonTerminalPolicy(
  requestId: string,
  requirement: DaemonTerminalRequirement = 'none'
): IDaemonTerminalPolicyResult {
  if (requirement === 'controllingTerminal') {
    return {
      decision: 'requiresInProcess',
      reason: 'controllingTerminalRequired',
      requestId
    };
  }
  return { decision: 'runInDaemon', requestId };
}
