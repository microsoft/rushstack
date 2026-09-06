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
