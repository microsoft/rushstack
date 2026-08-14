// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* eslint-disable @typescript-eslint/consistent-type-definitions --
 * Payloads are `type` aliases (not interfaces) on purpose: interfaces have no
 * implicit index signature, so they are not assignable to the recursive
 * ReporterJsonValue contract that these payloads must satisfy. */

import type { ReporterJsonValue } from './ReporterJsonValue';
import type { ReporterEventType } from './ReporterEventType';
import type { IReporterEventEnvelope } from './IReporterEventEnvelope';

/**
 * The lifecycle status of a single operation, carried by an
 * {@link IOperationStatusChangedPayload}.
 *
 * @remarks
 * The set is intentionally additive: as more producers adopt structured status
 * reporting, new values are expected. Consumers must not treat it as exhaustive
 * (for example, always provide a fallback branch when switching over statuses).
 * The status never selects the process exit code.
 *
 * @beta
 */
export type ReporterOperationStatus =
  | 'ready'
  | 'executing'
  | 'success'
  | 'success-with-warnings'
  | 'skipped'
  | 'from-cache'
  | 'blocked'
  | 'failure'
  | 'no-op';

/**
 * The payload of a `commandStarted` event.
 *
 * @remarks
 * Declared as a type alias (rather than an interface) so that it carries an
 * implicit index signature and is therefore assignable to
 * {@link ReporterJsonValue}, which the producer sink requires.
 *
 * @beta
 */
export type ICommandStartedPayload = {
  /**
   * The name of the Rush command that started, for example `build`.
   */
  readonly commandName: string;

  /**
   * The command-line arguments the command was invoked with.
   */
  readonly argv: readonly string[];
};

/**
 * The payload of an `externalOutput` event, one ordered chunk of a child
 * process's standard stream.
 *
 * @beta
 */
export type IExternalOutputPayload = {
  /**
   * The standard stream the chunk was read from.
   */
  readonly stream: 'stdout' | 'stderr';

  /**
   * The raw, losslessly-preserved text of the chunk.
   */
  readonly text: string;
};

/**
 * The payload of an `operationStatusChanged` event.
 *
 * @remarks
 * The operation, project, and phase the status belongs to are identified by the
 * envelope {@link IReporterEventEnvelope.scope | scope}, so this payload carries
 * only the new status and optional timing.
 *
 * @beta
 */
export type IOperationStatusChangedPayload = {
  /**
   * The new status of the operation.
   */
  readonly status: ReporterOperationStatus;

  /**
   * The wall-clock duration of the operation so far, in milliseconds, when known.
   */
  readonly durationMs?: number;
};

/**
 * The payload of an `activityChanged` event, a replaceable progress or liveness
 * snapshot.
 *
 * @remarks
 * Activity events are coalescible: under back-pressure a newer snapshot
 * supersedes an unsent older one, so every field is optional and the payload
 * must remain safe to drop.
 *
 * @beta
 */
export type IActivityChangedPayload = {
  /**
   * The number of operations that have completed so far, when known.
   */
  readonly completedOperationCount?: number;

  /**
   * The total number of operations in the run, when known.
   */
  readonly totalOperationCount?: number;

  /**
   * The number of operations currently executing, when known.
   */
  readonly activeOperationCount?: number;

  /**
   * A short, presentation-free activity label, when available.
   */
  readonly text?: string;
};

/**
 * The payload of an `artifactAvailable` event.
 *
 * @remarks
 * Artifacts (such as a full-detail log file) are referenced elsewhere by
 * {@link IArtifactAvailablePayload.artifactId | artifactId}, for example from a
 * diagnostic's related-artifact list.
 *
 * @beta
 */
export type IArtifactAvailablePayload = {
  /**
   * The stable identifier other events and diagnostics use to reference the artifact.
   */
  readonly artifactId: string;

  /**
   * The kind of artifact, for example `log`.
   */
  readonly kind: string;

  /**
   * Whether the artifact was produced successfully and can be consumed.
   */
  readonly available: boolean;

  /**
   * The path to the artifact. Paths are `local-sensitive` and never enter telemetry.
   */
  readonly path?: string;
};

/**
 * Correlates each {@link ReporterEventType} with the shape of its event payload.
 *
 * @remarks
 * This closes the structural gap between the `type` discriminant and the
 * otherwise-independent `payload` of {@link IReporterEventEnvelope}, so
 * consumers can narrow a payload from its type instead of blind-casting. Event
 * types that do not yet have a defined payload shape (including the generic
 * `extension` channel) map to {@link ReporterJsonValue}. Every mapped payload is
 * assignable to {@link ReporterJsonValue}.
 *
 * @beta
 */
export interface IReporterEventPayloadMap {
  readonly sessionStarted: ReporterJsonValue;
  readonly sessionCompleted: ReporterJsonValue;
  readonly commandStarted: ICommandStartedPayload;
  readonly commandCompleted: ReporterJsonValue;
  readonly operationRegistered: ReporterJsonValue;
  readonly operationStatusChanged: IOperationStatusChangedPayload;
  readonly activityChanged: IActivityChangedPayload;
  readonly watchCycleCompleted: ReporterJsonValue;
  /**
   * Conveys an `IRushDiagnostic`-shaped object. Typed as {@link ReporterJsonValue}
   * so the map stays JSON-assignable; consumers narrow it to `IRushDiagnostic`.
   */
  readonly diagnosticEmitted: ReporterJsonValue;
  readonly externalProcessStarted: ReporterJsonValue;
  readonly externalOutput: IExternalOutputPayload;
  readonly externalProcessCompleted: ReporterJsonValue;
  readonly artifactAvailable: IArtifactAvailablePayload;
  readonly commandResult: ReporterJsonValue;
  readonly extension: ReporterJsonValue;
}

/**
 * A {@link IReporterEventEnvelope} whose `type` and `payload` are correlated for
 * a specific {@link ReporterEventType}.
 *
 * @remarks
 * `IReporterEventEnvelopeFor<'commandStarted'>` narrows `type` to the literal
 * `'commandStarted'` and `payload` to {@link ICommandStartedPayload}, which lets
 * a consumer switch on `type` and read a strongly-typed `payload` without a
 * cast.
 *
 * @beta
 */
export type IReporterEventEnvelopeFor<TType extends ReporterEventType> = Omit<
  IReporterEventEnvelope<IReporterEventPayloadMap[TType]>,
  'type'
> & {
  /**
   * The specific event type this envelope carries.
   */
  readonly type: TType;
};
