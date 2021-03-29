// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileWriter } from '@rushstack/node-core-library';
import { Utilities } from '../../utilities/Utilities';

export interface ITracerParameters {
  traceFilePath: string;
}

/**
 * Chrome Trace Event Format
 * https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU/preview
 *
 * Duration event
 */
export interface ITraceCompleteEventOptions {
  cat: string;
  name: string;
  tid: number;
  args?: {
    [key: string]: unknown;
  };
}

export interface ITraceCounterEventOptions {
  cat: string;
  name: string;
  id?: number;
  args: {
    [key: string]: number;
  };
}

/**
 * Writes events in the Chrome Trace Event format to a file.
 */
export class Tracer {
  private readonly _destination: FileWriter;

  private readonly _startTime: number;

  public constructor(params: ITracerParameters) {
    const { traceFilePath: logFilePath } = params;

    const now: number = Utilities.getTimeInMs();
    const running: number = process.uptime();
    this._startTime = now - running * 1e3;

    this._destination = FileWriter.open(logFilePath);
    this._destination.write(
      `[${JSON.stringify({
        args: {
          name: 'Rush'
        },
        cat: '__metadata',
        name: 'thread_name',
        tid: 0,
        ph: 'M',
        pid: process.pid,
        ts: 0
      })}`
    );

    const bootEvent: ITraceCompleteEventOptions = {
      cat: 'devtools.timeline',
      name: 'boot',
      tid: 0
    };

    this.logCompleteEvent(bootEvent, this._startTime, now);

    process.on('exit', () => {
      this.close();
    });
  }

  public logCompleteEvent(options: ITraceCompleteEventOptions, startTimeMs: number, endTimeMs: number): void {
    this._destination.write(
      `,\n${JSON.stringify({
        ...options,
        ph: 'B',
        pid: process.pid,
        ts: startTimeMs * 1e3,
        dur: (endTimeMs - startTimeMs) * 1e3
      })}`
    );
  }

  public logCounterEvent(options: ITraceCounterEventOptions, timeMs: number): void {
    this._destination.write(
      `,\n${JSON.stringify({
        ...options,
        ph: 'C',
        pid: process.pid,
        ts: timeMs * 1000
      })}`
    );
  }

  public close(): void {
    this._destination.write(']');
    this._destination.close();
  }
}
