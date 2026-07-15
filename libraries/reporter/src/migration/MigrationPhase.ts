// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The identifier of a reporter-overhaul migration phase.
 *
 * @remarks
 * The phases correspond to specification §8.1 "Migration Phases" and run in
 * order. The daemon-aligned major default flip is the phase with id
 * `daemonAlignedMajorFlip`.
 *
 * @beta
 */
export type ReporterMigrationPhaseId =
  | 'contractsAndBaselines'
  | 'bootstrapAndCompatAdapters'
  | 'shadowStructuredEmission'
  | 'optInReporters'
  | 'heftProtocolTrack'
  | 'daemonAlignedMajorFlip'
  | 'laterCleanupMajor';

/**
 * A single reporter-overhaul migration phase.
 *
 * @beta
 */
export interface IReporterMigrationPhase {
  /**
   * The phase identifier.
   */
  readonly id: ReporterMigrationPhaseId;

  /**
   * The 1-based order in which the phase ships.
   */
  readonly ordinal: number;

  /**
   * The human-readable phase title.
   */
  readonly title: string;

  /**
   * A short description of the phase's scope.
   */
  readonly summary: string;

  /**
   * Whether the phase can ship on its own, independent of later phases.
   *
   * @remarks
   * Every phase is independently releasable, per specification §8.1.
   */
  readonly independentlyReleasable: boolean;

  /**
   * Whether the phase can be reverted without reverting earlier phases.
   *
   * @remarks
   * Every phase is revertible, per specification §8.1.
   */
  readonly revertible: boolean;
}

/**
 * The ordered reporter-overhaul migration phases from specification §8.1.
 *
 * @remarks
 * Every phase is independently releasable and revertible, so a regression in a
 * later phase never forces reverting an earlier one and the daemon-aligned major
 * flip can be rolled back to the opt-in behavior of the previous phase.
 *
 * @beta
 */
export const REPORTER_MIGRATION_PHASES: readonly IReporterMigrationPhase[] = [
  {
    id: 'contractsAndBaselines',
    ordinal: 1,
    title: 'Contracts and baselines',
    summary: 'Publish @rushstack/reporter, freeze legacy snapshots, add protocol and compatibility goldens.',
    independentlyReleasable: true,
    revertible: true
  },
  {
    id: 'bootstrapAndCompatAdapters',
    ordinal: 2,
    title: 'Bootstrap and compatibility adapters',
    summary:
      'Add two-stage initialization and cross-version fallback while legacy rendering stays the sole visible output.',
    independentlyReleasable: true,
    revertible: true
  },
  {
    id: 'shadowStructuredEmission',
    ordinal: 3,
    title: 'Shadow structured emission',
    summary: 'Emit first-party lifecycle and diagnostic events without changing output; validate parity.',
    independentlyReleasable: true,
    revertible: true
  },
  {
    id: 'optInReporters',
    ordinal: 4,
    title: 'Opt-in reporters',
    summary:
      'Add file, plaintext, json, default, and ai reporters behind explicit CLI and an experimental setting.',
    independentlyReleasable: true,
    revertible: true
  },
  {
    id: 'heftProtocolTrack',
    ordinal: 5,
    title: 'Heft protocol track',
    summary: 'Support negotiated child descriptors and keep raw-stream compatibility for older Heft.',
    independentlyReleasable: true,
    revertible: true
  },
  {
    id: 'daemonAlignedMajorFlip',
    ordinal: 6,
    title: 'Daemon-aligned major default flip',
    summary:
      'Enable environment-based automatic selection by default, remove legacy terminal APIs, and gate ' +
      'incompatible plugins before apply() while retaining the legacy renderer, aliases, and sentinel bridge.',
    independentlyReleasable: true,
    revertible: true
  },
  {
    id: 'laterCleanupMajor',
    ordinal: 7,
    title: 'Later cleanup major',
    summary:
      'Remove the legacy renderer and the AlreadyReportedError bridge after a full major of default use and ' +
      'documented migration.',
    independentlyReleasable: true,
    revertible: true
  }
];

/**
 * Returns the migration phase with the given identifier.
 *
 * @param id - the phase identifier
 * @throws if the identifier is unknown
 *
 * @beta
 */
export function getReporterMigrationPhase(id: ReporterMigrationPhaseId): IReporterMigrationPhase {
  const phase: IReporterMigrationPhase | undefined = REPORTER_MIGRATION_PHASES.find(
    (candidate: IReporterMigrationPhase) => candidate.id === id
  );
  if (phase === undefined) {
    throw new Error(`Unknown reporter migration phase: ${JSON.stringify(id)}`);
  }
  return phase;
}
