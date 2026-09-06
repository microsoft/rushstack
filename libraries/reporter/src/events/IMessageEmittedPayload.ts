// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ReporterPrivacyClassification } from './ReporterPrivacyClassification';
import type { ReporterMessageSeverity } from '../producers/IScopedReporter';

/**
 * The payload of a `messageEmitted` event: a human-oriented message from a
 * scoped producer.
 *
 * @remarks
 * Message text is free-form and is the one place producers write arbitrary
 * presentation-adjacent strings. It never carries machine semantics — agents
 * and automation consume `diagnosticEmitted` instead. The envelope `privacy`
 * floor defaults to `local-sensitive` for messages so hand-written text fails
 * safe.
 *
 * @beta
 */
export interface IMessageEmittedPayload {
  /**
   * The severity of the message. Reporters map severity to their configured
   * log level: error/warning render at `quiet`, info at `normal`, debug at
   * `debug`.
   */
  readonly severity: ReporterMessageSeverity;

  /**
   * The human-readable message text.
   */
  readonly text: string;

  /**
   * The privacy classification of {@link IMessageEmittedPayload.text}.
   * Defaults to `local-sensitive`.
   */
  readonly privacy?: ReporterPrivacyClassification;
}
