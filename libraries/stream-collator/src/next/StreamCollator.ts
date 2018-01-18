// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* istanbul ignore next */

import * as Stream from 'stream';

enum StreamState {
  Open,
  ClosedUnwritten,
  Written
}

class StreamInfo<T extends NodeJS.ReadableStream> {
  public stream: T;
  public state: StreamState;
  public name: string;
  public buffer: string[];

  constructor(stream: T) {
    this.stream = stream;
    this.buffer = [];
    this.state = StreamState.Open;
  }

  public flush(): string {
    const data: string = this.buffer.join('');
    this.buffer = [];
    return data;
  }
}

/**
 * A class which manages the output of multiple threads.
 *
 * @public
 */
export default class StreamCollator<T extends NodeJS.ReadableStream>
  extends Stream.Readable implements NodeJS.ReadableStream {
  private _streams: StreamInfo<T>[] = [];
  private _activeStream: StreamInfo<T> = undefined;

  public _read(): void {
    /* no-op */
  }

  /**
   * Registers a stream into the list of active buffers.
   */
  public register(stream: T): void {
    const streamState: StreamInfo<T> = new StreamInfo<T>(stream);

    stream.on('end', this._streamEnd(streamState));
    stream.on('data', this._streamData(streamState));

    this._streams.push(streamState);
    this._ensureActiveTask();
  }

  /**
   * Locates a suitable stream which could be set as the new active stream
   */
  private _findActiveTaskCandidate(): StreamInfo<T> {
    for (const stream of this._streams) {
      if (stream.state === StreamState.Open && stream !== this._activeStream) {
        return stream;
      }
    }
  }

  /**
   * Ensures that a stream is set as active, will set the passed in stream as the active stream if none exists
   */
  private _ensureActiveTask(): void {
    if (!this._activeStream) {
      const stream: StreamInfo<T> = this._findActiveTaskCandidate();
      this._activeStream = stream;

      // In some cases there may be no streams which we can make active
      if (stream) {
        this._writeTaskBuffer(stream);
      }
    }
  }

  /**
   * Flushes a streams buffer and writes it to disk
   */
  private _writeTaskBuffer(stream: StreamInfo<T>): void {
    if (stream.buffer.length) {
      this.push(stream.flush());
    }
  }

  /**
   * The on('data') callback handler, which either writes or buffers the data
   */
  private _streamData(stream: StreamInfo<T>): (data: string | Buffer) => void {
    return (data: string | Buffer) => {
      if (this._activeStream === stream) {
        this.push(data.toString());
      } else {
        stream.buffer.push(data.toString());
      }
    };
  }

  /**
   * Marks a stream as completed. There are 3 cases:
   *  - If the stream was the active stream, also write out all completed, unwritten streams
   *  - If there is no active stream, write the output to the screen
   *  - If there is an active stream, mark the stream as completed and wait for active stream to complete
   */
  private _streamEnd(stream: StreamInfo<T>): () => void {
    return () => {
      if (stream === this._activeStream) {
        this._writeAllCompletedTasks();

        stream.state = StreamState.Written;

        this._activeStream = undefined;
        this._ensureActiveTask();
      } else {
        stream.state = StreamState.ClosedUnwritten;
      }

      // Close this if all substreams are closed
      if (this._areStreamsClosedAndWritten()) {
        this.push(null); // tslint:disable-line
      }
    };
  }

  /**
   * Helper function which returns true if all streams have been closed
   */
  private _areStreamsClosedAndWritten(): boolean {
    for (const streamInfo of this._streams) {
      if (streamInfo.state !== StreamState.Written) {
        return false;
      }
    }
    return true;
  }

  /**
   * Helper function which writes all completed streams
   */
  private _writeAllCompletedTasks(): void {
    for (const stream of this._streams) {
      if (stream && stream.state === StreamState.ClosedUnwritten) {
        this._writeTaskBuffer(stream);
        stream.state = StreamState.Written;
      }
    }
  }
}
