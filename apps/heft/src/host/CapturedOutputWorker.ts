import * as path from 'node:path';
import { Worker } from 'node:worker_threads';

import {
  CONTROL_SOCKET_FILE_DESCRIPTOR_INDEX,
  CONTROL_STATE_INDEX,
  WORKER_STATE_FINISH_REQUESTED,
  WORKER_STATE_FORWARDING,
  type ICapturedOutputWorkerData
} from './capturedOutputWorkerThread';

const FINISH_TIMEOUT_MILLISECONDS: number = 2000;
const CONTROL_SLOT_COUNT: number = 2;

export class CapturedOutputWorker {
  readonly #control: Int32Array = new Int32Array(
    new SharedArrayBuffer(CONTROL_SLOT_COUNT * Int32Array.BYTES_PER_ELEMENT)
  );

  public constructor(standardOutputReadFileDescriptor: number, standardErrorReadFileDescriptor: number) {
    const capturedOutputWorkerData: ICapturedOutputWorkerData = {
      standardOutputReadFileDescriptor,
      standardErrorReadFileDescriptor,
      controlBuffer: this.#control.buffer as SharedArrayBuffer
    };
    const worker: Worker = new Worker(path.join(__dirname, 'capturedOutputWorkerThread.js'), {
      workerData: capturedOutputWorkerData,
      stdout: true,
      stderr: true
    });
    worker.on('error', () => undefined);
    worker.unref();
  }

  public startForwardingTo(socketFileDescriptor: number): void {
    Atomics.store(this.#control, CONTROL_SOCKET_FILE_DESCRIPTOR_INDEX, socketFileDescriptor);
    Atomics.store(this.#control, CONTROL_STATE_INDEX, WORKER_STATE_FORWARDING);
    Atomics.notify(this.#control, CONTROL_STATE_INDEX);
  }

  public finishForwarding(): void {
    Atomics.store(this.#control, CONTROL_STATE_INDEX, WORKER_STATE_FINISH_REQUESTED);
    Atomics.notify(this.#control, CONTROL_STATE_INDEX);
    Atomics.wait(
      this.#control,
      CONTROL_STATE_INDEX,
      WORKER_STATE_FINISH_REQUESTED,
      FINISH_TIMEOUT_MILLISECONDS
    );
  }
}
