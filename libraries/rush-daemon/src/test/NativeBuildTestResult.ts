// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IOperationGraph } from '@microsoft/rush-lib';
import {
  DaemonFrameType,
  decodeDaemonEventFrame,
  decodeDaemonLogChunk
} from '@rushstack/rush-daemon-protocol';

import type { ITerminalExchange } from './DaemonRequestWireTestUtilities';

/** Preserve the actual operation failure, not merely a Jest diff showing exitCode 1. */
export function assertSuccessfulNativeBuild(exchange: ITerminalExchange, graph?: IOperationGraph): void {
  if (exchange.terminal.kind === 'requestResult' && exchange.terminal.payload.exitCode === 0) return;
  const details: string[] = ['Native build failed:', JSON.stringify(exchange.terminal, undefined, 2)];
  const events: string[] = [];
  for (const frame of exchange.frames) {
    if (frame.kind === DaemonFrameType.logStdout || frame.kind === DaemonFrameType.logStderr) {
      const { operationId, chunk } = decodeDaemonLogChunk(frame.payload);
      details.push(
        `[${frame.kind === DaemonFrameType.logStdout ? 'stdout' : 'stderr'} ${operationId}]\n${new TextDecoder().decode(chunk)}`
      );
    } else if (frame.kind === DaemonFrameType.event) {
      events.push(JSON.stringify(decodeDaemonEventFrame(frame.payload), undefined, 2));
    }
  }
  for (const record of graph?.resultByOperation.values() ?? []) {
    if (record.error) {
      details.push(`[${record.operation.name}] ${record.error.stack ?? record.error.message}`);
    }
  }
  throw new Error([...details, ...events].join('\n'));
}
