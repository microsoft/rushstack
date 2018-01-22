// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* istanbul ignore next */

import * as colors from 'colors';
import * as stream from 'stream';

import PersistentStream from './PersistentStream';

/**
 * This is a special type of stream class which has two substreams (stderr and stdout), which you can write to.
 * The DualTaskStream will merge these two streams into a single readable stream.
 * Everything written to stderr is written in red, unless it is a Warning, in which case it appears in yellow.
 *
 * @public
 */
export default class DualTaskStream extends stream.Readable implements NodeJS.ReadableStream, NodeJS.EventEmitter {
  public stdout: PersistentStream;
  public stderr: PersistentStream;

  private _quietMode: boolean;
  private _stdoutClosed: boolean;
  private _stderrClosed: boolean;
  private _closed: boolean;

  /**
   * @param quietMode - true if things written to stdout (and warnings) should be ignored
   */
  constructor(quietMode: boolean = false) {
    super();
    this._quietMode = quietMode;
    this.stdout = new PersistentStream();
    this.stderr = new PersistentStream();

    this.stdout.on('finish', () => {
      this._stdoutClosed = true;
    });
    this.stderr.on('finish', () => {
      this._stderrClosed = true;
    });

    this.stdout.on('data', (data: Buffer | string, encoding) => {
      if (!this._quietMode) {
        this.push(data);
      }
    });

    this.stderr.on('data', (data: Buffer | string, encoding) => {
      const text: string = data.toString();
      if (text.indexOf('Warning - ') === 0) {
        this.stdout.write(colors.yellow(text));
      } else {
        this.push(colors.red(text));
      }
    });
  }

  public _read(): void {
    // No-op
  }

  /**
   * Closes both substreams and closes the readable stream
   */
  public end(): void {
    if (!this._stdoutClosed) {
      this.stdout.end();
    }
    if (!this._stderrClosed) {
      this.stderr.end();
    }
    // End the stream
    if (!this._closed) {
      this._closed = true;
      this.push(null); // tslint:disable-line:no-null-keyword
    }
  }
}