// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Terminal } from '@rushstack/node-core-library';
import { performance } from 'perf_hooks';

export class Logging {
  public static async runFunctionWithLoggingBoundsAsync(
    terminal: Terminal,
    name: string,
    fn: () => Promise<void>
  ): Promise<void> {
    terminal.writeLine(` ---- ${name} started ---- `);
    const startTime: number = performance.now();
    let finishedLoggingWord: string = 'finished';
    try {
      await fn();
    } catch (e) {
      finishedLoggingWord = 'encountered an error';
      throw e;
    } finally {
      const executionTime: number = Math.round(performance.now() - startTime);
      terminal.writeLine(` ---- ${name} ${finishedLoggingWord} (${executionTime}ms) ---- `);
    }
  }
}
