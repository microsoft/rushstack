// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Shared client-side frame dispatch: decoded frames into a renderer host.

import { DaemonFrameType, decodeDaemonEventFrame, decodeDaemonLogChunk } from '@rushstack/rush-daemon-protocol';
import type { IDaemonFrame, IDaemonLogChunk } from '@rushstack/rush-daemon-protocol';
import type { DaemonRendererHost } from '@rushstack/rush-terminal-renderer';

const WIRE_DECODER: InstanceType<typeof TextDecoder> = new TextDecoder();

/** Returns true for `0x02`/`0x03` log frames. */
export function isLogFrame(frame: IDaemonFrame): boolean {
  return frame.kind === DaemonFrameType.logStdout || frame.kind === DaemonFrameType.logStderr;
}

/** Maps a log frame type to its stream name. */
export function toStream(frame: IDaemonFrame): 'stdout' | 'stderr' {
  return frame.kind === DaemonFrameType.logStderr ? 'stderr' : 'stdout';
}

/** Routes one decoded frame into the renderer host. */
export function dispatchFrame(host: DaemonRendererHost, frame: IDaemonFrame): void {
  if (frame.kind === DaemonFrameType.event) {
    host.handleEvent(decodeDaemonEventFrame(frame.payload));
    return;
  }
  if (isLogFrame(frame)) {
    const log: IDaemonLogChunk = decodeDaemonLogChunk(frame.payload);
    host.handleLogChunk(log.operationId, toStream(frame), log.chunk);
  }
}

/** Collects log frame payloads into per-operation ordered text chunks. */
export function collectLogChunk(perOperation: Map<string, string[]>, frame: IDaemonFrame): void {
  if (!isLogFrame(frame)) {
    return;
  }
  const log: IDaemonLogChunk = decodeDaemonLogChunk(frame.payload);
  const chunks: string[] = perOperation.get(log.operationId) ?? [];
  chunks.push(WIRE_DECODER.decode(log.chunk));
  perOperation.set(log.operationId, chunks);
}
