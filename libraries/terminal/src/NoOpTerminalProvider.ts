// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminalProvider, TerminalProviderSeverity } from './ITerminalProvider.ts';

/**
 * Terminal provider that stores written data in buffers separated by severity.
 * This terminal provider is designed to be used when code that prints to a terminal
 * is being unit tested.
 *
 * @beta
 */
export class NoOpTerminalProvider implements ITerminalProvider {
  /**
   * {@inheritDoc ITerminalProvider.write}
   */
  public write(data: string, severity: TerminalProviderSeverity): void {
    // no-op
  }

  /**
   * {@inheritDoc ITerminalProvider.eolCharacter}
   */
  public get eolCharacter(): string {
    return '\n';
  }

  /**
   * {@inheritDoc ITerminalProvider.supportsColor}
   */
  public get supportsColor(): boolean {
    return false;
  }
}
