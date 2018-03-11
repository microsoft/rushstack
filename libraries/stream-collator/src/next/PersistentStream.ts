// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* istanbul ignore next */

import * as stream from 'stream';

/**
 * A special type of stream which keeps track of everything written to it, which can be read with the readAll() function
 *
 * @public
 */
export default class PersistentStream extends stream.Transform {
  private _buffer: string[] = [];

  constructor(opts?: stream.TransformOptions) {
    super(opts);
  }

  public _transform(chunk: Buffer | String, encoding: string, done: (err?: Object, data?: Object) => void): void {
    this._buffer.push(chunk.toString());
    done(undefined, chunk.toString());
  }

  public readAll(): string {
    return this._buffer.join('');
  }
}
