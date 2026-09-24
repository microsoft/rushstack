import * as fs from 'node:fs';
import { workerData } from 'node:worker_threads';

import {
  STANDARD_ERROR_FRAME_TYPE,
  STANDARD_OUTPUT_FRAME_TYPE,
  writeFrameSynchronously
} from './warmHostFrames';

export interface ICapturedOutputWorkerData {
  readonly standardOutputReadFileDescriptor: number;
  readonly standardErrorReadFileDescriptor: number;
  readonly controlBuffer: SharedArrayBuffer;
}

export const CONTROL_STATE_INDEX: number = 0;
export const CONTROL_SOCKET_FILE_DESCRIPTOR_INDEX: number = 1;
export const WORKER_STATE_WAITING_FOR_A_RUN: number = 0;
export const WORKER_STATE_FORWARDING: number = 1;
export const WORKER_STATE_FINISH_REQUESTED: number = 2;
export const WORKER_STATE_FINISHED: number = 3;

const DRAIN_BUFFER_BYTES: number = 64 * 1024;
const IDLE_POLL_MILLISECONDS: number = 1;

function forwardCapturedOutput(data: ICapturedOutputWorkerData): void {
  const control: Int32Array = new Int32Array(data.controlBuffer);
  const drainBuffer: Buffer = Buffer.allocUnsafe(DRAIN_BUFFER_BYTES);
  Atomics.wait(control, CONTROL_STATE_INDEX, WORKER_STATE_WAITING_FOR_A_RUN);
  const socketFileDescriptor: number = Atomics.load(control, CONTROL_SOCKET_FILE_DESCRIPTOR_INDEX);
  let forwardingHasFailed: boolean = false;

  function drain(readFileDescriptor: number, frameType: number): boolean {
    let forwardedAnything: boolean = false;
    for (;;) {
      let readByteCount: number;
      try {
        readByteCount = fs.readSync(readFileDescriptor, drainBuffer, 0, drainBuffer.length, null);
      } catch {
        return forwardedAnything;
      }
      if (readByteCount === 0) {
        return forwardedAnything;
      }
      forwardedAnything = true;
      if (!forwardingHasFailed) {
        try {
          writeFrameSynchronously(socketFileDescriptor, frameType, drainBuffer.subarray(0, readByteCount));
        } catch {
          forwardingHasFailed = true;
        }
      }
    }
  }

  for (;;) {
    const state: number = Atomics.load(control, CONTROL_STATE_INDEX);
    const forwardedStandardOutput: boolean = drain(
      data.standardOutputReadFileDescriptor,
      STANDARD_OUTPUT_FRAME_TYPE
    );
    const forwardedStandardError: boolean = drain(
      data.standardErrorReadFileDescriptor,
      STANDARD_ERROR_FRAME_TYPE
    );
    if (forwardedStandardOutput || forwardedStandardError) {
      continue;
    }
    if (state === WORKER_STATE_FINISH_REQUESTED) {
      Atomics.store(control, CONTROL_STATE_INDEX, WORKER_STATE_FINISHED);
      Atomics.notify(control, CONTROL_STATE_INDEX);
      return;
    }
    Atomics.wait(control, CONTROL_STATE_INDEX, state, IDLE_POLL_MILLISECONDS);
  }
}

if (workerData) {
  forwardCapturedOutput(workerData as ICapturedOutputWorkerData);
}
