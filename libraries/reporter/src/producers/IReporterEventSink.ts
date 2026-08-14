// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import type { ReporterJsonValue } from '../events/ReporterJsonValue';

/**
 * The fields of an event envelope that a producer supplies when emitting.
 *
 * @remarks
 * The sink assigns `eventId`, the authoritative `sequence`, `sourceSequence`,
 * and the `timestamp`, so producers never provide them.
 *
 * `TPayload` is not constrained on this input alias so that it mirrors the
 * wire-tolerant {@link IReporterEventEnvelope} and remains usable by the generic
 * `ReporterManager.emit` implementation. The JSON-serializability requirement is
 * enforced at the boundary that matters — {@link IReporterEventSink.emit} — so a
 * non-JSON payload is rejected when an event is actually published.
 *
 * @beta
 */
export type IReporterEmitEventInput<TPayload> = Omit<
  IReporterEventEnvelope<TPayload>,
  'eventId' | 'sequence' | 'sourceSequence' | 'timestamp'
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
   * @remarks
   * `TPayload` is constrained to {@link ReporterJsonValue} so that a payload that
   * cannot survive NDJSON encoding — such as a `Map`, a function, or a `bigint` —
   * is rejected at compile time rather than silently corrupted on the wire.
   *
   * @param event - the event envelope without the sink-assigned `eventId`,
   * `sequence`, `sourceSequence`, and `timestamp`
   * @returns the `eventId` assigned to the published event
   */
  emit<TPayload extends ReporterJsonValue>(event: IReporterEmitEventInput<TPayload>): string;
}
