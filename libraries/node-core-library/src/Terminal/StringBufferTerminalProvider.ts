// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminalProvider, TerminalProviderSeverity } from './ITerminalProvider';
import { StringBuilder } from '../StringBuilder';
import { Text } from '../Text';

/**
 * Terminal provider that stores written data in buffers separated by severity.
 * This terminal provider is designed to be used when code that prints to a terminal
 * is being unit tested.
 *
 * @beta
 */
export class StringBufferTerminalProvider implements ITerminalProvider {
  private _standardBuffer: StringBuilder = new StringBuilder();
  private _verboseBuffer: StringBuilder = new StringBuilder();
  private _warningBuffer: StringBuilder = new StringBuilder();
  private _errorBuffer: StringBuilder = new StringBuilder();

  private _supportsColor: boolean;

  public constructor(supportsColor: boolean = false) {
    this._supportsColor = supportsColor;
  }

  /**
   * {@inheritDoc ITerminalProvider.write}
   */
  public write(data: string, severity: TerminalProviderSeverity): void {
    switch (severity) {
      case TerminalProviderSeverity.warning: {
        this._warningBuffer.append(data);
        break;
      }

      case TerminalProviderSeverity.error: {
        this._errorBuffer.append(data);
        break;
      }

      case TerminalProviderSeverity.verbose: {
        this._verboseBuffer.append(data);
        break;
      }

      case TerminalProviderSeverity.log:
      default: {
        this._standardBuffer.append(data);
        break;
      }
    }
  }

  /**
   * {@inheritDoc ITerminalProvider.eolCharacter}
   */
  public get eolCharacter(): string {
    return '[n]';
  }

  /**
   * {@inheritDoc ITerminalProvider.supportsColor}
   */
  public get supportsColor(): boolean {
    return this._supportsColor;
  }

  /**
   * Get everything that has been written at log-level severity.
   */
  public getOutput(): string {
    return this._normalizeOutput(this._standardBuffer.toString());
  }

  /**
   * Get everything that has been written at verbose-level severity.
   */
  public getVerbose(): string {
    return this._normalizeOutput(this._verboseBuffer.toString());
  }

  /**
   * Get everything that has been written at error-level severity.
   */
  public getErrorOutput(): string {
    return this._normalizeOutput(this._errorBuffer.toString());
  }

  /**
   * Get everything that has been written at warning-level severity.
   */
  public getWarningOutput(): string {
    return this._normalizeOutput(this._warningBuffer.toString());
  }

  private _normalizeOutput(s: string): string { // tslint:disable-line:export-name
    return Text.convertToLf(s)
      .replace(/\u001b/g, '[x]')
      .replace(/\n/g, '[-n-]')
      .replace(/\r/g, '[-r-]');
  }
}
