// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// TODO(reconcile): align with `@rushstack/reporter`'s payload vocabulary once
// that package merges into main (#5858).

/**
 * Payload of an `operationRegistered` event: one operation known to the engine.
 *
 * @beta
 */
export interface IDaemonOperationRegisteredPayload {
  /** The operation identifier (also the display name today). */
  readonly operationId: string;
  /** Whether the operation is silent (excluded from progress totals). */
  readonly silent?: boolean;
}

/**
 * Payload of an `operationStatusChanged` event.
 *
 * @remarks
 * `status` carries the engine's raw status string (for example `SUCCESS` or
 * `FAILURE`) so no information is lost versus the legacy colorized text.
 *
 * @beta
 */
export interface IDaemonOperationStatusChangedPayload {
  /** The operation whose status changed. */
  readonly operationId: string;
  /** The new raw engine status string. */
  readonly status: string;
  /** The previous raw engine status string, when known. */
  readonly previousStatus?: string;
}

/**
 * Payload of an `activityChanged` event: a human-oriented status line.
 *
 * @beta
 */
export interface IDaemonActivityPayload {
  /** The activity text (for example the summary lines). */
  readonly text: string;
  /** The stream the line was written to. Defaults to `stdout`. */
  readonly stream?: 'stdout' | 'stderr';
}
