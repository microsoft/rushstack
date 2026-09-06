// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonOperationHeaderPayload } from '@rushstack/rush-daemon-protocol';
import type { CollatedTerminal, CollatedWriter } from '@rushstack/stream-collator';

import type { OperationHeaderTracker } from './OperationHeaderTracker';
import { formatDaemonOperationHeader } from './RendererHeader';

const EMPTY_LINE: string = '';

export function writeOperationStreamHeader(
  writer: CollatedWriter | undefined,
  headers: OperationHeaderTracker,
  terminal: CollatedTerminal,
  quiet: boolean
): void {
  if (!writer) return;
  const counters: IDaemonOperationHeaderPayload = headers.takeOperationHeader(writer.taskName);
  const header: string = formatDaemonOperationHeader(
    writer.taskName, counters.completedOperations, counters.totalOperations
  );
  terminal.writeStdoutLine(`\n${header}`);
  if (!quiet) terminal.writeStdoutLine(EMPTY_LINE);
}
