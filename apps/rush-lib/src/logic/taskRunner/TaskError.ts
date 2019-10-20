// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Encapsulates information about an error
 */
export class TaskError extends Error {
  protected _type: string;

  public constructor(type: string, message: string) {
    super(message);

    this._type = type;
  }

  public get message(): string {
    return `[${this._type}] '${super.message}'`;
  }

  public toString(): string {
    return this.message;
  }
}

/**
 * TestTaskError extends TaskError
 */
export class BuildTaskError extends TaskError {
  protected _file: string;
  protected _line: number;
  protected _offset: number;

  public constructor(type: string, message: string, file: string, line: number, offset: number) {
    super(type, message);
    this._file = file;
    this._line = line;
    this._offset = offset;
  }

  public get message(): string {
    // Example: "C:\Project\Blah.ts(123,1): [tslint] error no-any: 'any' is not allowed"
    return `${this._file}(${this._line},${this._offset}): ${super.message}`;
  }

  public toString(): string {
    return this.message;
  }
}
