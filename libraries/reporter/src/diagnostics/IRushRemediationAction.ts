// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Classifies whether a remediation action is safe to execute automatically.
 *
 * @remarks
 * - `safe` actions may be executed without user confirmation.
 * - `requires-confirmation` actions may be executed only after explicit user consent.
 * - `unsafe` actions must never be executed automatically and are shown for
 *   manual follow-up only.
 *
 * @beta
 */
export type RushRemediationSafety = 'safe' | 'requires-confirmation' | 'unsafe';

/**
 * A suggested action that may resolve a diagnostic.
 *
 * @remarks
 * A remediation action may offer a command to run, a documentation URL, or both.
 * Its {@link IRushRemediationAction.automatedExecutionSafety | safety
 * classification} states whether an agent may execute the command automatically.
 *
 * @beta
 */
export interface IRushRemediationAction {
  /**
   * The resource key of the human-readable description of this action.
   */
  readonly descriptionKey: string;

  /**
   * The resource key of an optional prompt that an agent or user can follow
   * to perform this remediation.
   *
   * @remarks
   * When the specific remediation is not obvious to the agent or user -- for
   * example, when a user misconfigured their package authentication and the
   * corrective steps depend on their environment -- the producer propagates
   * the remediation as a prompt rather than as a bare command.
   */
  readonly promptKey?: string;

  /**
   * An optional shell command that performs the remediation.
   */
  readonly command?: string;

  /**
   * An optional documentation URL describing the remediation.
   */
  readonly documentationUrl?: string;

  /**
   * Whether this action is safe to execute automatically.
   */
  readonly automatedExecutionSafety: RushRemediationSafety;
}
