// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Colorize, type ITerminal } from '@rushstack/terminal';
import type { IPhasedCommandPlugin, PhasedCommandHooks } from '../../pluginFramework/PhasedCommandHooks';
import type { Operation } from './Operation';
import type { IOperationExecutionResult } from './IOperationExecutionResult';

const PLUGIN_NAME: 'DebugHashesPlugin' = 'DebugHashesPlugin';

function sortOperationEntriesByName(
  a: [Operation, IOperationExecutionResult],
  b: [Operation, IOperationExecutionResult]
): number {
  const aName: string = a[0].name;
  const bName: string = b[0].name;
  return aName === bName ? 0 : aName < bName ? -1 : 1;
}

export class DebugHashesPlugin implements IPhasedCommandPlugin {
  private readonly _terminal: ITerminal;

  public constructor(terminal: ITerminal) {
    this._terminal = terminal;
  }

  public apply(hooks: PhasedCommandHooks): void {
    hooks.beforeExecuteOperations.tap(
      PLUGIN_NAME,
      (operations: Map<Operation, IOperationExecutionResult>) => {
        const terminal: ITerminal = this._terminal;
        terminal.writeLine(Colorize.blue(`===== Begin Hash Computation =====`));

        const sortedOperations: [Operation, IOperationExecutionResult][] =
          Array.from(operations).sort(sortOperationEntriesByName);
        for (const [operation, record] of sortedOperations) {
          terminal.writeLine(Colorize.cyan(`--- ${operation.name} ---`));
          record.getStateHashComponents().forEach((component) => {
            terminal.writeLine(component);
          });
          terminal.writeLine(Colorize.green(`Result: ${record.getStateHash()}`));
          // Add a blank line between operations to visually separate them
          terminal.writeLine();
        }
        terminal.writeLine(Colorize.blue(`===== End Hash Computation =====`));
      }
    );
  }
}
