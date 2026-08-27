// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ReporterName } from './ReporterNames';
import type { IReporterSelection } from './ReporterSelection';

/**
 * A plaintext rendering variant.
 *
 * @remarks
 * CI uses the `detailed` variant, which retains StreamCollator-like operation
 * grouping; other non-TTY environments use the `concise` variant.
 *
 * @beta
 */
export type PlaintextVariant = 'detailed' | 'concise';

/**
 * A single reporter in an automatic selection plan.
 *
 * @beta
 */
export interface IReporterPlanEntry {
  /**
   * The reporter name.
   */
  readonly reporter: ReporterName;

  /**
   * Whether this is the primary reporter or an additional one.
   */
  readonly role: 'primary' | 'additional';

  /**
   * The destination the reporter owns, for example `stdout` or `file`.
   */
  readonly destination: string;

  /**
   * The plaintext variant, when the reporter is plaintext.
   */
  readonly variant?: PlaintextVariant;

  /**
   * Whether this is a machine reporter whose stdout carries payload records only.
   */
  readonly machine: boolean;
}

/**
 * A resolved automatic reporter plan.
 *
 * @beta
 */
export interface IAutomaticReporterPlan {
  /**
   * All reporters in the plan, primary first.
   */
  readonly entries: readonly IReporterPlanEntry[];

  /**
   * The primary reporter.
   */
  readonly primary: IReporterPlanEntry;

  /**
   * Whether stdout is owned by a machine reporter (payload only) or a human reporter.
   */
  readonly stdoutOwner: 'machine' | 'human';

  /**
   * Where human progress is written. Machine modes route it to stderr.
   */
  readonly humanProgressDestination: 'stdout' | 'stderr';

  /**
   * Where emergency diagnostics are written.
   */
  readonly emergencyDestination: 'stderr';

  /**
   * The reason the primary reporter was selected, recorded in the detailed log.
   */
  readonly reason: string;
}

/**
 * Returns `true` if the reporter is a machine reporter that owns stdout exclusively.
 *
 * @beta
 */
export function isMachineReporter(reporter: ReporterName): boolean {
  return reporter === 'json' || reporter === 'ai';
}

function toEntry(reporter: ReporterName, role: 'primary' | 'additional', reason: string): IReporterPlanEntry {
  const machine: boolean = isMachineReporter(reporter);
  const variant: PlaintextVariant | undefined =
    reporter === 'plaintext' ? (reason === 'CI detected' ? 'detailed' : 'concise') : undefined;
  return {
    reporter,
    role,
    destination: reporter === 'file' ? 'file' : 'stdout',
    variant,
    machine
  };
}

/**
 * Builds the automatic reporter plan from a resolved selection.
 *
 * @remarks
 * The matrix pairs `ai` with `file` for an agent, detailed `plaintext` with
 * `file` for CI, `default` with `file` for an interactive TTY, and concise
 * `plaintext` with `file` otherwise. When the primary is a machine reporter it
 * owns stdout exclusively and human progress moves to stderr. Emergency
 * diagnostics always use stderr.
 *
 * @param selection - the resolved reporter selection
 *
 * @beta
 */
export function planAutomaticReporters(selection: IReporterSelection): IAutomaticReporterPlan {
  const primary: IReporterPlanEntry = toEntry(selection.primaryReporter, 'primary', selection.reason);
  const additional: IReporterPlanEntry[] = selection.additionalReporters.map((reporter: ReporterName) =>
    toEntry(reporter, 'additional', selection.reason)
  );

  const stdoutOwner: 'machine' | 'human' = primary.machine ? 'machine' : 'human';
  const humanProgressDestination: 'stdout' | 'stderr' = primary.machine ? 'stderr' : 'stdout';

  return {
    entries: [primary, ...additional],
    primary,
    stdoutOwner,
    humanProgressDestination,
    emergencyDestination: 'stderr',
    reason: selection.reason
  };
}

/**
 * Describes a reporter plan for the detailed log.
 *
 * @param plan - the plan to describe
 *
 * @beta
 */
export function describeReporterPlan(plan: IAutomaticReporterPlan): string {
  const describeEntry = (entry: IReporterPlanEntry): string => {
    const variant: string = entry.variant ? `[${entry.variant}]` : '';
    return `${entry.reporter}${variant}->${entry.destination}`;
  };
  const additional: string = plan.entries
    .filter((entry: IReporterPlanEntry) => entry.role === 'additional')
    .map(describeEntry)
    .join(', ');
  return (
    `Reporter selection (${plan.reason}): primary ${describeEntry(plan.primary)}; ` +
    `additional [${additional}]; stdout owned by ${plan.stdoutOwner}; ` +
    `human progress -> ${plan.humanProgressDestination}.`
  );
}
