// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';

/**
 * A single raw external-output chunk in the uncollated stream.
 *
 * @beta
 */
export interface IExternalOutputChunk {
  /**
   * The operation the chunk belongs to, when scoped.
   */
  readonly operationId?: string;

  /**
   * The originating stream.
   */
  readonly stream: string;

  /**
   * The raw text.
   */
  readonly text: string;
}

/**
 * Extracts the uncollated external-output chunks from an event stream, in order.
 *
 * @remarks
 * Problem matchers consume this uncollated source stream directly.
 *
 * @param events - the event stream
 *
 * @beta
 */
export function iterateExternalOutput(
  events: readonly IReporterEventEnvelope<unknown>[]
): IExternalOutputChunk[] {
  const chunks: IExternalOutputChunk[] = [];
  for (const event of events) {
    if (event.type === 'externalOutput') {
      const payload: { stream?: string; text?: string } = event.payload as {
        stream?: string;
        text?: string;
      };
      chunks.push({
        operationId: event.scope?.operationId,
        stream: payload.stream ?? 'stdout',
        text: payload.text ?? ''
      });
    }
  }
  return chunks;
}

/**
 * Regroups the uncollated external output by operation, reconstructing the
 * per-operation ordering that StreamCollator produced.
 *
 * @remarks
 * The detailed and file reporters use this to own grouping and buffering,
 * achieving parity with StreamCollator from the uncollated stream.
 *
 * @param events - the event stream
 *
 * @beta
 */
export function regroupOperationOutput(
  events: readonly IReporterEventEnvelope<unknown>[]
): Map<string, string> {
  const groups: Map<string, string> = new Map();
  for (const chunk of iterateExternalOutput(events)) {
    if (chunk.operationId === undefined) {
      continue;
    }
    groups.set(chunk.operationId, (groups.get(chunk.operationId) ?? '') + chunk.text);
  }
  return groups;
}
