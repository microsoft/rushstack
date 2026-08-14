// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { DaemonFrameType } from './DaemonFrameType';

/**
 * A single decoded wire frame: a type byte plus its opaque payload bytes.
 *
 * @remarks
 * The frame layer never interprets payloads. Interpretation (JSON control
 * messages, id-tagged log chunks, event envelopes) belongs to the message
 * layer, so that raw log and stdin bytes round-trip losslessly, including
 * non-UTF-8 content.
 *
 * @beta
 */
export interface IDaemonFrame {
  /**
   * The frame type byte.
   */
  readonly type: DaemonFrameType;

  /**
   * The payload bytes. Never a view onto a larger shared buffer.
   */
  readonly payload: Buffer;
}
