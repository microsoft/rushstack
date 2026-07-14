// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';

/**
 * The fields of an event envelope that a producer supplies when emitting.
 *
 * @remarks
 * The sink assigns `eventId`, the authoritative `sequence`, and the `timestamp`,
 * so producers never provide them.
 *
 * @beta
 */
export type IReporterEmitEventInput<TPayload> = Omit<
  IReporterEventEnvelope<TPayload>,
  'eventId' | 'sequence' | 'timestamp'
>;

/**
 * The low-level typed, in-process channel that producers use to publish events.
 *
 * @remarks
 * The sink never exposes reporter implementations, destinations, or thresholds.
 * Producers publish immutable, JSON-serializable events and receive back only
 * the assigned event id.
 *
 * @beta
 */
export interface IReporterEventSink {
  /**
   * Publishes an event and returns its assigned event id.
   *
   * @param event - the event envelope without the sink-assigned `eventId`,
   * `sequence`, and `timestamp`
   * @returns the `eventId` assigned to the published event
   */
  emit<TPayload>(event: IReporterEmitEventInput<TPayload>): string;
}
