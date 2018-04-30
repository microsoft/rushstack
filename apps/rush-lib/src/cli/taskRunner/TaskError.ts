// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Encapsulates information about an error
 * @public
 */
export class TaskError {
  protected _type: string;
  protected _message: string;

  constructor(type: string, message: string) {
    this._type = type;
    this._message = message;
  }

  public toString(): string {
    return `[${this._type}] '${this._message}'`;
  }
}

/**
 * TestTaskError extends TaskError
 * @public
 */
export class BuildTaskError extends TaskError {
  protected _file: string;
  protected _line: number;
  protected _offset: number;

  constructor(type: string, message: string, file: string, line: number, offset: number) {
    super(type, message);
    this._file = file;
    this._line = line;
    this._offset = offset;
  }

  public toString(): string {
    // Example: "C:\Project\Blah.ts(123,1): [tslint] error no-any: 'any' is not allowed"
    return `${this._file}(${this._line},${this._offset}): [${this._type}] ${this._message}`;
  }
}