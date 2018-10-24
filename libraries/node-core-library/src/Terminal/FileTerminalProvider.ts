// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminalProvider } from './ITerminalProvider';
import { FileSystem } from '../FileSystem';

/**
 * @beta
 */
export class FileTerminalProvider implements ITerminalProvider {
  private _filePath: string;

  public constructor(filePath: string) {
    this._filePath = filePath;
  }

  public write(data: string): void {
    try {
      FileSystem.appendToFile(this._filePath, data);
    } catch (e) {
      // Ignore
    }
  }

  public get width(): number | undefined {
    return undefined;
  }

  public get supportsColor(): boolean {
    return false;
  }
}
