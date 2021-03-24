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
 * Async event
 */
export interface IProfilerAsyncEventOptions {
  cat: string;
  name: string;
  tid: number;
  args?: {
    [key: string]: unknown;
  };
}

/**
 * Writes events in the Chrome Trace Event format to a file.
 */
export class Tracer {
  private readonly _destination: FileWriter;

  private readonly _startTime: number = Utilities.getTimeInMs();
  private _nextAsyncEventId: number = 0;

  public constructor(params: ITracerParameters) {
    const { traceFilePath: logFilePath } = params;

    this._destination = FileWriter.open(logFilePath);
    this._destination.write('[');
  }

  public logAsyncStart(options: IProfilerAsyncEventOptions, startTimeMs: number): void {
    this._destination.write(
      `\n${JSON.stringify({
        ...options,
        ph: 'B',
        pid: 1,
        ts: (startTimeMs - this._startTime) * 1000
      })},`
    );
  }

  public logAsyncEnd(options: IProfilerAsyncEventOptions, endTimeMs: number): void {
    this._destination.write(
      `\n${JSON.stringify({
        ...options,
        ph: 'E',
        pid: 1,
        ts: (endTimeMs - this._startTime) * 1000
      })},`
    );
  }

  public nextAsyncEventId(): number {
    return ++this._nextAsyncEventId;
  }

  public close(): void {
    this._destination.write(']');
    this._destination.close();
  }
}
