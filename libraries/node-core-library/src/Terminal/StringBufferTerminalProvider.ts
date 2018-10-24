// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminalProvider, Severity } from './ITerminalProvider';

/**
 * @beta
 */
export class StringBufferTerminalProvider implements ITerminalProvider {
  private _standardBuffer: string[] = [];
  private _warningBuffer: string[] = [];
  private _errorBuffer: string[] = [];

  private _supportsColor: boolean;

  public constructor(supportsColor: boolean = false) {
    this._supportsColor = supportsColor;
  }

  public write(data: string, severity: Severity): void {
    switch (severity) {
      case Severity.warn: {
        this._warningBuffer.push(data);
        break;
      }

      case Severity.error: {
        this._errorBuffer.push(data);
        break;
      }

      case Severity.log:
      default: {
        this._standardBuffer.push(data);
        break;
      }
    }
  }

  public get width(): number | undefined {
    return process.stdout.columns;
  }

  public get supportsColor(): boolean {
    return this._supportsColor;
  }

  public clear(): void {
    this._standardBuffer = [];
    this._warningBuffer = [];
    this._errorBuffer = [];
  }

  public getOutput(): string {
    const combinedBuffer: string = this._standardBuffer.join('');
    this._standardBuffer = [combinedBuffer];
    return combinedBuffer;
  }

  public getErrorOutput(): string {
    const combinedBuffer: string = this._errorBuffer.join('');
    this._standardBuffer = [combinedBuffer];
    return combinedBuffer;
  }

  public getWarningOutput(): string {
    const combinedBuffer: string = this._warningBuffer.join('');
    this._standardBuffer = [combinedBuffer];
    return combinedBuffer;
  }
}
